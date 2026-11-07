import { haversineM } from "../lib/geo"
import { ROUTE_UNAVAILABLE } from "../lib/messages"
import type { LatLng } from "../types/places"
import type { Step } from "../types/trip"
import { croatianInstruction, type RawManeuver } from "./instructions"
import { cancelOsrm, osrmMatrix, osrmRoute } from "./osrmFallback"
import { PlanError } from "./PlanError"
import { decodePolyline } from "./polyline"
import type { MatrixCell, RouteLeg, RouteProfile, RoutingProvider } from "./RoutingProvider"

interface ValhallaManeuver extends RawManeuver {
  time?: number
  length?: number
  begin_shape_index?: number
}

interface ValhallaRouteResponse {
  trip?: {
    legs?: Array<{
      shape?: string
      maneuvers?: ValhallaManeuver[]
      summary?: { time?: number; length?: number }
    }>
    summary?: { time?: number; length?: number }
  }
  error?: string
}

interface ValhallaMatrixResponse {
  sources_to_targets?: Array<Array<{ time?: number | null; distance?: number | null }>>
  error?: string
}

export { PlanError } from "./PlanError"

function coordKey(points: LatLng[]): string {
  return points.map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join(";")
}

function legFromValhalla(payload: ValhallaRouteResponse, profile: RouteProfile): RouteLeg {
  const leg = payload.trip?.legs?.[0]
  if (!leg?.shape) throw new PlanError(failureMessage(payload))
  let coordinates = decodePolyline(leg.shape, 6)
  if (coordinates.length === 1) coordinates = [coordinates[0], coordinates[0]]
  if (coordinates.length < 2) throw new PlanError("Ruta nema geometriju.")
  const along = cumulativeMeters(coordinates)
  const steps: Step[] = (leg.maneuvers ?? []).map((maneuver) => {
    const shapeIndex = Math.max(0, Math.min(coordinates.length - 1, maneuver.begin_shape_index ?? 0))
    const point = coordinates[shapeIndex]
    return {
      instruction: croatianInstruction(maneuver),
      distanceM: (maneuver.length ?? 0) * 1000,
      durationS: maneuver.time ?? 0,
      lng: point[0],
      lat: point[1],
      alongM: along[shapeIndex] ?? 0,
    }
  })
  if (!steps.length) {
    steps.push({
      instruction: profile === "bicycle" ? "Nastavite biciklom" : "Nastavite pješice",
      distanceM: (leg.summary?.length ?? 0) * 1000,
      durationS: leg.summary?.time ?? 0,
      lng: coordinates[0][0],
      lat: coordinates[0][1],
      alongM: 0,
    })
  }
  return {
    geometry: { type: "LineString", coordinates },
    distanceM: (leg.summary?.length ?? payload.trip?.summary?.length ?? 0) * 1000,
    durationS: leg.summary?.time ?? payload.trip?.summary?.time ?? 0,
    steps,
  }
}

function defaultValhallaUrl(): string {
  const env = import.meta.env
  const configured = env && env.VITE_VALHALLA_URL
  if (configured && configured.trim()) return configured.trim().replace(/\/$/, "")
  return "https://valhalla1.openstreetmap.de"
}

function costing(profile: RouteProfile): Record<string, unknown> {
  if (profile === "bicycle") {
    return {
      costing: "bicycle",
      costing_options: {
        bicycle: {
          bicycle_type: "City",
          use_roads: 0.1,
        },
      },
    }
  }
  return { costing: "pedestrian" }
}

function failureMessage(payload: { error?: string } | null): string {
  const raw = payload?.error?.toLowerCase() ?? ""
  if (raw.includes("no suitable") || raw.includes("no route") || raw.includes("distance exceeds")) {
    return "Nema prolazne rute između tih točaka. Pokušajte drugo mjesto u Zagrebu."
  }
  return ROUTE_UNAVAILABLE
}

function cumulativeMeters(coords: [number, number][]): number[] {
  const distances = [0]
  for (let index = 1; index < coords.length; index += 1) {
    distances.push(
      distances[index - 1] +
        haversineM(
          { lng: coords[index - 1][0], lat: coords[index - 1][1] },
          { lng: coords[index][0], lat: coords[index][1] },
        ),
    )
  }
  return distances
}

const ROUTE_CACHE_MS = 20_000

export class ValhallaRoutingProvider implements RoutingProvider {
  readonly baseUrl: string
  private readonly pending = new Map<string, Promise<unknown>>()
  private readonly fresh = new Map<string, { at: number; value: unknown }>()
  private readonly live = new Set<AbortController>()

