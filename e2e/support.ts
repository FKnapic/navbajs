import { expect, test as base, type Page, type Route } from "@playwright/test"

export const JELACIC = { latitude: 45.81315, longitude: 15.9775 }

export interface StationFixture {
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
}

export function station(
  id: number,
  name: string,
  lat: number,
  lng: number,
  bikes: number,
  freeRacks: number,
  maintenance = false,
): StationFixture {
  return {
    id,
    number: id,
    name,
    lat,
    lng,
    bikes,
    bikesOnSite: bikes,
    freeRacks,
    racks: bikes + freeRacks,
    maintenance,
  }
}

export const clusteredStations: StationFixture[] = [
  station(1, "Trg bana Jelačića", 45.8132, 15.9772, 8, 4),
  station(2, "Ilica", 45.81335, 15.977, 2, 6),
  station(3, "Gajeva", 45.8131, 15.9774, 5, 3),
  station(4, "Praška", 45.8134, 15.9773, 0, 8),
  station(5, "Petrinjska", 45.813, 15.9771, 1, 2),
  station(6, "Bogovićeva", 45.81325, 15.97755, 6, 1),
]

const noisy =
  /tile|sprite|glyph|AJAXError|Failed to load|maplibre|source-layer|demotiles|openfreemap|fonts\.gstatic|favicon/i

export const test = base.extend({
  page: async ({ page, context }, use, info) => {
    const logs: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error") logs.push(message.text())
    })
    page.on("pageerror", (error) => logs.push(`pageerror: ${error.message}`))
    await context.grantPermissions(["geolocation"])
    await context.setGeolocation(JELACIC)
    await context.addInitScript(() => {
      const stationIds = new Set<number>()
      const originalSet = window.setInterval.bind(window)
      const originalClear = window.clearInterval.bind(window)
      window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        const id = originalSet(handler, timeout, ...args)
        if (timeout === 40_000) stationIds.add(Number(id))
        ;(window as Window & { __stationTimers?: number }).__stationTimers = stationIds.size
        return id
      }) as typeof window.setInterval
      window.clearInterval = ((id: number) => {
        stationIds.delete(id)
        ;(window as Window & { __stationTimers?: number }).__stationTimers = stationIds.size
        return originalClear(id)
      }) as typeof window.clearInterval
      let released = 0
      let watches = 0
      let clears = 0
      const geo = navigator.geolocation
      const watch = geo.watchPosition.bind(geo)
      const clear = geo.clearWatch.bind(geo)
      geo.watchPosition = ((...args: Parameters<Geolocation["watchPosition"]>) => {
        watches += 1
        ;(window as Window & { __navCounts?: () => { released: number; watches: number; clears: number } }).__navCounts =
          () => ({ released, watches, clears })
        return watch(...args)
      }) as Geolocation["watchPosition"]
      geo.clearWatch = ((id: number) => {
        clears += 1
        return clear(id)
      }) as Geolocation["clearWatch"]
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: {
          async request() {
            return {
              async release() {
                released += 1
              },
              addEventListener() {},
              removeEventListener() {},
            }
          },
        },
      })
      ;(window as Window & { __navCounts?: () => { released: number; watches: number; clears: number } }).__navCounts =
        () => ({ released, watches, clears })
    })
    await use(page)
    const text = logs.join("\n")
    if (text) await info.attach("console.txt", { body: text, contentType: "text/plain" })
    const appErrors = logs.filter((line) => !noisy.test(line))
    expect(appErrors, appErrors.join("\n")).toEqual([])
  },
})

export function encodePolyline(points: Array<[number, number]>, precision = 6): string {
  let lastLat = 0
  let lastLng = 0
  let result = ""
  const factor = 10 ** precision
  const write = (value: number) => {
    let current = value < 0 ? ~(value << 1) : value << 1
    while (current >= 0x20) {
      result += String.fromCharCode((0x20 | (current & 0x1f)) + 63)
      current >>= 5
    }
    result += String.fromCharCode(current + 63)
  }
  for (const [lng, lat] of points) {
    const nextLat = Math.round(lat * factor)
    const nextLng = Math.round(lng * factor)
    write(nextLat - lastLat)
    write(nextLng - lastLng)
    lastLat = nextLat
    lastLng = nextLng
  }
  return result
}

