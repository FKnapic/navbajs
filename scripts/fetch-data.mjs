/**
 * Preuzima otvorene podatke Grada Zagreba i dopunu s OpenStreetMapa.
 * Licenca gradskih skupova: Otvorena dozvola (data.gov.hr).
 * OSM: ODbL.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(root, "public", "data")

const PARKING_URL =
  "https://opendata.arcgis.com/api/v3/datasets/04012b0e4968447c978a6ee494d76495_2/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1"

const LANES_QUERY =
  "https://services8.arcgis.com/Usi0jGQwMmBUpFjr/arcgis/rest/services/biciklisticka_infrastruktura_podaci_view/FeatureServer/4/query"

const UA = "BikeBr/1.0 (Zagreb bicycle navigation; educational open-data client)"

async function getJson(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", "user-agent": UA, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(120000),
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`)
  }
  return response.json()
}

function roundCoords(value) {
  if (typeof value?.[0] === "number") {
    return [Math.round(value[0] * 1e5) / 1e5, Math.round(value[1] * 1e5) / 1e5]
  }
  return Array.isArray(value) ? value.map(roundCoords) : value
}

async function fetchParking() {
  const geo = await getJson(PARKING_URL)
  if (geo.type !== "FeatureCollection" || !Array.isArray(geo.features)) {
    throw new Error("Parkirališta nisu GeoJSON FeatureCollection.")
  }
  geo.features = geo.features.map((feature) => ({
    ...feature,
    geometry: feature.geometry
      ? { ...feature.geometry, coordinates: roundCoords(feature.geometry.coordinates) }
      : null,
  }))
  return geo
}

async function fetchLanes() {
  const features = []
  let offset = 0
  for (;;) {
    const url = new URL(LANES_QUERY)
    url.searchParams.set("where", "1=1")
    url.searchParams.set("outFields", "*")
    url.searchParams.set("outSR", "4326")
    url.searchParams.set("f", "geojson")
    url.searchParams.set("resultRecordCount", "2000")
    url.searchParams.set("resultOffset", String(offset))
    const page = await getJson(url)
    if (page.error) throw new Error(JSON.stringify(page.error))
    const chunk = page.features ?? []
    for (const feature of chunk) {
      if (feature.geometry?.coordinates) {
        feature.geometry = {
          ...feature.geometry,
          coordinates: roundCoords(feature.geometry.coordinates),
        }
      }
      features.push(feature)
    }
    const exceeded = page.properties?.exceededTransferLimit === true
    if (!exceeded || chunk.length === 0) break
    offset += chunk.length
    if (offset > 20000) break
  }
  return {
    type: "FeatureCollection",
    name: "biciklisticke_staze",
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
    features,
  }
}

async function fetchOsm() {
  const query = `[out:json][timeout:80];
(
  node["amenity"="bicycle_parking"](45.70,15.75,45.92,16.30);
  way["amenity"="bicycle_parking"](45.70,15.75,45.92,16.30);
);
out center tags;`
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ]
  for (const endpoint of endpoints) {
    try {
      const payload = await getJson(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: query }),
      })
      const records = []
      for (const element of payload.elements ?? []) {
        const lat = element.lat ?? element.center?.lat
        const lng = element.lon ?? element.center?.lon
        if (typeof lat !== "number" || typeof lng !== "number") continue
        const tags = element.tags ?? {}
        const capacity = Number(tags.capacity)
        let covered = null
        if (tags.covered === "yes" || tags.bicycle_parking === "shed") covered = true
        else if (tags.covered === "no") covered = false
        records.push({
          id: `osm-${element.type}-${element.id}`,
          lat: Math.round(lat * 1e6) / 1e6,
          lng: Math.round(lng * 1e6) / 1e6,
          name: tags.name ?? null,
          kind: tags.bicycle_parking ?? null,
          capacity: Number.isFinite(capacity) ? capacity : null,
          covered,
        })
      }
      return records
    } catch (error) {
      console.warn("OSM preskočen na", endpoint, error instanceof Error ? error.message : error)
    }
  }
  return null
}

await mkdir(outDir, { recursive: true })
const meta = {
  fetchedAt: new Date().toISOString(),
  license:
    "Gradski skupovi: Otvorena dozvola, data.gov.hr. OpenStreetMap: ODbL © OpenStreetMap contributors.",
  parking: null,
  lanes: null,
  osm: null,
}

try {
  const parking = await fetchParking()
  await writeFile(join(outDir, "parking.geojson"), JSON.stringify(parking))
  meta.parking = {
    dataset: "geoportal-javna-parkiralista-za-bicikle",
    organization: "Grad Zagreb",
    url: "https://data.gov.hr/ckan/dataset/geoportal-javna-parkiralista-za-bicikle",
    count: parking.features.length,
    crs: parking.crs?.properties?.name ?? "CRS84",
    fields: [
      "OBJECTID",
      "vrsta",
      "naziv",
      "lokacija",
      "broj_stalaka",
      "broj_bicikala",
      "godina_postavljanja",
      "MJESNI_ODBOR",
      "GRADSKA_CETVRT",
    ],
  }
  console.log("Parkirališta:", parking.features.length)
} catch (error) {
  meta.parking = { error: error instanceof Error ? error.message : String(error) }
  console.error("Parkirališta nisu preuzeta:", meta.parking.error)
}

try {
  const lanes = await fetchLanes()
  await writeFile(join(outDir, "lanes.geojson"), JSON.stringify(lanes))
  meta.lanes = {
    dataset: "geoportal-biciklisticke-staze",
    organization: "Grad Zagreb",
    url: "https://data.gov.hr/ckan/dataset/geoportal-biciklisticke-staze",
    note: "CKAN GeoJSON download trenutačno vraća grešku, pa se skup čita iz ArcGIS FeatureServera navedenog u tom zapisu (outSR=4326).",
    count: lanes.features.length,
    crs: "urn:ogc:def:crs:OGC:1.3:CRS84",
    fields: ["OBJECTID", "kategorija_id", "lokacija", "zavrsni_sloj", "duljina", "MJESNI_ODBOR", "GRADSKA_CETVRT"],
  }
  console.log("Staze:", lanes.features.length)
} catch (error) {
  meta.lanes = { error: error instanceof Error ? error.message : String(error) }
  console.error("Staze nisu preuzete:", meta.lanes.error)
}

const osm = await fetchOsm()
if (osm) {
  await writeFile(join(outDir, "osm-parking.json"), JSON.stringify(osm))
  meta.osm = {
    query: "amenity=bicycle_parking",
    bbox: [15.75, 45.7, 16.3, 45.92],
    count: osm.length,
    license: "ODbL",
  }
  console.log("OSM parkirališta:", osm.length)
} else {
  meta.osm = { error: "Overpass nije vratio podatke. Aplikacija radi samo s gradskim skupom." }
  console.warn(meta.osm.error)
}

await writeFile(join(outDir, "meta.json"), JSON.stringify(meta, null, 2))
console.log("Spremam u", outDir)
