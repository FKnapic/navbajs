import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { searchPlaces } from "../src/data/zagrebPlaces.ts"

describe("lokalna mjesta", () => {
  it("fer otvara fakultet elektrotehnike", () => {
    const [first] = searchPlaces("fer")
    assert.match(first.title, /elektrotehnike/i)
    assert.ok(Math.abs(first.lat - 45.80059) < 0.002)
  })

  it("prepoznaje skraćenice fakulteta", () => {
    assert.match(searchPlaces("ffzg")[0].title, /Filozofski/)
    assert.match(searchPlaces("pmf")[0].title, /Prirodoslovno/)
    assert.match(searchPlaces("FER")[0].title, /elektrotehnike/)
    assert.match(searchPlaces("unska 3")[0].title, /elektrotehnike/)
  })

  it("kratki prefiks ulice ne hvata fakultet", () => {
    assert.equal(searchPlaces("Ili").length, 0)
  })
})