function meters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const p1 = (a.lat * Math.PI) / 180
  const p2 = (b.lat * Math.PI) / 180
  const dp = ((b.lat - a.lat) * Math.PI) / 180
  const dl = ((b.lon - a.lon) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

export async function fulfillValhalla(route: Route, fixed?: { pedestrian?: number; bicycle?: number }) {
  const body = route.request().postDataJSON() as {
    costing?: string
    sources?: Array<{ lat: number; lon: number }>
    targets?: Array<{ lat: number; lon: number }>
    locations?: Array<{ lat: number; lon: number }>
  }
  if (route.request().url().includes("sources_to_targets")) {
    const sources = body.sources ?? []
    const targets = body.targets ?? []
    const profile = body.costing === "bicycle" ? "bicycle" : "pedestrian"
    await route.fulfill({
      json: {
        sources_to_targets: sources.map((source) =>
          targets.map((target) => {
            const distance = meters(source, target)
            const time = fixed?.[profile] ?? distance / (profile === "bicycle" ? 4 : 1.2)
            return { time, distance: distance / 1000 }
          }),
        ),
      },
    })
    return
  }
  const locations = body.locations ?? []
  const line: Array<[number, number]> = []
  for (let index = 0; index < locations.length; index += 1) {
    line.push([locations[index].lon, locations[index].lat])
    const next = locations[index + 1]
    if (next) line.push([(locations[index].lon + next.lon) / 2, (locations[index].lat + next.lat) / 2])
  }
  const distance = locations.slice(1).reduce((total, point, index) => total + meters(locations[index], point), 0)
  const profile = body.costing === "bicycle" ? "bicycle" : "pedestrian"
  const time = fixed?.[profile] ?? Math.max(30, distance / (profile === "bicycle" ? 4 : 1.2))
  await route.fulfill({
    json: {
      trip: {
        summary: { time, length: distance / 1000 },
        legs: [
          {
            shape: encodePolyline(line.length > 1 ? line : [[15.9775, 45.81315], [15.9775, 45.81316]]),
            summary: { time, length: distance / 1000 },
            maneuvers: [
              { type: 1, time: time * 0.55, length: (distance / 1000) * 0.55, begin_shape_index: 0, street_names: ["Ilica"] },
              {
                type: 10,
                time: time * 0.45,
                length: (distance / 1000) * 0.45,
                begin_shape_index: Math.max(1, line.length - 2),
                street_names: ["Gajeva"],
              },
              { type: 4, time: 0, length: 0, begin_shape_index: Math.max(0, line.length - 1) },
            ],
          },
        ],
      },
    },
  })
}

export function photonFeature(street: string, housenumber: string, lat: number, lng: number, name = "") {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {
      name,
      street,
      housenumber,
      city: "Zagreb",
      locality: "Donji grad",
      district: "Donji grad",
      country: "Hrvatska",
      type: housenumber ? "house" : name ? "other" : "street",
      osm_key: housenumber ? "building" : "highway",
    },
  }
}

export interface AppMocks {
  stations?: StationFixture[]
  valhalla?: (route: Route) => Promise<void>
  photon?: (route: Route) => Promise<void>
  parking?: unknown
  lanesStatus?: number
  bajsCounts?: { count: number }
}

export async function installMocks(page: Page, mocks: AppMocks = {}) {
  const stations = mocks.stations ?? clusteredStations
  const counts = mocks.bajsCounts ?? { count: 0 }
  await page.route("**/tiles.openfreemap.org/styles/**", (route) =>
    route.fulfill({
      json: {
        version: 8,
        glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
        sources: {},
        layers: [{ id: "background", type: "background", paint: { "background-color": "#f3efe8" } }],
      },
    }),
  )
  const api = (path: string) => (url: URL) => url.pathname === path
  await page.route(api("/api/health"), (route) => route.fulfill({ json: { ok: true, service: "bikebr" } }))
  await page.route(api("/api/bajs"), (route) => {
    counts.count += 1
    return route.fulfill({
      json: { stations, fetchedAt: new Date().toISOString(), source: "proxy" },
    })
  })
  await page.route("**/nextbike-live.json**", (route) => route.abort())
  await page.route("**/nominatim.openstreetmap.org/**", (route) => route.abort())
  await page.route("**/arcportal.zagreb.hr/**", (route) => route.fulfill({ json: { features: [] } }))
  await page.route("**/routing.openstreetmap.de/**", (route) => route.abort())
  await page.route("**/photon.komoot.io/**", (route) =>
    mocks.photon
      ? mocks.photon(route)
      : route.fulfill({
          json: {
            features: [photonFeature("Ilica", "10", 45.81339, 15.97423)],
          },
        }),
  )
  await page.route(api("/api/geocode"), (route) => route.fulfill({ json: { results: [] } }))
  const valhalla = mocks.valhalla ?? ((route: Route) => fulfillValhalla(route))
  await page.route("**/valhalla1.openstreetmap.de/**", valhalla)
  await page.route((url) => url.pathname.startsWith("/api/valhalla/"), valhalla)
  await page.route("**/data/parking.geojson", (route) =>
    route.fulfill({
      json: mocks.parking ?? { type: "FeatureCollection", features: [] },
    }),
  )
  await page.route("**/data/osm-parking.json", (route) => route.fulfill({ json: [] }))
  await page.route("**/data/lanes.geojson", (route) => {
    if (mocks.lanesStatus) return route.fulfill({ status: mocks.lanesStatus, body: "" })
    return route.fulfill({ json: { type: "FeatureCollection", features: [] } })
  })
}

export async function openApp(page: Page) {
  await page.goto("/")
  await expect(page.getByRole("combobox", { name: "Odredište" })).toBeVisible()
  await page.waitForFunction(
    () => (window as unknown as { __navbajsMap?: { loaded?: () => boolean } }).__navbajsMap?.loaded?.() === true,
  )
}

export async function searchAndPick(page: Page, query: string, name: RegExp | string) {
  const mine = page.getByRole("button", { name: "Moja lokacija", exact: true })
  if (await mine.isVisible().catch(() => false)) await mine.click()
  const field = page.getByRole("combobox", { name: "Odredište" })
  await field.click()
  await field.fill(query)
  await page.getByRole("button", { name }).click()
}

export { expect }
