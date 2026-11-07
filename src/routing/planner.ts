import { haversineM, inZagreb, nearest, withinRadius } from "../lib/geo"
import type { Place } from "../types/places"
import type { Parking } from "../types/parking"
import type { Station } from "../types/station"
import type { ParkingChoice, Segment, TravelMode, TripPlan } from "../types/trip"
import type { RouteLeg, RoutingProvider } from "./RoutingProvider"
import { PlanError } from "./ValhallaRoutingProvider"

const CANDIDATES = 5
const PICKUP_S = 60
const DROPOFF_S = 60
const LOCK_S = 60
const PARKING_NEAR_M = 300
const PARKING_FAR_M = 600

export interface PlanRequest {
  mode: TravelMode
  origin: Place
  destination: Place
  stations: Station[]
  parkings: Parking[]
  preferredParkingId?: string | null
}

interface Timed {
  timeS: number
  distanceM: number
}

function outsideWarning(origin: Place, destination: Place): string | null {
  if (!inZagreb(origin) || !inZagreb(destination)) {
    return "Neka točka je izvan okvira Zagreba. Rutiranje je podešeno za grad."
  }
  return null
}

function emptyLeg(at: { lat: number; lng: number }, instruction: string): RouteLeg {
  return {
    geometry: {
      type: "LineString",
      coordinates: [
        [at.lng, at.lat],
        [at.lng, at.lat],
      ],
    },
    distanceM: 0,
    durationS: 0,
    steps: [{ instruction, distanceM: 0, durationS: 0, lat: at.lat, lng: at.lng, alongM: 0 }],
  }
}

async function routeBetween(
  routing: RoutingProvider,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  profile: "bicycle" | "pedestrian",
  sameInstruction: string,
): Promise<RouteLeg> {
  if (haversineM(from, to) < 20) return emptyLeg(to, sameInstruction)
  return routing.route([from, to], profile)
}

function segmentFrom(
  leg: RouteLeg,
  role: Segment["role"],
  move: Segment["move"],
  title: string,
  fromLabel: string,
  toLabel: string,
): Segment {
  return {
    role,
    move,
    title,
    fromLabel,
    toLabel,
    geometry: leg.geometry,
    distanceM: leg.distanceM,
    durationS: leg.durationS,
    steps: leg.steps,
  }
}

function sum(segments: Segment[], field: "distanceM" | "durationS"): number {
  return segments.reduce((total, segment) => total + segment[field], 0)
}

function planShell(partial: Omit<TripPlan, "id" | "totalDistanceM" | "totalDurationS" | "bikeDurationS"> & {
  idParts: string[]
}): TripPlan {
  const bikeDurationS = partial.segments
    .filter((segment) => segment.move === "bicycle")
    .reduce((total, segment) => total + segment.durationS, 0)
  return {
    ...partial,
    id: `${partial.mode}:${partial.idParts.join(":")}:${Date.now()}`,
    totalDistanceM: sum(partial.segments, "distanceM"),
    totalDurationS: sum(partial.segments, "durationS") + partial.pickupPenaltyS + partial.dropoffPenaltyS,
    bikeDurationS,
  }
}

async function walkPlan(
  routing: RoutingProvider,
  origin: Place,
  destination: Place,
  warnings: string[],
): Promise<TripPlan> {
  const leg = await routeBetween(routing, origin, destination, "pedestrian", "Nastavite pješice")
  return planShell({
    idParts: ["walk"],
    mode: "walk",
    originLabel: origin.label,
    destinationLabel: destination.label,
    segments: [segmentFrom(leg, "direct", "pedestrian", "Pješice", origin.label, destination.label)],
    pickupPenaltyS: 0,
    dropoffPenaltyS: 0,
    penaltyNote: null,
    warnings,
    pickup: null,
    dropoff: null,
    parking: null,
    parkingChoices: [],
    parkingRadiusM: null,
    noParking: false,
    lockReminder: false,
    walkAlternative: null,
  })
}

