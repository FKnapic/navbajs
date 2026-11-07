import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { clearGeocodeCache, geocode, SearchUnavailableError } from "../src/api/geocode"
import { haversineM } from "../src/lib/geo"
import type { GeocodeResult } from "../src/types/places"

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function search(query: string): Promise<GeocodeResult[]> {
  let last: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      clearGeocodeCache()
      const results = await geocode(query)
      await pause(800)
      return results
    } catch (error) {
      last = error
      if (!(error instanceof SearchUnavailableError) || attempt === 3) throw error
      await pause(1200 * (attempt + 1))
    }
  }
  throw last
}

function matches(result: GeocodeResult, pattern: RegExp): boolean {
  return pattern.test(`${result.title} ${result.label} ${result.subtitle}`)
}

const examples: Array<{ query: string; pattern: RegExp; approximate?: boolean; near?: { lat: number; lng: number } }> = [
  { query: "Ilica 10", pattern: /\bIlica 10\b/, near: { lat: 45.813386, lng: 15.974233 } },
  { query: "Ilica 10a", pattern: /Ilica/, approximate: true, near: { lat: 45.813386, lng: 15.974233 } },
  { query: "Ilica 101", pattern: /\bIlica 101\b/ },
  { query: "Savska cesta 25", pattern: /Savska cesta 25/ },
  { query: "Savska 25", pattern: /Savska cesta 25/ },
  { query: "Trg bana Jelacica", pattern: /Jelačić/ },
  { query: "Trg bana Jelačića", pattern: /Jelačić/ },
  { query: "Vukovarska 58", pattern: /Vukovar/ },
  { query: "Heinzelova 33", pattern: /Heinzel/ },
  { query: "Draškovićeva 80", pattern: /Drašković/ },
  { query: "Gajeva 4, Zagreb", pattern: /Gajeva ulica 4/ },
  { query: "Zagreb Ilica 5", pattern: /\bIlica 5\b/ },
  { query: "Maksimirska 120", pattern: /Maksimirska cesta 120/ },
  { query: "Avenija Dubrovnik 15", pattern: /Dubrovnik 15\b/ },
  { query: "Jarunska 2", pattern: /Jarunska ulica 2/ },
  { query: "Tkalčićeva", pattern: /Tkalčićeva/ },
  { query: "Britanski trg", pattern: /Britanski trg/ },
  { query: "Glavni kolodvor", pattern: /kolodvor/i },
  { query: "Importanne", pattern: /Importanne/i },
  { query: "Arena Zagreb", pattern: /Arena/ },
]

describe("žive zagrebačke adrese", { concurrency: 1 }, () => {
  for (const example of examples) {
    it(example.query, async () => {
      const results = await search(example.query)
      assert.ok(results.length > 0, "nema prijedloga")
      const hit = results.slice(0, 2).find((item) => matches(item, example.pattern))
      assert.ok(hit, `prva dva: ${results.slice(0, 2).map((item) => item.label).join(" | ")}`)
      if (example.approximate && !new RegExp(example.pattern.source.replace("Ilica", "Ilica 10a"), "i").test(hit.label)) {
        assert.equal(hit.approximate, true)
      }
      if (example.near && hit) {
        assert.ok(haversineM(hit, example.near) < 50, `${haversineM(hit, example.near).toFixed(0)} m`)
      }
      assert.ok(results.length <= 8)
    })
  }

  it("prijedlog kreće od tri znaka, a kraći upit šuti", async () => {
    assert.deepEqual(await geocode("Il"), [])
    const results = await search("Ili")
    assert.ok(results.length > 0)
  })
})
