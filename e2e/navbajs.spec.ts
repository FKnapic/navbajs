import type { Page } from "@playwright/test"
import {
  expect,
  fulfillValhalla,
  installMocks,
  JELACIC,
  openApp,
  photonFeature,
  searchAndPick,
  station,
  test,
} from "./support"

async function ready(page: Page) {
  await expect(page.getByRole("button", { name: /Najbliža stanica/ })).toBeVisible()
}

test.describe("učitavanje", () => {
  test("karta, stanice, slojevi i tema", async ({ page }) => {
    await installMocks(page)
    await openApp(page)
    await ready(page)
    await page.waitForFunction(() => {
      const map = (window as unknown as { __navbajsMap?: { getLayer: (id: string) => unknown; queryRenderedFeatures: (options: { layers: string[] }) => { properties?: { bikes?: unknown; point_count?: unknown } }[] } }).__navbajsMap
      if (!map?.getLayer("clusters")) return false
      const clusters = map.queryRenderedFeatures({ layers: ["clusters"] })
      const bikes = clusters.reduce((sum, feature) => sum + Number(feature.properties?.bikes ?? 0), 0)
      const count = clusters.reduce((sum, feature) => sum + Number(feature.properties?.point_count ?? 0), 0)
      return clusters.length > 0 && bikes === 22 && count === 6
    })
    await page.evaluate(() => {
      const map = (window as unknown as { __navbajsMap?: { jumpTo: (options: unknown) => void; once: (event: string, cb: () => void) => void } }).__navbajsMap
      return new Promise<void>((resolve) => {
        map?.once("idle", () => resolve())
        map?.jumpTo({ center: [15.9773, 45.8132], zoom: 16 })
      })
    })
    await page.waitForFunction(() => {
      const map = (window as unknown as { __navbajsMap?: { queryRenderedFeatures: (options: { layers: string[] }) => unknown[] } }).__navbajsMap
      const stations = map?.queryRenderedFeatures({ layers: ["stations"] }).length ?? 0
      const clusters = map?.queryRenderedFeatures({ layers: ["clusters"] }).length ?? 0
      return stations > 0 && clusters === 0
    })
    await page.getByRole("button", { name: "Filtar" }).click()
    await page.getByRole("checkbox", { name: "Parkirališta za bicikle" }).uncheck()
    await page.getByRole("checkbox", { name: "Biciklističke staze" }).uncheck()
    await page.getByRole("checkbox", { name: "Parkirališta za bicikle" }).check()
    await page.getByRole("button", { name: "Uključi tamnu temu" }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.getByRole("button", { name: "Uključi svijetlu temu" }).click()
    await expect(page.locator("html")).not.toHaveClass(/dark/)
  })
})

test.describe("lokacija i pretraga", () => {
  test("fer predlaže Fakultet elektrotehnike i računarstva", async ({ page }) => {
    await installMocks(page)
    await openApp(page)
    await ready(page)
    await page.getByRole("button", { name: "Moja lokacija", exact: true }).click()
    const field = page.getByRole("combobox", { name: "Odredište" })
    await field.click()
    const started = Date.now()
    await field.fill("fer")
    const suggestion = page.getByRole("button", { name: /Fakultet elektrotehnike i računarstva/ })
    await expect(suggestion).toBeVisible()
    expect(Date.now() - started).toBeLessThan(1000)
    await suggestion.click()
    await expect(page.getByRole("radio", { name: /^Pješice/ })).toBeVisible()
    await expect(page.getByRole("radio", { name: /^Bajs/ })).toBeVisible()
    await expect(page.getByRole("radio", { name: /^Svoj bicikl/ })).toBeVisible()
  })

  test("dopuštena lokacija i centriranje", async ({ page }) => {
    await installMocks(page)
    await openApp(page)
    await ready(page)
    await page.getByRole("button", { name: "Moja lokacija", exact: true }).click()
    await expect(page.locator(".user-dot")).toBeVisible()
    await page.getByRole("button", { name: "Centriraj na moju lokaciju" }).click()
    const center = await page.evaluate(() => {
      const map = (window as unknown as { __navbajsMap?: { getCenter: () => { lat: number; lng: number } } }).__navbajsMap
      const point = map?.getCenter()
      return point ? { lat: point.lat, lng: point.lng } : null
    })
    expect(center?.lat).toBeCloseTo(JELACIC.latitude, 2)
    expect(center?.lng).toBeCloseTo(JELACIC.longitude, 2)
  })

  test("odbijena lokacija ne ruši aplikaciju", async ({ page }) => {
    await page.addInitScript(() => {
      const error = { code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "denied" }
      navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.(error as GeolocationPositionError)
    })
    await installMocks(page)
    await page.goto("/")
    await page.getByRole("button", { name: "Moja lokacija", exact: true }).click()
    await expect(page.getByText(/Pristup lokaciji je odbijen/)).toBeVisible()
    await page.getByRole("button", { name: "Upiši polazište" }).click()
    await expect(page.getByRole("textbox", { name: "Polazište" })).toBeVisible()
  })

  test("lokacija izvan Zagreba pokazuje upozorenje", async ({ page, context }) => {
    await context.setGeolocation({ latitude: 48.208, longitude: 16.373 })
    await installMocks(page, {
      photon: async (route) => {
        await route.fulfill({ json: { features: [photonFeature("Ilica", "10", 45.81339, 15.97423)] } })
      },
    })
    await openApp(page)
    await searchAndPick(page, "Ilica 10", /Ilica 10/)
    await expect(page.getByText(/izvan okvira Zagreba/)).toBeVisible()
  })

  test("odabir, zamjena, isto mjesto, brisanje i utrka upita", async ({ page }) => {
    let active = 0
    let max = 0
    await installMocks(page, {
      photon: async (route) => {
        const query = new URL(route.request().url()).searchParams.get("q") ?? ""
        if (route.request().url().includes("/reverse")) {
          await route.fulfill({ json: { features: [photonFeature("Ilica", "10", 45.81339, 15.97423)] } })
          return
        }
        active += 1
        max = Math.max(max, active)
        await page.waitForTimeout(350)
        active -= 1
        if (query.includes("Aaa")) {
          await route.fulfill({ json: { features: [photonFeature("Aaa", "1", 45.82, 15.99)] } }).catch(() => undefined)
          return
        }
        await route.fulfill({ json: { features: [photonFeature("Ilica", "10", 45.81339, 15.97423)] } }).catch(() => undefined)
      },
    })
    await openApp(page)
    await ready(page)
    await page.getByRole("button", { name: "Moja lokacija", exact: true }).click()
    const field = page.getByRole("combobox", { name: "Odredište" })
    await field.click()
    await field.fill("Aaa")
    await page.waitForTimeout(320)
    await field.fill("Ilica 10")
    await expect(page.getByRole("button", { name: /Ilica 10/ }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: /Aaa 1/ })).toHaveCount(0)
    expect(max).toBeLessThanOrEqual(2)
    await page.getByRole("button", { name: /Ilica 10/ }).first().click()
    await expect(page.getByRole("button", { name: "Kreni" })).toBeVisible()
    await page.getByRole("button", { name: /Ilica 10/ }).click()
    await page.getByRole("button", { name: "Zamijeni polazište i odredište" }).click()
    await expect(page.getByRole("button", { name: "Moja lokacija" })).toBeVisible()
    await page.getByRole("button", { name: "Moja lokacija" }).click()
    await field.fill("")
    await field.fill("Ilica 10")
    await page.getByRole("button", { name: /Ilica 10/ }).first().click()
  })

  test("isto polazište i odredište ne crta rutu", async ({ page }) => {
    await installMocks(page, {
      photon: async (route) => {
        await route.fulfill({
          json: { features: [photonFeature("", "", JELACIC.latitude, JELACIC.longitude, "Isto mjesto")] },
        })
      },
    })
    await openApp(page)
    await ready(page)
    await searchAndPick(page, "Isto mjesto", /Isto mjesto/)
    await expect(page.getByText("Polazište i odredište su isto mjesto.").first()).toBeVisible()
    await expect(page.getByRole("button", { name: "Kreni" })).toBeDisabled()
  })

  test("prazna pretraga i pretraga nedostupna ostavljaju odabir na karti", async ({ page }) => {
    await installMocks(page, {
      photon: async (route) => {
        const query = new URL(route.request().url()).searchParams.get("q") ?? ""
        if (query.includes("nedostup")) await route.fulfill({ status: 429, body: "" })
        else await route.fulfill({ json: { features: [] } })
      },
    })
    await openApp(page)
    const field = page.getByRole("combobox", { name: "Odredište" })
    await field.click()
    await field.fill("zz")
    await expect(page.getByText(/Nema rezultata/)).toHaveCount(0)
    await field.fill("zzz")
    await expect(page.getByText(/Nema rezultata za 'zzz'/)).toBeVisible()
    await expect(page.getByRole("button", { name: "Odaberi na karti" })).toBeVisible()
    await field.fill("nedostupno")
    await expect(page.getByText("Pretraga trenutno nije dostupna")).toBeVisible()
    await expect(page.getByRole("button", { name: "Pokušaj ponovno" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Odaberi na karti" })).toBeVisible()
  })

  test("tipkovnica otvara, bira i zatvara prijedloge", async ({ page }) => {
    await installMocks(page)
    await openApp(page)
    const field = page.getByRole("combobox", { name: "Odredište" })
    await field.click()
    await field.fill("Ilica 10")
    await expect(page.getByRole("button", { name: "Odaberi na karti" })).toBeVisible()
    await page.keyboard.press("Tab")
    await expect(page.getByRole("button", { name: "Odaberi na karti" })).toBeVisible()
    await field.press("Escape")
    await expect(page.getByRole("button", { name: "Odaberi na karti" })).toHaveCount(0)
    await field.click()
    await field.fill("Ilica 10")
    await expect(page.getByRole("button", { name: /Ilica 10/ })).toBeVisible()
    await field.press("Enter")
    await expect(page.getByRole("button", { name: "Kreni" })).toBeVisible()
  })
})

test.describe("rute", () => {
  test("vremena uključuju dodane minute i napomenu da je pješice brže", async ({ page }) => {
    await installMocks(page, { valhalla: (route) => fulfillValhalla(route, { pedestrian: 100, bicycle: 200 }) })
    await openApp(page)
    await ready(page)
    await searchAndPick(page, "Ilica 10", /Ilica 10/)
    await expect(page.getByRole("radio", { name: /^Bajs/ })).toContainText("4 min")
    await expect(page.getByRole("radio", { name: /^Pješice/ })).toContainText("2 min")
    await expect(page.getByText("Pješice je brže")).toBeVisible()
    await page.getByRole("radio", { name: /^Bajs/ }).click()
    await page.getByRole("button", { name: "Prikaži korake" }).click()
    const penalty = page.getByText("Ukupno vrijeme uključuje 1 min za preuzimanje i 1 min za vraćanje bicikla.")
    await penalty.scrollIntoViewIfNeeded()
    await expect(penalty).toBeVisible()
  })

  test("nema bicikla, nema mjesta i stanica u održavanju", async ({ page }) => {
    const stations = [station(1, "Prazna", 45.8132, 15.9772, 0, 4)]
    await installMocks(page, { stations })
    await openApp(page)
    await ready(page)
    await searchAndPick(page, "Ilica 10", /Ilica 10/)
    await expect(page.getByText("Nema slobodnih bicikala")).toBeVisible()
    stations.splice(0, stations.length, station(1, "Puna", 45.8132, 15.9772, 4, 0))
    await page.reload()
    await ready(page)
    await searchAndPick(page, "Ilica 10", /Ilica 10/)
    await expect(page.getByText("Nema slobodnih mjesta")).toBeVisible()
    stations.splice(
      0,
      stations.length,
      station(1, "Servis", 45.8132, 15.9772, 8, 4, true),
      station(2, "Radna", 45.816, 15.98, 3, 3),
    )
    await page.reload()
    await ready(page)
    await searchAndPick(page, "Ilica 10", /Ilica 10/)
    await page.getByRole("radio", { name: /^Bajs/ }).click()
    await expect(page.getByText("Servis")).toHaveCount(0)
    await expect(page.getByText("Radna")).toBeVisible()
  })

  test("vlastiti bicikl bira parkiralište po udaljenosti", async ({ page }) => {
    const dest = { lat: 45.81, lng: 15.98 }
    await installMocks(page)
    await openApp(page)
    const cases = [
      { name: "Blizu", lat: dest.lat + 0.0016, warning: null as RegExp | null },
      { name: "Dalje", lat: dest.lat + 0.0042, warning: /600 m/ },
    ]
    for (const item of cases) {
      await page.unroute("**/photon.komoot.io/**")
      await page.unroute("**/data/osm-parking.json")
      await page.route("**/photon.komoot.io/**", (route) =>
        route.fulfill({ json: { features: [photonFeature("Jarunska", "2", dest.lat, dest.lng)] } }),
      )
      await page.route("**/data/osm-parking.json", (route) =>
        route.fulfill({ json: [{ id: "p1", name: item.name, lat: item.lat, lng: dest.lng, kind: "stands" }] }),
      )
      await page.reload()
      await ready(page)
      await searchAndPick(page, "Jarunska 2", /Jarunska 2/)
      await page.getByRole("radio", { name: /Svoj bicikl/ }).click()
      await expect(page.getByText(item.name)).toBeVisible()
      if (item.warning) await expect(page.getByText(item.warning)).toBeVisible()
      else await expect(page.getByText(/600 m/)).toHaveCount(0)
    }
    await page.unroute("**/data/osm-parking.json")
    await page.unroute("**/data/lanes.geojson")
    await page.route("**/data/osm-parking.json", (route) => route.fulfill({ json: [] }))
    await page.route("**/data/lanes.geojson", (route) => route.fulfill({ status: 404, body: "" }))
    await page.reload()
    await ready(page)
    await searchAndPick(page, "Jarunska 2", /Jarunska 2/)
    await page.getByRole("radio", { name: /Svoj bicikl/ }).click()
    await expect(page.getByText(/vežite/i)).toBeVisible()
    await expect(page.getByText(/% vožnje/)).toHaveCount(0)
  })

  test("duga vožnja upozorava na cijenu", async ({ page }) => {
    await installMocks(page, {
      stations: [station(1, "Polazak", 45.8132, 15.9775, 6, 0), station(2, "Povrat", 45.8134, 15.9742, 0, 6)],
      valhalla: (route) => fulfillValhalla(route, { bicycle: 2000, pedestrian: 80 }),
    })
    await openApp(page)
    await ready(page)
    await searchAndPick(page, "Ilica 10", /Ilica 10/)
    await page.getByRole("radio", { name: /^Bajs/ }).click()
    await expect(page.getByText(/dulje od 30 minuta/)).toBeVisible()
  })

  test("poslužitelj ruta javlja grešku i nudi ponovni pokušaj", async ({ page }) => {
    let calls = 0
    await installMocks(page, {
      valhalla: async (route) => {
        calls += 1
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "down" }) })
      },
    })
    await openApp(page)
    await ready(page)
    await searchAndPick(page, "Ilica 10", /Ilica 10/)
    await expect(page.getByText("Rutu trenutno nije moguće izračunati. Pokušajte ponovno.")).toBeVisible()
    const before = calls
    await page.getByRole("button", { name: "Pokušaj ponovno" }).click()
    await expect.poll(() => calls).toBeGreaterThan(before)
  })

  test("spor poslužitelj ruta ne ostaje u učitavanju", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "dovoljan je jedan viewport")
    test.setTimeout(30_000)
    await installMocks(page, { valhalla: () => new Promise(() => undefined) })
    await openApp(page)
    await ready(page)
    await searchAndPick(page, "Ilica 10", /Ilica 10/)
    await expect(page.locator(".skeleton").first()).toBeVisible()
    await expect(page.getByText("Rutu trenutno nije moguće izračunati. Pokušajte ponovno.")).toBeVisible({ timeout: 20_000 })
  })
})