function cell(matrix: { timeS: number | null; distanceM: number | null }[][], row: number, column: number): Timed | null {
  const value = matrix[row]?.[column]
  if (!value || value.timeS == null) return null
  return { timeS: value.timeS, distanceM: value.distanceM ?? 0 }
}

/**
 * Vozim Bajs: 5 najbližih stanica s biciklom i 5 sa slobodnim mjestom,
 * zatim minimum hod + 60 s + bicikl + 60 s + hod.
 */
async function planBajs(request: PlanRequest, routing: RoutingProvider): Promise<TripPlan> {
  const { origin, destination, stations } = request
  const walkPromise = routing.route([origin, destination], "pedestrian").catch(() => null)
  const pickups = nearest(origin, stations, CANDIDATES, (station) => station, (station) => station.bikes >= 1 && !station.maintenance)
  const dropoffs = nearest(
    destination,
    stations,
    CANDIDATES,
    (station) => station,
    (station) => station.freeRacks >= 1 && !station.maintenance,
  )
  if (!pickups.length) {
    throw new PlanError(
      stations.some((station) => station.bikes >= 1 && station.maintenance)
        ? "Stanice s biciklom su u održavanju."
        : "Nema stanice s dostupnim biciklom.",
    )
  }
  if (!dropoffs.length) {
    throw new PlanError(
      stations.some((station) => station.freeRacks >= 1 && station.maintenance)
        ? "Stanice za povrat su u održavanju."
        : "Nema stanice sa slobodnim mjestom za vraćanje bicikla.",
    )
  }

  const [walkTo, rideBetween, walkFrom] = await Promise.all([
    routing.matrix([origin], pickups, "pedestrian"),
    routing.matrix(pickups, dropoffs, "bicycle"),
    routing.matrix(dropoffs, [destination], "pedestrian"),
  ])

  let best: { pickup: number; dropoff: number; walk1: Timed; ride: Timed; walk2: Timed; total: number } | null = null
  for (let pickupIndex = 0; pickupIndex < pickups.length; pickupIndex += 1) {
    for (let dropoffIndex = 0; dropoffIndex < dropoffs.length; dropoffIndex += 1) {
      const walk1 = cell(walkTo, 0, pickupIndex)
      const same = pickups[pickupIndex].id === dropoffs[dropoffIndex].id
      const ride = same ? { timeS: 0, distanceM: 0 } : cell(rideBetween, pickupIndex, dropoffIndex)
      const walk2 = cell(walkFrom, dropoffIndex, 0)
      if (!walk1 || !ride || !walk2) continue
      const total = walk1.timeS + PICKUP_S + ride.timeS + DROPOFF_S + walk2.timeS
      if (!best || total < best.total) {
        best = { pickup: pickupIndex, dropoff: dropoffIndex, walk1, ride, walk2, total }
      }
    }
  }
  if (!best) throw new PlanError("Nije moguće povezati stanice biciklističkom rutom.")

  const pickup = pickups[best.pickup]
  const dropoff = dropoffs[best.dropoff]
  const [toPickup, ride, toDest, direct] = await Promise.all([
    routeBetween(routing, origin, pickup, "pedestrian", "Nastavite do stanice"),
    routeBetween(routing, pickup, dropoff, "bicycle", "Preuzmite i vratite bicikl na istoj stanici"),
    routeBetween(routing, dropoff, destination, "pedestrian", "Nastavite do cilja"),
    walkPromise,
  ])
  const warnings: string[] = []
  const outside = outsideWarning(origin, destination)
  if (outside) warnings.push(outside)
  if (best.ride.timeS > 30 * 60) {
    warnings.push("Vožnja traje dulje od 30 minuta. Provjerite cijenu najma u aplikaciji Bajs prije polaska.")
  }
  if (pickup.maintenance) warnings.push(`Stanica ${pickup.name} označena je kao u održavanju.`)
  if (dropoff.maintenance && dropoff.id !== pickup.id) {
    warnings.push(`Stanica ${dropoff.name} označena je kao u održavanju.`)
  }

  const plan = planShell({
    idParts: ["bajs", String(pickup.id), String(dropoff.id)],
    mode: "bajs",
    originLabel: origin.label,
    destinationLabel: destination.label,
    segments: [
      segmentFrom(toPickup, "to-pickup", "pedestrian", "Pješice do stanice", origin.label, pickup.name),
      segmentFrom(ride, "ride", "bicycle", "Vožnja Bajsom", pickup.name, dropoff.name),
      segmentFrom(toDest, "to-dest", "pedestrian", "Pješice do cilja", dropoff.name, destination.label),
    ],
    pickupPenaltyS: PICKUP_S,
    dropoffPenaltyS: DROPOFF_S,
    penaltyNote: "Ukupno vrijeme uključuje 1 min za preuzimanje i 1 min za vraćanje bicikla.",
    warnings,
    pickup: { id: pickup.id, name: pickup.name, lat: pickup.lat, lng: pickup.lng, bikes: pickup.bikes, maintenance: pickup.maintenance },
    dropoff: {
      id: dropoff.id,
      name: dropoff.name,
      lat: dropoff.lat,
      lng: dropoff.lng,
      freeRacks: dropoff.freeRacks,
      maintenance: dropoff.maintenance,
    },
    parking: null,
    parkingChoices: [],
    parkingRadiusM: null,
    noParking: false,
    lockReminder: false,
    walkAlternative: null,
  })
  if (direct && direct.durationS < plan.totalDurationS) {
    plan.walkAlternative = planShell({
      idParts: ["walk"],
      mode: "walk",
      originLabel: origin.label,
      destinationLabel: destination.label,
      segments: [segmentFrom(direct, "direct", "pedestrian", "Pješice", origin.label, destination.label)],
      pickupPenaltyS: 0,
      dropoffPenaltyS: 0,
      penaltyNote: null,
      warnings: [],
      pickup: null,
      dropoff: null,
      parking: null,
      parkingChoices: [],
      parkingRadiusM: null,
      noParking: false,
      lockReminder: false,
      walkAlternative: null,
    })
  }
  return plan
}

