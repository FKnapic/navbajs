import { haversineM } from "../lib/geo"
import { ROUTE_UNAVAILABLE } from "../lib/messages"
import type { LatLng } from "../types/places"
import type { Step } from "../types/trip"
import { croatianInstruction } from "./instructions"
import { PlanError } from "./PlanError"
import type { MatrixCell, RouteLeg, RouteProfile } from "./RoutingProvider"

const OSRM_ROOT = "https://routing.openstreetmap.de"

function profilePath(profile: RouteProfile): string {
  return profile === "bicycle" ? "routed-bike/route/v1/bike" : "routed-foot/route/v1/foot"
}

function tablePath(profile: RouteProfile): string {
  return profile === "bicycle" ? "routed-bike/table/v1/bike" : "routed-foot/table/v1/foot"
}

function coordList(points: LatLng[]): string {
  return points.map((point) => `${point.lng},${point.lat}`).join(";")
}

const OSRM_PARALLEL = 4
let osrmActive = 0
const osrmWaiters: Array<() => void> = []
const osrmInflight = new Map<string, Promise<unknown>>()
const osrmLive = new Set<AbortController>()

export function cancelOsrm(): void {
  for (const controller of osrmLive) controller.abort("cancel")
  osrmLive.clear()
}

function takeSlot(): Promise<void> {
  if (osrmActive < OSRM_PARALLEL) {
    osrmActive += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => osrmWaiters.push(resolve))
}

function releaseSlot(): void {
  const next = osrmWaiters.shift()
  if (next) next()
  else osrmActive -= 1
}

async function osrmGet(url: string): Promise<unknown> {
  const running = osrmInflight.get(url)
  if (running) return running
  const job = takeSlot().then(async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController()
        osrmLive.add(controller)
        const timer = window.setTimeout(() => controller.abort("timeout"), 8_000)
        let response: Response
        try {
          response = await fetch(url, { signal: controller.signal })
        } catch {
          if (controller.signal.reason === "cancel") throw new DOMException("Otkazano", "AbortError")
          if (attempt === 0) continue
          throw new PlanError(ROUTE_UNAVAILABLE)
        } finally {
          window.clearTimeout(timer)
          osrmLive.delete(controller)
        }
        if ((response.status === 429 || response.status >= 500) && attempt === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 700))
          continue
        }
        if (!response.ok) throw new PlanError(ROUTE_UNAVAILABLE)
        return response.json()
      }
      throw new PlanError(ROUTE_UNAVAILABLE)
    } finally {
      releaseSlot()
    }
  })
  osrmInflight.set(url, job)
  try {
    return await job
  } finally {
    osrmInflight.delete(url)
  }
}

export async function osrmMatrix(sources: LatLng[], targets: LatLng[], profile: RouteProfile): Promise<MatrixCell[][]> {
  const indexes = (start: number, count: number) => Array.from({ length: count }, (_, index) => start + index).join(";")
  const url = `${OSRM_ROOT}/${tablePath(profile)}/${coordList([...sources, ...targets])}?sources=${indexes(0, sources.length)}&destinations=${indexes(sources.length, targets.length)}&annotations=duration,distance`
  const payload = (await osrmGet(url)) as {
    code?: string
    durations?: Array<Array<number | null>>
    distances?: Array<Array<number | null>>
  }
  if (payload.code !== "Ok" || !payload.durations || payload.durations.length !== sources.length) {
    throw new PlanError(ROUTE_UNAVAILABLE)
  }
  return payload.durations.map((row, rowIndex) =>
    row.map((time, column) => ({
      timeS: typeof time === "number" && Number.isFinite(time) ? time : null,
      distanceM:
        typeof payload.distances?.[rowIndex]?.[column] === "number" && Number.isFinite(payload.distances[rowIndex][column] as number)
          ? (payload.distances[rowIndex][column] as number)
          : null,
    })),
  )
}

function maneuverType(type: string, modifier?: string): number {
  if (type === "depart") return 1
  if (type === "arrive") return 4
  if (type === "roundabout" || type === "rotary") return 26
  if (type === "exit roundabout" || type === "exit rotary") return 27
  const side: Record<string, number> = {
    uturn: 12,
    "sharp right": 11,
    right: 10,
    "slight right": 9,
    straight: 8,
    "slight left": 16,
    left: 15,
    "sharp left": 14,
  }
  if (type === "turn" || type === "end of road" || type === "fork") return side[modifier ?? "straight"] ?? 8
  return 7
}

export async function osrmRoute(locations: LatLng[], profile: RouteProfile): Promise<RouteLeg> {
  const url = `${OSRM_ROOT}/${profilePath(profile)}/${coordList(locations)}?overview=full&geometries=geojson&steps=true`
  const payload = (await osrmGet(url)) as {
    code?: string
    routes?: Array<{
      distance?: number
      duration?: number
      geometry?: { coordinates?: [number, number][] }
      legs?: Array<{
        steps?: Array<{
          distance?: number
          duration?: number
          name?: string
          maneuver?: { type?: string; modifier?: string; location?: [number, number]; exit?: number }
        }>
      }>
    }>
  }
  const route = payload.routes?.[0]
  const coordinates = route?.geometry?.coordinates ?? []
  if (payload.code !== "Ok" || coordinates.length < 2) throw new PlanError(ROUTE_UNAVAILABLE)
  const along = [0]
  for (let index = 1; index < coordinates.length; index += 1) {
    along.push(
      along[index - 1] +
        haversineM(
          { lng: coordinates[index - 1][0], lat: coordinates[index - 1][1] },
          { lng: coordinates[index][0], lat: coordinates[index][1] },
        ),
    )
  }
  const steps: Step[] = []
  for (const step of route?.legs?.[0]?.steps ?? []) {
    const location = step.maneuver?.location
    if (!location) continue
    let nearest = 0
    let best = Number.POSITIVE_INFINITY
    for (let index = 0; index < coordinates.length; index += 1) {
      const distance = haversineM(
        { lng: location[0], lat: location[1] },
        { lng: coordinates[index][0], lat: coordinates[index][1] },
      )
      if (distance < best) {
        best = distance
        nearest = index
      }
    }
    steps.push({
      instruction: croatianInstruction({
        type: maneuverType(step.maneuver?.type ?? "", step.maneuver?.modifier),
        street_names: step.name ? [step.name] : [],
        roundabout_exit_count: step.maneuver?.exit,
      }),
      distanceM: step.distance ?? 0,
      durationS: step.duration ?? 0,
      lng: location[0],
      lat: location[1],
      alongM: along[nearest] ?? 0,
    })
  }
  if (!steps.length) {
    steps.push({
      instruction: profile === "bicycle" ? "Nastavite biciklom" : "Nastavite pješice",
      distanceM: route?.distance ?? 0,
      durationS: route?.duration ?? 0,
      lng: coordinates[0][0],
      lat: coordinates[0][1],
      alongM: 0,
    })
  }
  return {
    geometry: { type: "LineString", coordinates },
    distanceM: route?.distance ?? 0,
    durationS: route?.duration ?? 0,
    steps,
  }
}
