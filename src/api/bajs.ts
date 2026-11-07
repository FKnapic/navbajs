import { normalizeNextbike } from "./normalizeBajs"
import type { NextbikeResponse } from "../types/nextbike"
import type { StationsResponse } from "../types/station"

const DIRECT_URL =
  "https://maps.nextbike.net/maps/nextbike-live.json?city=1172&domains=hd&list_cities=0&bikes=0"

const CLIENT_TTL_MS = 20_000

let cache: { at: number; data: StationsResponse } | null = null
let proxyState: { known: boolean; ok: boolean; pending: Promise<boolean> | null } = {
  known: false,
  ok: false,
  pending: null,
}

async function proxyReady(): Promise<boolean> {
  if (proxyState.known) return proxyState.ok
  if (!proxyState.pending) {
    proxyState.pending = fetch("/api/health", { signal: AbortSignal.timeout(800) })
      .then((response) => response.ok)
      .catch(() => false)
      .then((ok) => {
        proxyState = { known: true, ok, pending: null }
        return ok
      })
  }
  return proxyState.pending
}

async function fetchDirect(): Promise<StationsResponse> {
  const response = await fetch(DIRECT_URL, { signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`Nextbike ${response.status}`)
  const payload = (await response.json()) as NextbikeResponse
  return {
    stations: normalizeNextbike(payload),
    fetchedAt: new Date().toISOString(),
    source: "direct",
  }
}

async function fetchProxy(): Promise<StationsResponse> {
  const response = await fetch("/api/bajs", { signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`Proxy ${response.status}`)
  return (await response.json()) as StationsResponse
}

export async function fetchStations(force = false): Promise<StationsResponse> {
  if (!force && cache && Date.now() - cache.at < CLIENT_TTL_MS) return cache.data
  const useProxy = await proxyReady()
  try {
    const data = useProxy ? await fetchProxy() : await fetchDirect()
    cache = { at: Date.now(), data }
    return data
  } catch (primary) {
    try {
      const data = useProxy ? await fetchDirect() : await fetchProxy()
      cache = { at: Date.now(), data }
      return data
    } catch {
      if (cache) return cache.data
      throw primary instanceof Error ? primary : new Error("Stanice Bajsa trenutačno nisu dostupne.")
    }
  }
}