async function planBajsRiding(request: PlanRequest, routing: RoutingProvider): Promise<TripPlan> {
  const { origin, destination, stations } = request
  const walkPromise = routing.route([origin, destination], "pedestrian").catch(() => null)
  const dropoffs = nearest(
    destination,
    stations,
    CANDIDATES,
    (station) => station,
    (station) => station.freeRacks >= 1 && !station.maintenance,
  )
  if (!dropoffs.length) {
    throw new PlanError(
      stations.some((station) => station.freeRacks >= 1 && station.maintenance)
        ? "Stanice za povrat su u održavanju."
        : "Nema stanice sa slobodnim mjestom blizu odredišta.",
    )
  }
  const [rideMatrix, walkMatrix] = await Promise.all([
    routing.matrix([origin], dropoffs, "bicycle"),
    routing.matrix(dropoffs, [destination], "pedestrian"),
  ])
  let best: { index: number; ride: Timed; walk: Timed; total: number } | null = null
  for (let index = 0; index < dropoffs.length; index += 1) {
    const ride = cell(rideMatrix, 0, index)
    const walk = cell(walkMatrix, index, 0)
    if (!ride || !walk) continue
    const total = ride.timeS + DROPOFF_S + walk.timeS
    if (!best || total < best.total) best = { index, ride, walk, total }
  }
  if (!best) throw new PlanError("Nije moguće izračunati vožnju do stanice za povrat.")
  const dropoff = dropoffs[best.index]
  const [ride, toDest, direct] = await Promise.all([
    routeBetween(routing, origin, dropoff, "bicycle", "Vratite bicikl na ovoj stanici"),
    routeBetween(routing, dropoff, destination, "pedestrian", "Nastavite do cilja"),
    walkPromise,
  ])
  const warnings: string[] = []
  const outside = outsideWarning(origin, destination)
  if (outside) warnings.push(outside)
  if (best.ride.timeS > 30 * 60) {
    warnings.push("Vožnja traje dulje od 30 minuta. Provjerite cijenu najma u aplikaciji Bajs prije dolaska.")
  }
  if (dropoff.maintenance) warnings.push(`Stanica ${dropoff.name} označena je kao u održavanju.`)
  const plan = planShell({
    idParts: ["riding", String(dropoff.id)],
    mode: "bajs-riding",
    originLabel: origin.label,
    destinationLabel: destination.label,
    segments: [
      segmentFrom(ride, "ride", "bicycle", "Vožnja Bajsom", origin.label, dropoff.name),
      segmentFrom(toDest, "to-dest", "pedestrian", "Pješice do cilja", dropoff.name, destination.label),
    ],
    pickupPenaltyS: 0,
    dropoffPenaltyS: DROPOFF_S,
    penaltyNote: "Ukupno vrijeme uključuje 1 min za vraćanje bicikla.",
    warnings,
    pickup: null,
    dropoff: {
      id: dropoff.id,
      name: dropoff.name,
      lat: dropoff.lat,
      lng: dropoff.lng,
      freeRacks: dropoff.freeRacks,
      maintenance: dropoff.maintenance,
    },
    parking: null,
    parkingChoices: [],
    parkingRadiusM: null,
    noParking: false,
    lockReminder: false,
    walkAlternative: null,
  })
  if (direct && direct.durationS < plan.totalDurationS) {
    plan.walkAlternative = planShell({
      idParts: ["walk"],
      mode: "walk",
      originLabel: origin.label,
      destinationLabel: destination.label,
      segments: [segmentFrom(direct, "direct", "pedestrian", "Pješice", origin.label, destination.label)],
      pickupPenaltyS: 0,
      dropoffPenaltyS: 0,
      penaltyNote: null,
      warnings: [],
      pickup: null,
      dropoff: null,
      parking: null,
      parkingChoices: [],
      parkingRadiusM: null,
      noParking: false,
      lockReminder: false,
      walkAlternative: null,
    })
  }
  return plan
}

