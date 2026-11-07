import { Hono } from "hono"
import { cors } from "hono/cors"
import { normalizeNextbike } from "../src/api/normalizeBajs"
import { geocode, SearchUnavailableError } from "../src/api/geocode"
import { ZAGREB_CENTER } from "../src/lib/geo"
import type { NextbikeResponse } from "../src/types/nextbike"

type Bindings = {
  VALHALLA_URL?: string
  NEXTBIKE_URL?: string
  PHOTON_URL?: string
}

const DEFAULTS = {
  VALHALLA_URL: "https://valhalla1.openstreetmap.de",
  NEXTBIKE_URL:
    "https://maps.nextbike.net/maps/nextbike-live.json?city=1172&domains=hd&list_cities=0&bikes=0",
  PHOTON_URL: "https://photon.komoot.io",
}

interface CacheEntry {
  expires: number
  body: string
}

const memory = new Map<string, CacheEntry>()

function readEnv(source: Partial<Bindings> | undefined, key: keyof typeof DEFAULTS): string {
  const bound = source?.[key]
  if (typeof bound === "string" && bound.trim()) return bound.trim()
  if (typeof process !== "undefined" && process.env[key]?.trim()) return process.env[key]!.trim()
  return DEFAULTS[key]
}

async function cached(key: string, ttlMs: number, load: () => Promise<unknown>): Promise<string> {
  const hit = memory.get(key)
  const now = Date.now()
  if (hit && hit.expires > now) return hit.body
  try {
    const body = JSON.stringify(await load())
    memory.set(key, { expires: now + ttlMs, body })
    return body
  } catch (error) {
    if (hit) return hit.body
    throw error
  }
}

export const api = new Hono<{ Bindings: Bindings }>()

api.use("/api/*", cors())

api.get("/api/health", (c) => c.json({ ok: true, service: "bikebr" }))

api.get("/api/bajs", async (c) => {
  const url = readEnv(c.env, "NEXTBIKE_URL")
  try {
    const body = await cached("bajs", 30_000, async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(12_000) })
      if (!response.ok) throw new Error(`Nextbike ${response.status}`)
      const payload = (await response.json()) as NextbikeResponse
      return {
        stations: normalizeNextbike(payload),
        fetchedAt: new Date().toISOString(),
        source: "proxy",
      }
    })
    return c.body(body, 200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30",
    })
  } catch (error) {
    console.error(error)
    return c.json({ error: "Stanice Bajsa trenutačno nisu dostupne." }, 502)
  }
})

api.get("/api/geocode", async (c) => {
  const query = (c.req.query("q") ?? "").trim().slice(0, 120)
  if (query.length < 3) return c.json({ results: [] })
  try {
    const results = await geocode(query, { bias: ZAGREB_CENTER })
    return c.json({ results }, 200, { "cache-control": "public, max-age=60" })
  } catch (error) {
    if (!(error instanceof SearchUnavailableError)) console.error(error)
    const message = error instanceof Error ? error.message : "Pretraga trenutno nije dostupna"
    return c.json({ error: message, results: [] }, 503)
  }
})

api.post("/api/valhalla/:action", async (c) => {
  const action = c.req.param("action")
  if (action !== "route" && action !== "sources_to_targets") {
    return c.json({ error: "Nepodržana akcija rutiranja." }, 404)
  }
  const upstream = readEnv(c.env, "VALHALLA_URL").replace(/\/$/, "")
  const payload = await c.req.text()
  try {
    const response = await fetch(`${upstream}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(12_000),
    })
    const body = await response.text()
    return c.body(body, response.status as 200, { "content-type": "application/json; charset=utf-8" })
  } catch (error) {
    console.error(error)
    return c.json({ error: "Poslužitelj za rutiranje nije dostupan." }, 502)
  }
})
