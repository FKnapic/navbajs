import { readFileSync } from "node:fs"
import { performance } from "node:perf_hooks"

const win = globalThis as unknown as { window: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } }
win.window = { setTimeout, clearTimeout }

type Row = { url: string; ms: number; status: number; bytes: number }
const rows: Row[] = []
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input)
  const started = performance.now()
  const response = await originalFetch(input, init)
  const bytes = Number(response.headers.get("content-length") ?? 0)
  rows.push({
    url: url.replace(/^https?:\/\/[^/]+/, ""),
    ms: Math.round(performance.now() - started),
    status: response.status,
    bytes,
  })
  return response
}

const { ValhallaRoutingProvider } = await import("../src/routing/ValhallaRoutingProvider.ts")
const { planTrip } = await import("../src/routing/planner.ts")
const { buildLaneIndex } = await import("../src/api/lanes.ts")

const stationPayload = (await (await originalFetch("http://127.0.0.1:8787/api/bajs")).json()) as {
  stations: Array<{
    id: number
    number: number
    name: string
    lat: number
    lng: number
    bikes: number
    bikesOnSite: number
    freeRacks: number
    racks: number
    maintenance: boolean
  }>
}
const osm = JSON.parse(readFileSync("public/data/osm-parking.json", "utf8")) as Array<{
  id: string
  lat: number
  lng: number
  name?: string | null
}>
const parkings = osm.map((item) => ({
  id: item.id,
  name: item.name?.trim() || "OSM parkiralište za bicikle",
  location: null,
  kind: null,
  racks: null,
  capacity: null,
  year: null,
  district: null,
  neighborhood: null,
  covered: null,
  lat: item.lat,
  lng: item.lng,
  source: "osm" as const,
}))

const laneStarted = performance.now()
const lanes = JSON.parse(readFileSync("public/data/lanes.geojson", "utf8"))
const laneParseMs = Math.round(performance.now() - laneStarted)
const indexStarted = performance.now()
const index = buildLaneIndex(lanes)
const laneIndexMs = Math.round(performance.now() - indexStarted)

const place = (label: string, lat: number, lng: number) => ({ lat, lng, label, source: "search" as const })
const trips = [
  ["kratka centar", place("Trg", 45.81315, 15.9775), place("Ilica 10", 45.81314, 15.97447)],
  ["kratka stanica", place("Trg", 45.81315, 15.9775), place("Vukovarska", 45.8004, 15.9788)],
  ["srednja jarun", place("Trg", 45.81315, 15.9775), place("Jarun", 45.7832, 15.918)],
  ["srednja maksimir", place("Trg", 45.81315, 15.9775), place("Maksimir", 45.8215, 16.018)],
  ["duga sesvete", place("Trg", 45.81315, 15.9775), place("Sesvete", 45.828, 16.113)],
  ["duga podsused-dubrava", place("Podsused", 45.8165, 15.8364), place("Dubrava", 45.8253, 16.0422)],
  ["srednja savska-heinzel", place("Savska", 45.80385, 15.96576), place("Heinzelova", 45.81097, 16.00168)],
  ["kratka britanski", place("Britanski", 45.8146, 15.9702), place("Kaptol", 45.8156, 15.978)],
  ["srednja kolodvor-arena", place("Kolodvor", 45.8046, 15.979), place("Arena", 45.7712, 15.9436)],
  ["duga remetinec-sljeme", place("Remetinec", 45.7823, 15.9556), place("Sljeme", 45.899, 15.948)],
] as const

async function runSet(label: string, routing: InstanceType<typeof ValhallaRoutingProvider>) {
  console.log(`\n# ${label}`)
  console.log("| ruta | prva kartica ms | sve kartice ms | pješice | bajs | svoj | zahtjevi |")
  console.log("| --- | ---: | ---: | --- | --- | --- | ---: |")
  for (const [name, origin, destination] of trips) {
    const before = rows.length
    const started = performance.now()
    const marks: Record<string, number> = {}
    const jobs = (["walk", "bajs", "own-bike"] as const).map(async (mode) => {
      const t0 = performance.now()
      try {
        const plan = await planTrip({ mode, origin, destination, stations: stationPayload.stations, parkings }, routing)
        marks[mode] = Math.round(performance.now() - t0)
        return `${Math.round(plan.totalDurationS / 60)} min`
      } catch (error) {
        marks[mode] = Math.round(performance.now() - t0)
        return error instanceof Error ? "greška" : "greška"
      }
    })
    const settled = await Promise.all(jobs)
    const first = Math.min(...Object.values(marks))
    const all = Math.round(performance.now() - started)
    const calls = rows.slice(before)
    console.log(`| ${name} | ${first} | ${all} | ${settled[0]} | ${settled[1]} | ${settled[2]} | ${calls.length} |`)
    const slow = [...calls].sort((a, b) => b.ms - a.ms)[0]
    if (slow) console.log(`| | najsporiji ${slow.ms} ms ${slow.status} ${slow.url.slice(0, 60)} | | | | | |`)
  }
}

console.log(`staze parse ${laneParseMs} ms, indeks ${laneIndexMs} ms, linija ${index.lines.length}, stanica ${stationPayload.stations.length}, parkirališta ${parkings.length}`)
await runSet("valhalla živi", new ValhallaRoutingProvider())