test.describe("navigacija i rubovi", () => {
  test("praćenje, skretanje, završetak i podsjetnik", async ({ page, context }, info) => {
    test.skip(info.project.name !== "mobile", "dovoljan je jedan viewport")
    test.setTimeout(70_000)
    const pickup = station(1, "Polazak", 45.8142, 15.9775, 6, 0)
    const drop = station(2, "Povrat", 45.8142, 15.9815, 0, 5)
    await installMocks(page, {
      stations: [pickup, drop],
      photon: async (route) => {
        if (route.request().url().includes("/reverse")) {
          await route.fulfill({ json: { features: [photonFeature("Jarunska", "2", 45.816, 15.9815)] } })
          return
        }
        await route.fulfill({ json: { features: [photonFeature("Jarunska", "2", 45.816, 15.9815)] } })
      },
      parking: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [15.9815, 45.8157] },
            properties: { OBJECTID: 1, naziv: "Stalak na odredištu" },
          },
        ],
      },
    })
    await openApp(page)
    await ready(page)
    await searchAndPick(page, "Jarunska 2", /Jarunska 2/)
    await page.getByRole("radio", { name: /Svoj bicikl/ }).click()
    await page.getByRole("button", { name: "Kreni" }).click()
    await expect(page.getByRole("button", { name: "Završi" })).toBeVisible()
    await context.setGeolocation({ latitude: 45.816, longitude: 15.9815, accuracy: 8 })
    await expect(page.getByText("Zaključaj okvir, ne samo kotač.")).toBeVisible()
    const box = page.viewportSize()
    await page.mouse.move((box?.width ?? 390) - 40, 220)
    await page.mouse.down()
    await page.mouse.move((box?.width ?? 390) - 40, 280)
    await page.mouse.up()
    await expect(page.getByRole("button", { name: "Prati me" })).toBeVisible()
    await page.getByRole("button", { name: "Prati me" }).click()
    await expect(page.getByRole("button", { name: "Prati me" })).toHaveCount(0)
    await page.getByRole("button", { name: "Završi" }).click()
    await expect(page.getByRole("button", { name: "Završi" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Kreni" })).toBeVisible()
    const counts = await page.evaluate(() =>
      (window as unknown as { __navCounts?: () => { released: number; watches: number; clears: number } }).__navCounts?.(),
    )
    expect(counts?.watches ?? 0).toBeGreaterThan(0)
    expect(counts?.clears).toBe(counts?.watches)
    expect(counts?.released ?? 0).toBeGreaterThan(0)
  })

  test("skretanje s rute ponovo računa, a Bajs koji je uzet ostaje uzet", async ({ page, context }, info) => {
    test.skip(info.project.name !== "mobile", "dovoljan je jedan viewport")
    test.setTimeout(55_000)
    await installMocks(page, {
      stations: [station(1, "Polazak", 45.8142, 15.9775, 6, 0), station(2, "Povrat", 45.8142, 15.9815, 0, 6)],
      photon: async (route) => {
        await route.fulfill({ json: { features: [photonFeature("Jarunska", "2", 45.816, 15.9815)] } })
      },
    })
    let documentLoads = 0
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) documentLoads += 1
    })
    await openApp(page)
    await ready(page)
    await searchAndPick(page, "Jarunska 2", /Jarunska 2/)
    let routePosts = 0
    const bicycleFrom: number[] = []
    page.on("request", (request) => {
      if (request.method() !== "POST" || !request.url().includes("valhalla")) return
      routePosts += 1
      if (!request.url().includes("/route")) return
      const body = request.postDataJSON() as { costing?: string; locations?: Array<{ lat: number }> }
      if (body.costing === "bicycle" && body.locations?.[0]) bicycleFrom.push(body.locations[0].lat)
    })
    await page.getByRole("radio", { name: /^Bajs/ }).click()
    await page.getByRole("button", { name: "Kreni" }).click()
    await expect(page.getByRole("button", { name: "Završi" })).toBeVisible()
    await page.waitForTimeout(5_500)
    await context.setGeolocation({ latitude: 45.8142, longitude: 15.9795, accuracy: 8 })
    await expect(page.getByText("Vožnja")).toBeVisible()
    const beforeLeave = routePosts
    for (const latitude of [45.81348, 45.81346, 45.81344]) {
      await context.setGeolocation({ latitude, longitude: 15.9795, accuracy: 8 })
      await page.waitForTimeout(400)
    }
    await expect(page.getByText(/Skrenuli ste s rute|Ruta je ponovno izračunata/)).toBeVisible()
    await expect.poll(() => routePosts).toBeGreaterThan(beforeLeave)
    expect(bicycleFrom.some((lat) => lat < 45.8138)).toBe(true)
    const afterFirst = routePosts
    const until = Date.now() + 21_000
    while (Date.now() < until) {
      await context.setGeolocation({ latitude: 45.81344, longitude: 15.9795, accuracy: 8 })
      await page.waitForTimeout(4_000)
    }
    for (const latitude of [45.808, 45.8078, 45.8076]) {
      await context.setGeolocation({ latitude, longitude: 15.99, accuracy: 8 })
      await page.waitForTimeout(400)
    }
    await expect.poll(() => routePosts).toBeGreaterThan(afterFirst)
    await expect(page.getByText(/Ruta je ponovno izračunata/).last()).toBeVisible()
    expect(documentLoads).toBe(1)
  })

  test("osvježavanje stranice usred rute vraća početno stanje", async ({ page }) => {
    await installMocks(page)
    await openApp(page)
    await ready(page)
    await searchAndPick(page, "Ilica 10", /Ilica 10/)
    await page.reload()
    await expect(page.getByPlaceholder("Kamo idete?")).toBeVisible()
    await expect(page.getByRole("button", { name: "Kreni" })).toHaveCount(0)
  })

  test("bez interneta ostaje poruka, a spora mreža pokazuje učitavanje", async ({ page, context }) => {
    await installMocks(page, {
      photon: async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 400))
        await route.fulfill({ json: { features: [photonFeature("Ilica", "10", 45.81339, 15.97423)] } }).catch(() => undefined)
      },
    })
    await openApp(page)
    await ready(page)
    const field = page.getByRole("combobox", { name: "Odredište" })
    await field.click()
    await field.fill("Ilica 10")
    await expect(page.getByText("Tražim…")).toBeVisible()
    await context.setOffline(true)
    await expect(page.getByText(/Nema internetske veze/)).toBeVisible()
    await page.keyboard.press("Escape")
    await page.mouse.move(80, 220)
    await page.mouse.down()
    await page.waitForTimeout(700)
    await page.mouse.up()
    await expect(page.getByText(/Stanice uživo i novi račun trebaju mrežu/)).toBeVisible()
  })

  test("dvostruki klik ne šalje drugi val ruta", async ({ page }) => {
    let calls = 0
    await installMocks(page, {
      valhalla: async (route) => {
        calls += 1
        await fulfillValhalla(route, { pedestrian: 100, bicycle: 200 })
      },
    })
    await openApp(page)
    await ready(page)
    await searchAndPick(page, "Ilica 10", /Ilica 10/)
    await expect(page.getByRole("button", { name: "Kreni" })).toBeEnabled()
    const afterPlan = calls
    await page.getByRole("button", { name: "Kreni" }).dblclick()
    await page.waitForTimeout(300)
    expect(calls).toBe(afterPlan)
  })

  test("manifest i instalacija", async ({ page }) => {
    await installMocks(page)
    await openApp(page)
    const href = await page.locator("link[rel='manifest']").getAttribute("href")
    expect(href).toBeTruthy()
    const manifest = await page.evaluate(async (url) => {
      const response = await fetch(url)
      return response.json()
    }, href)
    expect(manifest.display).toBe("standalone")
    expect(manifest.short_name).toBe("NavBajs")
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true })
      Object.assign(event, {
        prompt: () => {
          ;(window as unknown as { __prompted?: boolean }).__prompted = true
          return Promise.resolve()
        },
        userChoice: Promise.resolve({ outcome: "accepted" }),
      })
      window.dispatchEvent(event)
    })
    await page.getByRole("button", { name: "Filtar" }).click()
    await page.getByRole("button", { name: "Instaliraj aplikaciju" }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true)
  })
})

