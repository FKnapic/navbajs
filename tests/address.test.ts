import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { geocode, clearGeocodeCache, SearchUnavailableError } from "../src/api/geocode"
import { houseWhere, pickOfficialHits } from "../src/api/zagrebAddresses"
import { installHousePack, searchIndexedHouses } from "../src/data/houseIndex"
import {
  fold,
  housesEqual,
  parseAddressQuery,
  rankHits,
  streetMatches,
  type PhotonHit,
} from "../src/lib/addressQuery"
import { ZAGREB_CENTER } from "../src/lib/geo"

function hit(partial: Partial<PhotonHit> & Pick<PhotonHit, "lat" | "lng">): PhotonHit {
  return {
    name: "",
    street: "",
    housenumber: "",
    locality: "Donji grad",
    district: "Donji grad",
    city: "Zagreb",
    kind: "house",
    addressPoint: false,
    ...partial,
  }
}

describe("normalizacija upita", () => {
  it("skida višestruke razmake, Zagreb i zalijepljeni broj", () => {
    const parsed = parseAddressQuery("  Zagreb   Ilica10  ")
    assert.equal(parsed.text, "Ilica 10")
    assert.equal(parsed.house, "10")
    assert.equal(parsed.street, "Ilica")
  })

  it("prihvaća broj ispred ulice i isti savijeni zapis", () => {
    const reversed = parseAddressQuery("10 Ilica")
    assert.equal(reversed.street, "Ilica")
    assert.equal(reversed.house, "10")
    assert.equal(reversed.text, "Ilica 10")
    assert.equal(parseAddressQuery("10a Ilica").house, "10a")
    assert.equal(fold("Šubićeva"), fold("Subiceva"))
    const where = houseWhere(parseAddressQuery("Subiceva 4"), true) ?? ""
    assert.match(where, /Šubićeva/)
  })

  it("prepoznaje kratice i grad na kraju", () => {
    assert.equal(parseAddressQuery("ul. Ilica 10").text, "Ilica 10")
    assert.equal(parseAddressQuery("Savska c. 25").text, "Savska cesta 25")
    assert.equal(parseAddressQuery("av. Dubrovnik 15").text, "avenija Dubrovnik 15")
    assert.equal(parseAddressQuery("tr. bana Jelačića").street, "trg bana Jelačića")
    assert.equal(parseAddressQuery("Gajeva 4, Zagreb").text, "Gajeva 4")
    assert.equal(parseAddressQuery("Britanski trg").text, "Britanski trg")
    assert.equal(parseAddressQuery("Ilica br. 10").text, "Ilica 10")
    assert.equal(parseAddressQuery("Ulica kneza Branimira 20").text, "Ulica kneza Branimira 20")
  })

  it("ostavlja Zagreb kad je dio imena mjesta", () => {
    assert.equal(parseAddressQuery("Arena Zagreb").text, "Arena Zagreb")
  })

  it("širi okvir samo kad upit spominje okolicu", () => {
    assert.equal(parseAddressQuery("Ilica 10").wider, false)
    assert.equal(parseAddressQuery("Velika Gorica, Ulica kralja Zvonimira 1").wider, true)
  })

  it("izjednačava kućne brojeve i dijakritike", () => {
    assert.equal(housesEqual("10a", "10A"), true)
    assert.equal(housesEqual("10a", "10/a"), true)
    assert.equal(housesEqual("10", "10a"), false)
    assert.equal(housesEqual("10", "101"), false)
    assert.equal(housesEqual("101", "10/1"), false)
    assert.equal(housesEqual("10-a", "10a"), true)
    assert.equal(fold("Draškovićeva"), "draskoviceva")
    assert.equal(fold("Jelačića"), fold("Jelacica"))
  })
})

