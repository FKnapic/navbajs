import { clearGeocodeCache, geocode } from "../src/api/geocode"
import { haversineM } from "../src/lib/geo"

interface Sample {
  query: string
  district: string
  lat?: number
  lng?: number
  note?: string
}

const samples: Sample[] = [
  { query: "Ilica 10", district: "Donji grad", lat: 45.81314, lng: 15.97447 },
  { query: "Ilica 50", district: "Donji grad", lat: 45.81333, lng: 15.9684 },
  { query: "Ilica 101", district: "Črnomerec", lat: 45.812728, lng: 15.960575 },
  { query: "Ilica 242", district: "Črnomerec", lat: 45.814665, lng: 15.93468, note: "broj 242 ne postoji, očekivan je prolaz između 241 i 245" },
  { query: "Tkalčićeva 12", district: "Gornji grad", lat: 45.81447, lng: 15.97618 },
  { query: "Radićeva 4", district: "Gornji grad", note: "nema u službenom sloju" },
  { query: "Vlaška 40", district: "Donji grad", lat: 45.81385, lng: 15.98287 },
  { query: "Petrinjska 2", district: "Donji grad", lat: 45.81224, lng: 15.97895 },
  { query: "Gundulićeva 8", district: "Donji grad", lat: 45.81204, lng: 15.97194 },
  { query: "Masarykova 15", district: "Donji grad", lat: 45.81062, lng: 15.97252 },
  { query: "Gajeva 4", district: "Donji grad", lat: 45.81181, lng: 15.97626 },
  { query: "Jurišićeva 4", district: "Donji grad", lat: 45.81232, lng: 15.97943 },
  { query: "Praška 5", district: "Donji grad", lat: 45.81204, lng: 15.97765 },
  { query: "Bogovićeva 1", district: "Donji grad", lat: 45.81211, lng: 15.97604 },
  { query: "Savska cesta 25", district: "Trešnjevka", lat: 45.80385, lng: 15.96576 },
  { query: "Savska cesta 141", district: "Trešnjevka", lat: 45.79157, lng: 15.95713 },
  { query: "Ozaljska 12", district: "Trešnjevka", lat: 45.79984, lng: 15.95261 },
  { query: "Tratinska 20", district: "Trešnjevka", lat: 45.80285, lng: 15.96137 },
  { query: "Selska cesta 40", district: "Trešnjevka", lat: 45.80912, lng: 15.942175, note: "broj 40 ne postoji, očekivan je prolaz između 39 i 41" },
  { query: "Fallerovo šetalište 8", district: "Trešnjevka", lat: 45.8071, lng: 15.93502 },
  { query: "Vukovarska 58", district: "Trnje", lat: 45.79939, lng: 15.96646 },
  { query: "Vukovarska 200", district: "Trnje", note: "nema u službenom sloju" },
  { query: "Radnička cesta 50", district: "Trnje" },
  { query: "Slavonska avenija 6", district: "Trnje" },
  { query: "Heinzelova 33", district: "Maksimir", lat: 45.81097, lng: 16.00168 },
  { query: "Heinzelova 60", district: "Maksimir", lat: 45.80834, lng: 16.00381 },
  { query: "Maksimirska 40", district: "Maksimir", lat: 45.81617, lng: 16.00214 },
  { query: "Maksimirska 120", district: "Maksimir", lat: 45.818502, lng: 16.012581 },
  { query: "Šubićeva 20", district: "Maksimir", lat: 45.81002, lng: 15.99322 },
  { query: "Draškovićeva 25", district: "Maksimir", lat: 45.80921, lng: 15.98394 },
  { query: "Draškovićeva 80", district: "Maksimir", lat: 45.806169, lng: 15.983817 },
  { query: "Jarunska 2", district: "Trešnjevka", lat: 45.78494, lng: 15.94736 },
  { query: "Horvaćanska 17", district: "Trešnjevka", lat: 45.7874, lng: 15.95169 },
  { query: "Prilaz baruna Filipovića 10", district: "Črnomerec", lat: 45.81167, lng: 15.94718 },
  { query: "Avenija Dubrovnik 15", district: "Novi Zagreb", lat: 45.77777, lng: 15.96858 },
  { query: "Avenija Dubrovnik 120", district: "Novi Zagreb", note: "nema u službenom sloju" },
  { query: "Siget 18", district: "Novi Zagreb", lat: 45.77181, lng: 15.96797, note: "nema čistog broja 18, najbliži je 18A" },
  { query: "Remetinečka cesta 7", district: "Novi Zagreb", lat: 45.782349, lng: 15.955553 },
  { query: "Jadranska avenija 16", district: "Novi Zagreb", note: "nema kućnog broja 16" },
  { query: "Ulica kneza Branimira 20", district: "Trnje", lat: 45.805585, lng: 15.98312, note: "broj 20 ne postoji, očekivan je prolaz između 19 i 21" },
  { query: "Nova cesta 10", district: "Dubrava", lat: 45.81291, lng: 16.11968, note: "u Dubravi nema tog broja, jedini u gradu je Sesvete" },
  { query: "Avenija Dubrava 15", district: "Dubrava", note: "ulica nije u službenom sloju" },
  { query: "Dubrava 30", district: "Dubrava", lat: 45.82528, lng: 16.04221 },
  { query: "Oporovečka 15", district: "Dubrava", lat: 45.83155, lng: 16.03811 },
  { query: "Varaždinska cesta 10", district: "Sesvete", lat: 45.82804, lng: 16.11275 },
  { query: "Ljudevita Posavskog 8", district: "Sesvete", lat: 45.80825, lng: 15.99284 },
  { query: "Sesvetska cesta 20", district: "Sesvete", lat: 45.82368, lng: 16.12654 },
  { query: "Aleja Bologne 5", district: "Podsused", lat: 45.812815, lng: 15.89583, note: "broj 5 ne postoji, očekivan je prolaz između 2 i 6" },
  { query: "Podsusedska 10", district: "Podsused", lat: 45.81649, lng: 15.83642 },
  { query: "Ilica 400", district: "Podsused", lat: 45.81179, lng: 15.91781 },
]