  cancelInflight(): void {
    for (const controller of this.live) controller.abort("cancel")
    this.live.clear()
  }

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl ?? defaultValhallaUrl()).replace(/\/$/, "")
  }

  async matrix(sources: LatLng[], targets: LatLng[], profile: RouteProfile): Promise<MatrixCell[][]> {
    if (!sources.length || !targets.length) {
      throw new PlanError("Nema točaka za usporedbu ruta.")
    }
    const key = `matrix:${profile}:${coordKey(sources)}>${coordKey(targets)}`
    return this.remember(key, () =>
      this.firstReady(
        async () => {
          const payload = (await this.post("sources_to_targets", {
            sources: sources.map((point) => ({ lat: point.lat, lon: point.lng })),
            targets: targets.map((point) => ({ lat: point.lat, lon: point.lng })),
            units: "kilometers",
            ...costing(profile),
          })) as ValhallaMatrixResponse
          const rows = payload.sources_to_targets
          if (!rows || rows.length !== sources.length) {
            throw new PlanError("Poslužitelj za rutiranje vratio je nepotpun odgovor.")
          }
          return rows.map((row) =>
            row.map((cell) => {
              const time = cell?.time
              const distance = cell?.distance
              return {
                timeS: typeof time === "number" && Number.isFinite(time) ? time : null,
                distanceM: typeof distance === "number" && Number.isFinite(distance) ? distance * 1000 : null,
              }
            }),
          )
        },
        () => osrmMatrix(sources, targets, profile),
      ),
    )
  }

  async route(locations: LatLng[], profile: RouteProfile): Promise<RouteLeg> {
    if (locations.length < 2) throw new PlanError("Ruta treba polazište i odredište.")
    const key = `route:${profile}:${coordKey(locations)}`
    return this.remember(key, () =>
      this.firstReady(
        async () => {
          const payload = (await this.post("route", {
            locations: locations.map((point) => ({ lat: point.lat, lon: point.lng, type: "break" })),
            units: "kilometers",
            directions_options: { units: "kilometers", language: "hr" },
            ...costing(profile),
          })) as ValhallaRouteResponse
          return legFromValhalla(payload, profile)
        },
        () => osrmRoute(locations, profile),
      ),
    )
  }

  private async remember<T>(key: string, job: () => Promise<T>): Promise<T> {
    const cached = this.fresh.get(key)
    if (cached && Date.now() - cached.at < ROUTE_CACHE_MS) return cached.value as T
    const running = this.pending.get(key)
    if (running) return running as Promise<T>
    const started = performance.now()
    const task = job().then((value) => {
      this.fresh.set(key, { at: Date.now(), value })
      if (import.meta.env?.DEV) console.debug("[navbajs]", key.slice(0, 48), `${Math.round(performance.now() - started)} ms`)
      return value
    })
    this.pending.set(key, task)
    try {
      return await task
    } finally {
      this.pending.delete(key)
    }
  }

  private firstReady<T>(primary: () => Promise<T>, secondary: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false
      let primaryDone = false
      let secondaryDone = false
      let secondaryStarted = false
      const timer = window.setTimeout(() => startSecondary(), 600)
      const succeed = (value: T) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve(value)
      }
      const startSecondary = () => {
        if (secondaryStarted || settled) return
        secondaryStarted = true
        void secondary().then(succeed, (error: unknown) => {
          secondaryDone = true
          if (settled) return
          if (primaryDone) {
            settled = true
            window.clearTimeout(timer)
            reject(error instanceof PlanError ? error : new PlanError(ROUTE_UNAVAILABLE))
          }
        })
      }
      void primary().then(succeed, (error: unknown) => {
        primaryDone = true
        if (settled) return
        if (error instanceof DOMException && error.name === "AbortError") {
          settled = true
          window.clearTimeout(timer)
          reject(error)
          return
        }
        startSecondary()
        if (secondaryDone) {
          settled = true
          window.clearTimeout(timer)
          reject(error instanceof PlanError ? error : new PlanError(ROUTE_UNAVAILABLE))
        }
      })
    })
  }

  private async post(action: string, body: unknown): Promise<unknown> {
    const key = `${action}:${JSON.stringify(body)}`
    const cached = this.fresh.get(key)
    if (cached && Date.now() - cached.at < ROUTE_CACHE_MS) return cached.value
    const running = this.pending.get(key)
    if (running) return running
    const job = this.send(action, body).then((value) => {
      this.fresh.set(key, { at: Date.now(), value })
      return value
    })
    this.pending.set(key, job)
    try {
      return await job
    } finally {
      this.pending.delete(key)
    }
  }

  private send(action: string, body: unknown): Promise<unknown> {
    const urls = [`${this.baseUrl}/${action}`]
    if (!this.baseUrl.endsWith("/api/valhalla")) urls.push(`/api/valhalla/${action}`)
    const payload = JSON.stringify(body)
    return new Promise((resolve, reject) => {
      let settled = false
      let started = 0
      let failures = 0
      const start = (url: string) => {
        started += 1
        const controller = new AbortController()
        this.live.add(controller)
        const timer = window.setTimeout(() => controller.abort("timeout"), 4_000)
        void fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          signal: controller.signal,
        })
          .then(async (response) => {
            const data = (await response.json().catch(() => null)) as { error?: string } | null
            if (response.status >= 500) throw new Error(data?.error ?? "valhalla")
            if (!response.ok || data?.error) throw new PlanError(failureMessage(data))
            return data
          })
          .then((data) => {
            window.clearTimeout(timer)
            this.live.delete(controller)
            if (settled) return
            settled = true
            resolve(data)
          })
          .catch((error: unknown) => {
            window.clearTimeout(timer)
            this.live.delete(controller)
            if (settled) return
            if (controller.signal.reason === "cancel") {
              settled = true
              reject(new DOMException("Otkazano", "AbortError"))
              return
            }
            if (error instanceof PlanError) {
              settled = true
              reject(error)
              return
            }
            failures += 1
            if (started < urls.length) start(urls[started])
            else if (failures === urls.length) {
              settled = true
              reject(new PlanError(ROUTE_UNAVAILABLE))
            }
          })
      }
      start(urls[0])
      if (urls.length > 1) {
        window.setTimeout(() => {
          if (!settled && started < urls.length) start(urls[1])
        }, 900)
      }
    })
  }
}

export const routing: RoutingProvider = new ValhallaRoutingProvider()

export function cancelRouting(): void {
  if (routing instanceof ValhallaRoutingProvider) routing.cancelInflight()
  cancelOsrm()
}