async function planOwnBike(request: PlanRequest, routing: RoutingProvider): Promise<TripPlan> {
  const { origin, destination, parkings, preferredParkingId } = request
  const walkPromise = routing.route([origin, destination], "pedestrian").catch(() => null)
  const warnings: string[] = []
  const outside = outsideWarning(origin, destination)
  if (outside) warnings.push(outside)

  let radius: number | null = PARKING_NEAR_M
  let picks = withinRadius(destination, parkings, PARKING_NEAR_M, (parking) => parking).slice(0, CANDIDATES)
  if (!picks.length && parkings.length) {
    radius = PARKING_FAR_M
    picks = withinRadius(destination, parkings, PARKING_FAR_M, (parking) => parking).slice(0, CANDIDATES)
    if (picks.length) {
      warnings.push("U krugu od 300 m nema parkirališta. Odabrano je najpovoljnije unutar 600 m.")
    }
  }
  let chosen = picks.map((hit) => hit.item)
  if (preferredParkingId) {
    const preferred = parkings.find((parking) => parking.id === preferredParkingId)
    if (preferred && !chosen.some((parking) => parking.id === preferred.id)) {
      chosen = [preferred, ...chosen].slice(0, CANDIDATES)
    }
  }

  if (!chosen.length) {
    const ride = await routeBetween(routing, origin, destination, "bicycle", "Nastavite do cilja")
    warnings.push(
      "U radijusu od 600 m nema evidentiranog javnog parkirališta. Ruta vodi do adrese. Bicikl vežite uz stalak ili stup.",
    )
    return planShell({
      idParts: ["own", "none"],
      mode: "own-bike",
      originLabel: origin.label,
      destinationLabel: destination.label,
      segments: [segmentFrom(ride, "ride", "bicycle", "Vožnja do cilja", origin.label, destination.label)],
      pickupPenaltyS: 0,
      dropoffPenaltyS: 0,
      penaltyNote: null,
      warnings,
      pickup: null,
      dropoff: null,
      parking: null,
      parkingChoices: [],
      parkingRadiusM: null,
      noParking: true,
      lockReminder: true,
      walkAlternative: null,
    })
  }

  const [rideMatrix, walkMatrix] = await Promise.all([
    routing.matrix([origin], chosen, "bicycle"),
    routing.matrix(chosen, [destination], "pedestrian"),
  ])
  const choices: Array<ParkingChoice & { index: number }> = []
  for (let index = 0; index < chosen.length; index += 1) {
    const ride = cell(rideMatrix, 0, index)
    const walk = cell(walkMatrix, index, 0)
    if (!ride || !walk) continue
    choices.push({
      index,
      parkingId: chosen[index].id,
      name: chosen[index].name,
      straightM: haversineM(chosen[index], destination),
      walkM: walk.distanceM,
      walkS: walk.timeS,
      bikeS: ride.timeS,
      totalS: ride.timeS + LOCK_S + walk.timeS,
    })
  }
  if (!choices.length) {
    throw new PlanError("Parkirališta su pronađena, ali do njih nema biciklističke rute.")
  }
  choices.sort((a, b) => a.totalS - b.totalS)
  const preferred = preferredParkingId ? choices.find((choice) => choice.parkingId === preferredParkingId) : undefined
  const winner = preferred ?? choices[0]
  const parking = chosen[winner.index]
  const [ride, toDest, direct] = await Promise.all([
    routeBetween(routing, origin, parking, "bicycle", "Parkirajte ovdje"),
    routeBetween(routing, parking, destination, "pedestrian", "Nastavite do cilja"),
    walkPromise,
  ])
  const plan = planShell({
    idParts: ["own", parking.id],
    mode: "own-bike",
    originLabel: origin.label,
    destinationLabel: destination.label,
    segments: [
      segmentFrom(ride, "ride", "bicycle", "Vožnja do parkirališta", origin.label, parking.name),
      segmentFrom(toDest, "to-dest", "pedestrian", "Pješice do cilja", parking.name, destination.label),
    ],
    pickupPenaltyS: 0,
    dropoffPenaltyS: LOCK_S,
    penaltyNote: "Ukupno vrijeme uključuje 1 min za vezanje bicikla.",
    warnings,
    pickup: null,
    dropoff: null,
    parking: { id: parking.id, name: parking.name, lat: parking.lat, lng: parking.lng },
    parkingChoices: choices.map((choice) => ({
      parkingId: choice.parkingId,
      name: choice.name,
      straightM: choice.straightM,
      walkM: choice.walkM,
      walkS: choice.walkS,
      bikeS: choice.bikeS,
      totalS: choice.totalS,
    })),
    parkingRadiusM: radius,
    noParking: false,
    lockReminder: true,
    walkAlternative: null,
  })
  if (direct && direct.durationS < plan.totalDurationS) {
    plan.walkAlternative = planShell({
      idParts: ["walk"],
      mode: "walk",
      originLabel: origin.label,
      destinationLabel: destination.label,
      segments: [segmentFrom(direct, "direct", "pedestrian", "Pješice", origin.label, destination.label)],
      pickupPenaltyS: 0,
      dropoffPenaltyS: 0,
      penaltyNote: null,
      warnings: [],
      pickup: null,
      dropoff: null,
      parking: null,
      parkingChoices: [],
      parkingRadiusM: null,
      noParking: false,
      lockReminder: false,
      walkAlternative: null,
    })
  }
  return plan
}

export async function planTrip(request: PlanRequest, routing: RoutingProvider): Promise<TripPlan> {
  if (request.mode === "walk") {
    const warnings: string[] = []
    const outside = outsideWarning(request.origin, request.destination)
    if (outside) warnings.push(outside)
    return walkPlan(routing, request.origin, request.destination, warnings)
  }
  if (request.mode === "bajs") return planBajs(request, routing)
  if (request.mode === "bajs-riding") return planBajsRiding(request, routing)
  return planOwnBike(request, routing)
}