const layer =
  "https://arcportal.zagreb.hr/server/rest/services/DKPiRPJ/KBR_ku%C4%87ni_broj/MapServer/1/query"

async function officialPoint(street: string, kb: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL(layer)
  url.searchParams.set("where", `UL_IME='${street}' AND KB='${kb}' AND NA_IME='Zagreb'`)
  url.searchParams.set("outFields", "UL_IME,KB")
  url.searchParams.set("returnGeometry", "true")
  url.searchParams.set("outSR", "4326")
  url.searchParams.set("f", "pjson")
  const body = (await (await fetch(url, { signal: AbortSignal.timeout(20000) })).json()) as {
    features?: Array<{ geometry?: { x: number; y: number } }>
  }
  const geometry = body.features?.[0]?.geometry
  if (!geometry) return null
  return { lat: geometry.y, lng: geometry.x }
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const lookups: Record<string, [string, string]> = {
  "Radnička cesta 50": ["Radnička cesta", "50"],
  "Slavonska avenija 6": ["Slavonska avenija", "6"],
}

for (const sample of samples) {
  const lookup = lookups[sample.query]
  if (!lookup || sample.lat != null) continue
  const point = await officialPoint(lookup[0], lookup[1])
  if (point) {
    sample.lat = point.lat
    sample.lng = point.lng
  } else sample.note = "nema u službenom sloju"
  await pause(200)
}

const rows: string[] = []
let within = 0

for (const sample of samples) {
  await pause(200)
  clearGeocodeCache()
  try {
    const results = await geocode(sample.query)
    const first = results[0]
    if (sample.lat == null || sample.lng == null) {
      rows.push(`| ${sample.query} | ${first?.label ?? "—"} | ne | — | ${sample.note ?? "nema očekivane točke"} |`)
      continue
    }
    const distance = first ? haversineM(first, { lat: sample.lat, lng: sample.lng }) : Infinity
    const ok = distance <= 50
    if (ok) within += 1
    const cause = ok ? "" : !first ? "nema prijedloga" : first.approximate ? "približna točka" : "loše rangiranje"
    rows.push(
      `| ${sample.query} | ${first?.label ?? "—"} | ${ok ? "da" : "ne"} | ${Number.isFinite(distance) ? distance.toFixed(0) : "—"} m | ${cause} |`,
    )
  } catch (error) {
    rows.push(`| ${sample.query} | greška | ne | — | ${error instanceof Error ? error.message : "mreža"} |`)
  }
}

const percent = Math.round((within / samples.length) * 1000) / 10
console.log("| Upit | Prvi rezultat | Točno | Udaljenost | Uzrok |")
console.log("| --- | --- | --- | --- | --- |")
console.log(rows.join("\n"))
console.log("")
console.log(`Točno unutar 50 m: ${within}/${samples.length} (${percent}%).`)
