import { fold } from "../lib/addressQuery"
import type { GeocodeResult } from "../types/places"

interface CatalogPlace {
  title: string
  subtitle: string
  lat: number
  lng: number
  aliases: string[]
}

/** Koordinate su iz Photona (OSM). Mall of Croatia nije u Zagrebu pa nije na popisu. */
const PLACES: CatalogPlace[] = [
  {
    title: "Fakultet elektrotehnike i računarstva",
    subtitle: "Unska 3, Trnje",
    lat: 45.80059,
    lng: 15.97112,
    aliases: ["fer", "fakultet elektrotehnike", "fakultet elektrotehnike i racunarstva", "unska 3", "unska"],
  },
  {
    title: "Filozofski fakultet",
    subtitle: "Ivana Lučića 3, Trešnjevka",
    lat: 45.79639,
    lng: 15.97163,
    aliases: ["ffzg", "filozofski", "filozofski fakultet"],
  },
  {
    title: "Prirodoslovno-matematički fakultet",
    subtitle: "Bijenička cesta, Zagreb",
    lat: 45.82695,
    lng: 15.98623,
    aliases: ["pmf", "prirodoslovno matematicki fakultet"],
  },
  {
    title: "Fakultet strojarstva i brodogradnje",
    subtitle: "Ivana Lučića 5, Trešnjevka",
    lat: 45.79522,
    lng: 15.97217,
    aliases: ["fsb", "fakultet strojarstva", "fakultet strojarstva i brodogradnje"],
  },
  {
    title: "Ekonomski fakultet",
    subtitle: "Trg J. F. Kennedyja 6, Maksimir",
    lat: 45.81645,
    lng: 16.01202,
    aliases: ["efzg", "ekonomski fakultet", "ekonomski"],
  },
  {
    title: "Prehrambeno-biotehnološki fakultet",
    subtitle: "Pierottijeva 6, Centar",
    lat: 45.80697,
    lng: 15.96423,
    aliases: ["pbf", "prehrambeno biotehnoloski fakultet"],
  },
  {
    title: "Fakultet kemijskog inženjerstva i tehnologije",
    subtitle: "Marulićev trg 19, Centar",
    lat: 45.80705,
    lng: 15.97059,
    aliases: ["fkit", "fakultet kemijskog inzenjerstva"],
  },
  {
    title: "Građevinski fakultet",
    subtitle: "Fra Andrije Kačića Miošića 26, Črnomerec",
    lat: 45.82509,
    lng: 15.93764,
    aliases: ["grad", "gradevinski fakultet"],
  },
  {
    title: "Medicinski fakultet",
    subtitle: "Šalata 3, Gornji grad",
    lat: 45.82009,
    lng: 15.98491,
    aliases: ["mef", "medicinski fakultet"],
  },
  {
    title: "Pravni fakultet",
    subtitle: "Trg Republike Hrvatske 14, Centar",
    lat: 45.81059,
    lng: 15.96988,
    aliases: ["pravni fakultet", "pravni"],
  },
  {
    title: "Akademija dramske umjetnosti",
    subtitle: "Trg Republike Hrvatske 5, Centar",
    lat: 45.80861,
    lng: 15.97029,
    aliases: ["adu", "akademija dramske umjetnosti", "akademija dramskih umjetnosti"],
  },
]

function initials(value: string): string {
  return fold(value)
    .split(/[\s-]+/)
    .filter((word) => word.length > 2)
    .map((word) => word[0])
    .join("")
}

function wordStarts(text: string, token: string): boolean {
  return text.split(" ").some((word) => word.startsWith(token))
}

function scorePlace(place: CatalogPlace, query: string): number {
  const title = fold(place.title)
  const aliases = place.aliases.map((alias) => fold(alias))
  const hay = [title, ...aliases]
  if (hay.some((item) => item === query)) return 1000
  if (!query.includes(" ") && initials(place.title) === query) return 900
  if (hay.some((item) => item.startsWith(query) || wordStarts(item, query))) return 700
  const tokens = query.split(" ").filter((token) => token.length >= 3)
  if (tokens.length > 1 && tokens.every((token) => hay.some((item) => wordStarts(item, token)))) return 500
  return 0
}

export function searchPlaces(query: string): GeocodeResult[] {
  const folded = fold(query).replace(/\s+/g, " ").trim()
  if (folded.length < 2) return []
  return PLACES.map((place) => ({ place, score: scorePlace(place, folded) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ place }) => ({
      label: place.title,
      title: place.title,
      subtitle: `${place.subtitle}, Zagreb`,
      lat: place.lat,
      lng: place.lng,
    }))
}