test.describe("izgled", () => {
  test("dodir, kontrast i širina", async ({ page }) => {
    await installMocks(page)
    await openApp(page)
    await ready(page)
    const small = await page.locator("#nav-sheet button, .map-fab, .place-chip, .search-go").evaluateAll((elements) =>
      elements
        .map((element) => {
          const box = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return {
            name: (element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 40),
            width: box.width,
            height: box.height,
            hidden: style.display === "none" || style.visibility === "hidden" || box.width === 0,
          }
        })
        .filter((item) => !item.hidden && (item.width < 44 || item.height < 44)),
    )
    expect(small).toEqual([])
    const contrast = await page.evaluate(() => {
      const sample = (selector: string) => {
        const node = document.querySelector(selector)
        if (!node) return 0
        const style = getComputedStyle(node)
        const parse = (value: string) => {
          const canvas = document.createElement("canvas")
          canvas.width = 1
          canvas.height = 1
          const context = canvas.getContext("2d")
          if (!context) return [0, 0, 0]
          context.fillStyle = "#000000"
          context.fillStyle = value
          context.fillRect(0, 0, 1, 1)
          const pixel = context.getImageData(0, 0, 1, 1).data
          return [pixel[0], pixel[1], pixel[2]]
        }
        const linear = (channel: number) => {
          const c = channel / 255
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        }
        const lum = (rgb: number[]) => 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2])
        const fg = lum(parse(style.color))
        const bg = lum(parse(style.backgroundColor === "rgba(0, 0, 0, 0)" ? getComputedStyle(document.body).backgroundColor : style.backgroundColor))
        const lighter = Math.max(fg, bg)
        const darker = Math.min(fg, bg)
        return (lighter + 0.05) / (darker + 0.05)
      }
      return { text: sample("body"), button: sample(".search-go") }
    })
    expect(contrast.text).toBeGreaterThanOrEqual(4.5)
    expect(contrast.button).toBeGreaterThanOrEqual(4.5)
    await page.getByRole("button", { name: "Uključi tamnu temu" }).click()
    const dark = await page.evaluate(() => {
      const style = getComputedStyle(document.body)
      const parse = (value: string) => {
        const canvas = document.createElement("canvas")
        canvas.width = 1
        canvas.height = 1
        const context = canvas.getContext("2d")
        if (!context) return [0, 0, 0]
        context.fillStyle = "#000000"
        context.fillStyle = value
        context.fillRect(0, 0, 1, 1)
        const pixel = context.getImageData(0, 0, 1, 1).data
        return [pixel[0], pixel[1], pixel[2]]
      }
      const linear = (channel: number) => {
        const c = channel / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      const lum = (rgb: number[]) => 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2])
      const fg = lum(parse(style.color))
      const bg = lum(parse(style.backgroundColor))
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
    })
    expect(dark).toBeGreaterThanOrEqual(4.5)
    for (const width of [360, 390, 768]) {
      await page.setViewportSize({ width, height: 800 })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)
    }
  })

  test("tipkovnica ne prekriva prijedloge", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "tipkovnica je mobilni slučaj")
    await page.addInitScript(() => {
      const viewport = {
        height: 430,
        width: 390,
        offsetTop: 0,
        offsetLeft: 0,
        scale: 1,
        pageTop: 0,
        pageLeft: 0,
        addEventListener() {},
        removeEventListener() {},
      }
      Object.defineProperty(window, "visualViewport", { configurable: true, get: () => viewport })
    })
    await installMocks(page)
    await openApp(page)
    await page.getByRole("combobox", { name: "Odredište" }).click()
    await page.getByRole("combobox", { name: "Odredište" }).fill("Ilica 10")
    await expect(page.getByRole("button", { name: "Odaberi na karti" })).toBeVisible()
    const covered = await page.evaluate(() => {
      const sheet = document.querySelector("#nav-sheet")?.getBoundingClientRect()
      const keyboardTop = window.visualViewport?.height ?? window.innerHeight
      return sheet ? sheet.bottom - keyboardTop : 999
    })
    expect(covered).toBeLessThanOrEqual(1)
  })
})

