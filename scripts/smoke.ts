import assert from "node:assert/strict"
import { decodePolyline } from "../src/routing/polyline"
import { croatianInstruction } from "../src/routing/instructions"
import { haversineM, nearest } from "../src/lib/geo"
import { planTrip } from "../src/routing/planner"
import { ValhallaRoutingProvider } from "../src/routing/ValhallaRoutingProvider"
import type { LatLng } from "../src/types/places"
import type { Parking } from "../src/types/parking"
import type { Station } from "../src/types/station"
import type { MatrixCell, RouteLeg, RouteProfile, RoutingProvider } from "../src/routing/RoutingProvider"

function encodePoint(lat: number, lng: number, precision = 6): string {
  const factor = 10 ** precision
  const encode = (value: number) => {
    let number = Math.round(value)
    number = number < 0 ? ~(number << 1) : number << 1
    let output = ""
    while (number >= 0x20) {
      output += String.fromCharCode((0x20 | (number & 0x1f)) + 63)
      number >>= 5
    }
    return output + String.fromCharCode(number + 63)
  }
  return encode(lat * factor) + encode(lng * factor)
}

const encoded = encodePoint(45.813705, 15.977234)
const decoded = decodePolyline(encoded, 6)
assert.ok(Math.abs(decoded[0][1] - 45.813705) < 1e-5)
assert.ok(Math.abs(decoded[0][0] - 15.977234) < 1e-5)
assert.equal(croatianInstruction({ type: 10, street_names: ["Ilica/10081"] }), "Skrenite desno na Ilica")

const north = haversineM({ lat: 45.8, lng: 16 }, { lat: 45.801, lng: 16 })
assert.ok(north > 100 && north < 120)

function station(partial: Partial<Station> & Pick<Station, "id" | "lat" | "lng">): Station {
  return {
    number: partial.id,
    name: partial.name ?? `S${partial.id}`,
    bikes: partial.bikes ?? 0,
    bikesOnSite: partial.bikes ?? 0,
    freeRacks: partial.freeRacks ?? 0,
    racks: 10,
    maintenance: false,
    ...partial,
  }
}

class MockRouting implements RoutingProvider {
  constructor(private readonly bikeMps = 4.5) {}

  async matrix(sources: LatLng[], targets: LatLng[], profile: RouteProfile): Promise<MatrixCell[][]> {
    const speed = profile === "bicycle" ? this.bikeMps : 1.35
    return sources.map((source) =>
      targets.map((target) => {
        const distanceM = haversineM(source, target)
        return { timeS: distanceM / speed, distanceM }
      }),
    )
  }

  async route(locations: LatLng[], profile: RouteProfile): Promise<RouteLeg> {
    const [from, to] = locations
    const distanceM = haversineM(from, to)
    const speed = profile === "bicycle" ? this.bikeMps : 1.35
    return {
      geometry: {
        type: "LineString",
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      },
      distanceM,
      durationS: distanceM / speed,
      steps: [
        {
          instruction: profile === "bicycle" ? "Nastavite biciklom" : "Nastavite pješice",
          distanceM,
          durationS: distanceM / speed,
          lat: from.lat,
          lng: from.lng,
          alongM: 0,
        },
      ],
    }
  }
}

const origin = { label: "A", lat: 45.81, lng: 15.97, source: "search" as const }
const destination = { label: "B", lat: 45.8, lng: 15.98, source: "search" as const }
const closePickup = station({ id: 1, name: "Blizu starta", lat: 45.8104, lng: 15.9704, bikes: 6, freeRacks: 0 })
const farPickup = station({ id: 2, name: "Daleko start", lat: 45.83, lng: 15.95, bikes: 8, freeRacks: 2 })
const emptyPickup = station({ id: 3, name: "Prazno", lat: 45.8101, lng: 15.9701, bikes: 0, freeRacks: 4 })
const closeDrop = station({ id: 4, name: "Blizu cilja", lat: 45.8003, lng: 15.9803, bikes: 0, freeRacks: 5 })
const farDrop = station({ id: 5, name: "Daleko cilj", lat: 45.78, lng: 16.02, bikes: 3, freeRacks: 4 })