describe("rangiranje", () => {
  const center = ZAGREB_CENTER
  const ilica10 = hit({ street: "Ilica", housenumber: "10", lat: 45.81339, lng: 15.97423 })
  const ilica102 = hit({ street: "Ilica", housenumber: "102", name: "Hotel Ilica", lat: 45.81243, lng: 15.96296 })
  const vukovar = hit({
    street: "Ulica grada Vukovara",
    housenumber: "10",
    lat: 45.8,
    lng: 15.97,
  })

  it("ne miješa Ilicu i Ulicu", () => {
    assert.equal(streetMatches("Ilica", ilica10), true)
    assert.equal(streetMatches("Ilica", vukovar), false)
  })

  it("točan kućni broj ide ispred fuzzy podudaranja", () => {
    const ranked = rankHits([ilica102, ilica10], parseAddressQuery("Ilica 10"), center)
    assert.equal(ranked[0]?.title, "Ilica 10")
    assert.equal(ranked[0]?.approximate, undefined)
  })

  it("10a nije 102, nego približna točka na istoj ulici", () => {
    const ranked = rankHits([ilica102, ilica10], parseAddressQuery("Ilica 10a"), center)
    assert.equal(ranked.length, 1)
    assert.equal(ranked[0]?.approximate, true)
    assert.equal(ranked[0]?.lat, ilica10.lat)
    assert.match(ranked[0]?.subtitle ?? "", /približna lokacija/)
  })

  it("odbacuje točke izvan Zagreba i duplikate", () => {
    const vienna = hit({ street: "Ilica", housenumber: "10", lat: 48.2, lng: 16.37, city: "Beč" })
    const copy = hit({ ...ilica10 })
    const ranked = rankHits([vienna, ilica10, copy], parseAddressQuery("Ilica 10"), center)
    assert.equal(ranked.length, 1)
    assert.equal(ranked[0]?.subtitle.includes("Zagreb"), true)
  })

  it("101 nije ulaz 10/1 iako je ulaz bliže središtu", () => {
    const entrance = hit({ street: "Ilica", housenumber: "10/1", lat: 45.8137, lng: 15.9744 })
    const house = hit({ street: "Ilica", housenumber: "101", lat: 45.8127, lng: 15.9606 })
    const ranked = rankHits([entrance, house], parseAddressQuery("Ilica 101"), center)
    assert.equal(ranked[0]?.title, "Ilica 101")
    assert.equal(ranked[0]?.approximate, undefined)
  })

  it("kolokvijalni naziv pogađa službenu ulicu", () => {
    const vukovar = hit({ street: "Ulica grada Vukovara", housenumber: "58", lat: 45.7994, lng: 15.9665, district: "Trnje" })
    const heinzel = hit({
      street: "Ulica Vjekoslava Heinzela",
      housenumber: "33",
      lat: 45.8108,
      lng: 16.002,
      district: "Peščenica - Žitnjak",
    })
    assert.equal(rankHits([vukovar], parseAddressQuery("Vukovarska 58"), center)[0]?.title, "Ulica grada Vukovara 58")
    assert.equal(rankHits([heinzel], parseAddressQuery("Heinzelova 33"), center)[0]?.title, "Ulica Vjekoslava Heinzela 33")
  })

  it("obala ne pretekne ulicu kad upit ne kaže obala", () => {
    const shore = hit({ street: "Jarunska obala", housenumber: "2", lat: 45.802, lng: 15.96, name: "Obala" })
    const street = hit({ street: "Jarunska ulica", housenumber: "2", lat: 45.785, lng: 15.948, name: "Dom" })
    const ranked = rankHits([shore, street], parseAddressQuery("Jarunska 2"), center)
    assert.equal(ranked[0]?.title, "Jarunska ulica 2")
  })

  it("Radićeva nije Radićevo šetalište", () => {
    const walk = hit({ street: "Radićevo šetalište", housenumber: "4", lat: 45.8306, lng: 15.9795 })
    const street = hit({ street: "Radićeva ulica", housenumber: "4", lat: 45.814, lng: 15.977 })
    assert.equal(streetMatches("Radićeva", walk), false)
    assert.equal(rankHits([walk], parseAddressQuery("Radićeva 4"), center).length, 0)
    assert.equal(rankHits([walk, street], parseAddressQuery("Radićeva 4"), center)[0]?.title, "Radićeva ulica 4")
  })

  it("isti kućni broj bira zgradu, ne lokal bliže središtu", () => {
    const shop = hit({ street: "Vlaška ulica", housenumber: "40", name: "Škola", lat: 45.81301, lng: 15.98268 })
    const building = hit({
      street: "Vlaška ulica",
      housenumber: "40",
      name: "Hotel Sidro",
      lat: 45.81379,
      lng: 15.98279,
      addressPoint: true,
    })
    const ranked = rankHits([shop, building], parseAddressQuery("Vlaška 40"), center)
    assert.equal(ranked[0]?.lat, building.lat)
  })

  it("dva ista broja: bliži središtu grada", () => {
    const far = hit({ street: "Ozaljska ulica", housenumber: "12", lat: 45.82546, lng: 16.11291, addressPoint: true })
    const near = hit({ street: "Ozaljska ulica", housenumber: "12", lat: 45.79991, lng: 15.95257, addressPoint: true })
    const ranked = rankHits([far, near], parseAddressQuery("Ozaljska 12"), center)
    assert.equal(ranked[0]?.lng, near.lng)
  })

  it("kućni broj ne preuzima drugu ulicu iz imena lokala", () => {
    const other = hit({ street: "Zagrebačka cesta", housenumber: "10", name: "Nova trgovina", lat: 45.82, lng: 16.1 })
    assert.equal(streetMatches("Nova cesta", other), false)
    assert.equal(rankHits([other], parseAddressQuery("Nova cesta 10"), center).length, 0)
    const sigetje = hit({ street: "Sigetje", housenumber: "18", lat: 45.75, lng: 16.0 })
    assert.equal(streetMatches("Šubićeva", hit({ street: "Ulica Pavla Šubića", housenumber: "20", lat: 45.81, lng: 15.98 })), true)
    assert.equal(streetMatches("Podsusedska", hit({ street: "Podsusedsko dolje", housenumber: "10", lat: 45.83, lng: 15.85 })), false)
    assert.equal(streetMatches("Siget", sigetje), false)
  })

  it("tri slova predlažu ulicu koja tako počinje", () => {
    assert.equal(streetMatches("Ili", hit({ street: "Ilica", housenumber: "", lat: 45.81, lng: 15.97 })), true)
    assert.equal(streetMatches("Ili", hit({ street: "Ulica grada Vukovara", housenumber: "", lat: 45.8, lng: 15.97 })), false)
  })

  it("skraćeno ime ulice pogađa službeni naziv", () => {
    const savska = hit({ street: "Savska cesta", housenumber: "25", lat: 45.80357, lng: 15.96692, name: "Studentski centar" })
    const ranked = rankHits([savska], parseAddressQuery("Savska 25"), center)
    assert.equal(ranked[0]?.title, "Savska cesta 25")
  })
})

