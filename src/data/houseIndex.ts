import { pickOfficialHits } from "../api/zagrebAddresses"
import { fold, rankHits, streetMatches, type ParsedQuery, type PhotonHit } from "../lib/addressQuery"
import type { GeocodeResult, LatLng } from "../types/places"

export interface HousePack {
  s: string[]
  a: string[]
  r: Array<[number, string, number, number, number]>
}

interface Bucket {
  name: string
  folded: string
  houses: PhotonHit[]
}

let buckets: Bucket[] | null = null
let byPrefix = new Map<string, Bucket[]>()
let loading: Promise<void> | null = null

function sample(name: string): PhotonHit {
  return {
    lat: 0,
    lng: 0,
    name: "",
    street: name,
    housenumber: "",
    locality: "",
    district: "",
    city: "Zagreb",
    kind: "house",
    addressPoint: true,
  }
}

export function installHousePack(pack: HousePack): void {
  const next: Bucket[] = pack.s.map((name) => ({ name, folded: fold(name), houses: [] }))
  for (const row of pack.r) {
    const street = next[row[0]]
    if (!street) continue
    street.houses.push({
      lat: row[2] / 1e5,
      lng: row[3] / 1e5,
      name: "",
      street: street.name,
      housenumber: row[1],
      locality: "",
      district: pack.a[row[4]] ?? "",
      city: "Zagreb",
      kind: "house",
      addressPoint: true,
    })
  }
  const prefixes = new Map<string, Bucket[]>()
  for (const street of next) {
    if (!street.houses.length) continue
    const keys = new Set<string>()
    for (const token of street.folded.split(" ")) {
      if (token.length >= 4) keys.add(token.slice(0, 4))
    }
    for (const key of keys) {
      const list = prefixes.get(key)
      if (list) list.push(street)
      else prefixes.set(key, [street])
    }
  }
  buckets = next.filter((street) => street.houses.length)
  byPrefix = prefixes
}

export function houseIndexReady(): boolean {
  return buckets != null
}

export function warmHouseIndex(): void {
  if (buckets || loading || typeof fetch !== "function") return
  loading = fetch("/data/houses.json")
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status))
      return response.json() as Promise<HousePack>
    })
    .then((pack) => installHousePack(pack))
    .catch(() => undefined)
    .finally(() => {
      loading = null
    })
}

function candidates(streetQuery: string): Bucket[] {
  if (!buckets) return []
  const folded = fold(streetQuery)
  const tokens = folded.split(" ").filter((token) => token.length >= 4)
  if (!tokens.length) {
    return buckets.filter((street) => street.folded.split(" ").some((word) => word.startsWith(folded)))
  }
  const seen = new Set<Bucket>()
  for (const token of tokens) {
    for (const street of byPrefix.get(token.slice(0, 4)) ?? []) seen.add(street)
  }
  return [...seen]
}

/** null dok indeks nije učitan. Prazno polje znači da je učitan, ali nema pogotka. */
export function searchIndexedHouses(parsed: ParsedQuery, bias: LatLng): GeocodeResult[] | null {
  if (!parsed.house || !buckets) return null
  const hits: PhotonHit[] = []
  for (const street of candidates(parsed.street)) {
    if (!streetMatches(parsed.street, sample(street.name))) continue
    hits.push(...street.houses)
  }
  if (!hits.length) return []
  return rankHits(pickOfficialHits(hits, hits, parsed, bias), parsed, bias)
}