const bajs = await planTrip(
  {
    mode: "bajs",
    origin,
    destination,
    stations: [emptyPickup, farPickup, closePickup, farDrop, closeDrop],
    parkings: [],
  },
  new MockRouting(),
)
assert.equal(bajs.pickup?.id, 1)
assert.equal(bajs.dropoff?.id, 4)
assert.equal(bajs.segments.length, 3)
assert.equal(bajs.pickupPenaltyS + bajs.dropoffPenaltyS, 120)
assert.ok(Math.abs(bajs.totalDurationS - (bajs.segments.reduce((sum, segment) => sum + segment.durationS, 0) + 120)) < 0.01)

const picked = nearest(origin, [emptyPickup, closePickup], 5, (item) => item, (item) => item.bikes >= 1)
assert.deepEqual(picked.map((item) => item.id), [1])

const riding = await planTrip(
  { mode: "bajs-riding", origin, destination, stations: [closeDrop, farDrop, emptyPickup], parkings: [] },
  new MockRouting(),
)
assert.equal(riding.segments[0]?.role, "ride")
assert.equal(riding.dropoff?.id, 4)
assert.equal(riding.pickup, null)

const nearParking: Parking = {
  id: "p1",
  name: "Blizu",
  location: "Ulica 1",
  kind: "stalci",
  racks: 4,
  capacity: 8,
  year: 2020,
  district: "CENTAR",
  neighborhood: null,
  covered: null,
  lat: 45.8008,
  lng: 15.9808,
  source: "zagreb",
}
const midParking: Parking = { ...nearParking, id: "p2", name: "Dalje", lat: 45.804, lng: 15.984 }
const own = await planTrip(
  { mode: "own-bike", origin, destination, stations: [], parkings: [midParking, nearParking], preferredParkingId: "p2" },
  new MockRouting(),
)
assert.equal(own.parking?.id, "p2")
assert.equal(own.lockReminder, true)
assert.ok(own.parkingChoices.length >= 1)

const farOnly: Parking = { ...nearParking, id: "far", name: "600", lat: 45.8042, lng: 15.9805 }
const expanded = await planTrip(
  { mode: "own-bike", origin, destination, stations: [], parkings: [farOnly] },
  new MockRouting(),
)
assert.equal(expanded.parkingRadiusM, 600)
assert.ok(expanded.warnings.some((warning) => warning.includes("300")))

const none = await planTrip(
  { mode: "own-bike", origin, destination, stations: [], parkings: [] },
  new MockRouting(),
)
assert.equal(none.noParking, true)
assert.equal(none.segments.length, 1)
assert.equal(none.segments[0]?.role, "ride")

const walk = await planTrip(
  { mode: "walk", origin, destination, stations: [], parkings: [] },
  new MockRouting(),
)
assert.equal(walk.segments[0]?.role, "direct")
assert.equal(walk.walkAlternative, null)

const slow = await planTrip(
  {
    mode: "bajs",
    origin,
    destination,
    stations: [closePickup, closeDrop],
    parkings: [],
  },
  new MockRouting(0.4),
)
assert.ok(slow.walkAlternative, "pješačka ruta treba biti ponuđena kad je brža")
assert.ok((slow.walkAlternative?.totalDurationS ?? Infinity) < slow.totalDurationS)

if (process.env.SMOKE_LIVE === "1") {
  const live = new ValhallaRoutingProvider("https://valhalla1.openstreetmap.de")
  const leg = await live.route(
    [
      { lat: 45.813, lng: 15.977 },
      { lat: 45.807, lng: 15.974 },
    ],
    "bicycle",
  )
  assert.ok(leg.distanceM > 200)
  assert.ok(leg.geometry.coordinates.length > 2)
  assert.equal(leg.geometry.coordinates[0][0] > 15 && leg.geometry.coordinates[0][1] > 45, true)
  const matrix = await live.matrix([{ lat: 45.813, lng: 15.977 }], [{ lat: 45.81, lng: 15.97 }], "pedestrian")
  assert.ok((matrix[0]?.[0]?.timeS ?? 0) > 0)
  console.log("Live Valhalla u redu", Math.round(leg.distanceM), "m")
}

console.log("Smoke testovi prošli.")