describe("službeni kućni brojevi", () => {
  it("traži korijen kolokvijalnog imena i broj", () => {
    const where = houseWhere(parseAddressQuery("Vukovarska 58"), true) ?? ""
    assert.match(where, /Vukovar/)
    assert.match(where, /KB = '58'/)
    const bologne = houseWhere(parseAddressQuery("Aleja Bologne 5"), true) ?? ""
    assert.match(bologne, /Bolonje/)
    const branimira = houseWhere(parseAddressQuery("Ulica kneza Branimira 20"), true) ?? ""
    assert.match(branimira, /knez/i)
    assert.match(branimira, /Branimir/)
    assert.equal(
      streetMatches("Aleja Bologne", hit({ street: "Aleja grada Bolonje", housenumber: "6", lat: 45.81, lng: 15.89 })),
      true,
    )
  })

  it("bliža istoimena ulica pobjeđuje daleki točan broj", () => {
    const parsed = parseAddressQuery("Selska cesta 40")
    const far = hit({ street: "Selska cesta", housenumber: "40", lat: 45.8252, lng: 16.145, addressPoint: true })
    const near = hit({ street: "Selska cesta", housenumber: "39", lat: 45.80919, lng: 15.94217, addressPoint: true })
    const picked = pickOfficialHits([far], [far, near], parsed, ZAGREB_CENTER)
    assert.equal(picked[0]?.housenumber, "39")
    const ranked = rankHits(picked, parsed, ZAGREB_CENTER)
    assert.equal(ranked[0]?.approximate, true)
  })

  it("bliži broj pobjeđuje dalji broj koji je bliže središtu", () => {
    const parsed = parseAddressQuery("Siget 18")
    const sixteen = hit({ street: "Siget", housenumber: "16A", lat: 45.77411, lng: 15.96864, addressPoint: true })
    const eighteen = hit({ street: "Siget", housenumber: "18A", lat: 45.77181, lng: 15.96797, addressPoint: true })
    const picked = pickOfficialHits([], [sixteen, eighteen], parsed, ZAGREB_CENTER)
    assert.equal(picked[0]?.housenumber, "18A")
  })

  it("točan broj u središtu ostaje i bez drugog upita", () => {
    const parsed = parseAddressQuery("Ilica 10")
    const house = hit({ street: "Ilica", housenumber: "10", lat: 45.81314, lng: 15.97447, addressPoint: true })
    const picked = pickOfficialHits([house], [], parsed, ZAGREB_CENTER)
    assert.equal(picked[0]?.housenumber, "10")
  })

  it("geokoder uzima službenu točku i ne zove Photon", async () => {
    clearGeocodeCache()
    const original = globalThis.fetch
    let photon = 0
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("photon")) photon += 1
      return new Response(
        JSON.stringify({
          features: [
            {
              attributes: { UL_IME: "Ulica grada Vukovara", KB: "58", NA_IME: "Zagreb", GC_IME: "Trnje" },
              geometry: { x: 15.96646, y: 45.79939 },
            },
          ],
        }),
      )
    }) as typeof fetch
    try {
      const results = await geocode("Vukovarska 58")
      assert.equal(results[0]?.title, "Ulica grada Vukovara 58")
      assert.equal(photon, 0)
    } finally {
      globalThis.fetch = original
      clearGeocodeCache()
    }
  })
})

