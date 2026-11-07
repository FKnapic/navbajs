import { houseIndexReady, searchIndexedHouses, warmHouseIndex } from "../data/houseIndex"
import { searchPlaces } from "../data/zagrebPlaces"
import { OfficialAddressError, searchOfficialHouses } from "./zagrebAddresses"
import {
  hitFromPhoton,
  parseAddressQuery,
  rankHits,
  searchBBox,
  type PhotonHit,
} from "../lib/addressQuery"
import { SEARCH_UNAVAILABLE } from "../lib/messages"
import { ZAGREB_CENTER } from "../lib/geo"
import type { GeocodeResult, LatLng } from "../types/places"

interface PhotonFeature {
  geometry?: { coordinates?: number[] }
  properties?: {
    name?: string
    street?: string
    housenumber?: string
    city?: string
    district?: string
    locality?: string
    type?: string
    osm_key?: string
  }
}

export class SearchUnavailableError extends Error {
  constructor() {
    super(SEARCH_UNAVAILABLE)
    this.name = "SearchUnavailableError"
  }
}

const cache = new Map<string, GeocodeResult[]>()
let active: AbortController | null = null

function photonRoot(): string {
  const runtime = globalThis as { process?: { env?: { PHOTON_URL?: string } } }
  const fromServer = runtime.process?.env?.PHOTON_URL?.trim()
  if (fromServer) return fromServer
  const configured = import.meta.env?.VITE_PHOTON_URL?.trim()
  if (configured) return configured
  return "https://photon.komoot.io"
}

function searchUrl(query: string, bias: LatLng, layer: string | undefined): string {
  const root = photonRoot().replace(/\/$/, "")
  const url = new URL(root.endsWith("/api") ? root : `${root}/api/`)
  const box = searchBBox(parseAddressQuery(query))
  url.searchParams.set("q", query)
  url.searchParams.set("lat", String(bias.lat))
  url.searchParams.set("lon", String(bias.lng))
  url.searchParams.set("bbox", `${box.west},${box.south},${box.east},${box.north}`)
  url.searchParams.set("limit", "15")
  url.searchParams.set("lang", "default")
  if (layer) url.searchParams.set("layer", layer)
  return url.toString()
}

function remember(key: string, results: GeocodeResult[]) {
  cache.delete(key)
  cache.set(key, results)
  while (cache.size > 40) {
    const oldest = cache.keys().next().value
    if (oldest == null) break
    cache.delete(oldest)
  }
}

export function warmAddresses(): void {
  warmHouseIndex()
}

export function clearGeocodeCache(): void {
  cache.clear()
  active?.abort()
  active = null
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
  const any = (AbortSignal as { any?: (list: AbortSignal[]) => AbortSignal }).any
  if (any) return any.call(AbortSignal, signals)
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort()
      return controller.signal
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true })
  }
  return controller.signal
}

async function fetchFeatures(url: string, signal: AbortSignal): Promise<PhotonFeature[]> {
  const timeout = AbortSignal.timeout(8000)
  const combined = combineSignals([signal, timeout])
  let response: Response
  try {
    response = await fetch(url, { signal: combined })
  } catch (error) {
    if (signal.aborted) throw error
    throw new SearchUnavailableError()
  }
  if (response.status === 429 || response.status >= 500) throw new SearchUnavailableError()
  if (!response.ok) throw new SearchUnavailableError()
  const payload = (await response.json()) as { features?: PhotonFeature[] }
  return payload.features ?? []
}

function mergeResults(local: GeocodeResult[], remote: GeocodeResult[]): GeocodeResult[] {
  const merged = [...local]
  for (const item of remote) {
    const same = merged.some(
      (existing) => Math.abs(existing.lat - item.lat) < 0.0008 && Math.abs(existing.lng - item.lng) < 0.0008,
    )
    if (!same) merged.push(item)
  }
  return merged.slice(0, 8)
}

function hitsFrom(features: PhotonFeature[]): PhotonHit[] {
  const hits: PhotonHit[] = []
  for (const feature of features) {
    const hit = hitFromPhoton(feature.properties, feature.geometry?.coordinates)
    if (hit) hits.push(hit)
  }
  return hits
}

export async function geocode(
  query: string,
  options?: { signal?: AbortSignal; bias?: LatLng },
): Promise<GeocodeResult[]> {
  const parsed = parseAddressQuery(query)
  const local = searchPlaces(parsed.house ? `${parsed.street} ${parsed.house}` : parsed.text)
  if (parsed.text.length < 3) return local
  if (!parsed.house && local.length >= 3) return local
  const bias = options?.bias ?? ZAGREB_CENTER
  if (parsed.house) {
    const indexed = searchIndexedHouses(parsed, bias)
    if (indexed?.length) {
      const merged = mergeResults(local, indexed)
      const key = `${parsed.text}|${parsed.house}|${bias.lat.toFixed(3)},${bias.lng.toFixed(3)}`
      remember(key, merged)
      return merged
    }
  }
  const key = `${parsed.text}|${parsed.house ?? ""}|${bias.lat.toFixed(3)},${bias.lng.toFixed(3)}`
  const cached = cache.get(key)
  if (cached) return cached
  active?.abort()
  const controller = new AbortController()
  active = controller
  const parent = options?.signal
  const onParent = () => controller.abort()
  parent?.addEventListener("abort", onParent)
  try {
    if (parsed.house && !houseIndexReady()) {
      try {
        const official = await searchOfficialHouses(parsed, bias, controller.signal)
        if (controller.signal.aborted) throw new DOMException("Otkazano", "AbortError")
        if (official.length) {
          const merged = mergeResults(local, official)
          remember(key, merged)
          return merged
        }
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error
        if (!(error instanceof OfficialAddressError)) throw error
      }
    }
    const features = await fetchFeatures(
      searchUrl(parsed.text, bias, parsed.house ? "house" : undefined),
      controller.signal,
    )
    if (controller.signal.aborted) throw new DOMException("Otkazano", "AbortError")
    const results = mergeResults(local, rankHits(hitsFrom(features), parsed, bias))
    if (results.length) remember(key, results)
    return results
  } finally {
    parent?.removeEventListener("abort", onParent)
    if (active === controller) active = null
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  try {
    const root = photonRoot().replace(/\/$/, "").replace(/\/api$/, "")
    const url = new URL(`${root}/reverse`)
    url.searchParams.set("lat", String(lat))
    url.searchParams.set("lon", String(lng))
    url.searchParams.set("lang", "default")
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return fallback
    const payload = (await response.json()) as { features?: PhotonFeature[] }
    const hit = hitFromPhoton(payload.features?.[0]?.properties, payload.features?.[0]?.geometry?.coordinates)
    if (!hit) return "Točka na karti"
    if (hit.street && hit.housenumber) return `${hit.street} ${hit.housenumber}`
    if (hit.name) return hit.name
    if (hit.street) return hit.street
    return "Točka na karti"
  } catch {
    return fallback
  }
}

export function formatCoord(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}