test("stanica bez bicikla tijekom navigacije slaže novu rutu", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "dovoljan je jedan viewport")
  test.setTimeout(70_000)
  const pickup = station(1, "Polazak", 45.8142, 15.9775, 6, 4)
  const reserve = station(2, "Rezerva", 45.819, 15.99, 4, 4)
  await installMocks(page, {
    stations: [pickup, reserve],
    photon: async (route) => {
      await route.fulfill({ json: { features: [photonFeature("Jarunska", "2", 45.82, 15.99)] } })
    },
  })
  await openApp(page)
  await ready(page)
  await searchAndPick(page, "Jarunska 2", /Jarunska 2/)
  await page.getByRole("radio", { name: /^Bajs/ }).click()
  await page.getByRole("button", { name: "Kreni" }).click()
  await expect(page.getByRole("button", { name: "Završi" })).toBeVisible()
  pickup.bikes = 0
  await expect(page.getByText(/više nema slobodan bicikl/)).toBeVisible({ timeout: 50_000 })
})

test("stanice se osvježavaju jednim intervalom", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "dovoljan je jedan viewport")
  test.setTimeout(55_000)
  const counts = { count: 0 }
  await installMocks(page, { bajsCounts: counts })
  await openApp(page)
  await ready(page)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __stationTimers?: number }).__stationTimers)).toBe(1)
  const baseline = counts.count
  await page.waitForTimeout(41_000)
  expect(counts.count - baseline).toBe(1)
})