describe("jedan zahtjev u letu", () => {
  it("otkazuje prethodni upit i ne drži dva zahtjeva odjednom", async () => {
    clearGeocodeCache()
    let inflight = 0
    let max = 0
    const original = globalThis.fetch
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const query = new URL(String(input)).searchParams.get("q") ?? ""
      inflight += 1
      max = Math.max(max, inflight)
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => {
          inflight -= 1
          const number = query.match(/\d+/)?.[0] ?? ""
          resolve(
            new Response(
              JSON.stringify({
                features: [
                  {
                    geometry: { coordinates: [15.97423, 45.81339] },
                    properties: {
                      street: "Ilica",
                      housenumber: number,
                      city: "Zagreb",
                      locality: "Donji grad",
                      type: "house",
                    },
                  },
                ],
              }),
            ),
          )
        }, 40)
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer)
          inflight -= 1
          reject(new DOMException("Otkazano", "AbortError"))
        })
      })
    }) as typeof fetch
    try {
      const first = geocode("Ilica 10").then(
        () => null,
        (error: unknown) => error,
      )
      const second = await geocode("Ilica 101")
      assert.ok((await first) instanceof DOMException)
      assert.equal(max, 1)
      assert.equal(second[0]?.title, "Ilica 101")
    } finally {
      globalThis.fetch = original
      clearGeocodeCache()
    }
  })

  it("429 postaje poruka da pretraga nije dostupna", async () => {
    clearGeocodeCache()
    const original = globalThis.fetch
    globalThis.fetch = (async () => new Response("no", { status: 429 })) as typeof fetch
    try {
      await assert.rejects(geocode("Ilica 10"), (error: unknown) => error instanceof SearchUnavailableError)
    } finally {
      globalThis.fetch = original
      clearGeocodeCache()
    }
  })
})

describe("lokalni indeks kućnih brojeva", () => {
  it("nađe broj, približan broj i zapis bez dijakritika", () => {
    installHousePack({
      s: ["Ilica", "Šubićeva ulica"],
      a: ["Gornji grad"],
      r: [
        [0, "10", 4581339, 1597423, 0],
        [0, "12", 4581400, 1597500, 0],
        [1, "4", 4581500, 1598000, 0],
      ],
    })
    const exact = searchIndexedHouses(parseAddressQuery("10 Ilica"), ZAGREB_CENTER)
    assert.equal(exact?.[0]?.title, "Ilica 10")
    const approx = searchIndexedHouses(parseAddressQuery("Ilica 11"), ZAGREB_CENTER)
    assert.equal(approx?.[0]?.approximate, true)
    const folded = searchIndexedHouses(parseAddressQuery("Subiceva 4"), ZAGREB_CENTER)
    assert.equal(folded?.[0]?.title, "Šubićeva ulica 4")
  })
})
