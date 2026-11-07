/**
 * Preuzme službene kućne brojeve Zagreba jednom i spremi kompaktan indeks.
 * Pokreni: npx tsx scripts/fetch-houses.ts
 */
import { writeFile } from "node:fs/promises"

const LAYER =
  "https://arcportal.zagreb.hr/server/rest/services/DKPiRPJ/KBR_kućni_broj/MapServer/1/query"
const PAGE = 2000
const TOTAL = 138329

interface Feature {
  attributes?: { UL_IME?: string; KB?: string; GC_IME?: string }
  geometry?: { x?: number; y?: number }
}

async function page(start: number): Promise<Feature[]> {
  const url = new URL(LAYER)
  url.searchParams.set("where", `FID>=${start} AND FID<${start + PAGE}`)
  url.searchParams.set("outFields", "UL_IME,KB,GC_IME")
  url.searchParams.set("returnGeometry", "true")
  url.searchParams.set("outSR", "4326")
  url.searchParams.set("f", "json")
  let last: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(String(response.status))
      const payload = (await response.json()) as { features?: Feature[]; error?: { message?: string } }
      if (payload.error) throw new Error(payload.error.message ?? "query")
      return payload.features ?? []
    } catch (error) {
      last = error
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
    }
  }
  throw last
}

async function main() {
  const streets: string[] = []
  const streetId = new Map<string, number>()
  const areas: string[] = []
  const areaId = new Map<string, number>()
  const rows: Array<[number, string, number, number, number]> = []
  const starts: number[] = []
  for (let start = 0; start < TOTAL; start += PAGE) starts.push(start)
  let cursor = 0
  async function worker() {
    for (;;) {
      const start = starts[cursor]
      cursor += 1
      if (start == null) return
      const features = await page(start)
      for (const feature of features) {
        const street = feature.attributes?.UL_IME?.trim() ?? ""
        const house = feature.attributes?.KB?.trim() ?? ""
        const lng = feature.geometry?.x
        const lat = feature.geometry?.y
        if (!street || !house || typeof lat !== "number" || typeof lng !== "number") continue
        let sid = streetId.get(street)
        if (sid == null) {
          sid = streets.length
          streets.push(street)
          streetId.set(street, sid)
        }
        const area = feature.attributes?.GC_IME?.trim() || ""
        let aid = areaId.get(area)
        if (aid == null) {
          aid = areas.length
          areas.push(area)
          areaId.set(area, aid)
        }
        rows.push([sid, house, Math.round(lat * 1e5), Math.round(lng * 1e5), aid])
      }
      console.log(`${start} +${features.length} ukupno ${rows.length}`)
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => worker()))
  const payload = { s: streets, a: areas, r: rows }
  await writeFile("public/data/houses.json", JSON.stringify(payload))
  console.log(`ulica ${streets.length}, kuća ${rows.length}`)
}

void main()
