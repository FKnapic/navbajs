import type { Feature, FeatureCollection, Point } from "geojson"
import { normalizeCoord } from "../lib/crs"
import { haversineM } from "../lib/geo"
import type { OsmParkingRecord, Parking, ParkingFact } from "../types/parking"

interface CityProps {
  OBJECTID?: number
  vrsta?: string | null
  naziv?: string | null
  lokacija?: string | null
  broj_stalaka?: number | null
  broj_bicikala?: number | null
  godina_postavljanja?: number | null
  MJESNI_ODBOR?: string | null
  GRADSKA_CETVRT?: string | null
}

const KIND_LABELS: Record<string, string> = {
  stalci: "Stalci",
  stands: "Stalci",
  wall_loops: "Zidne petlje",
  shed: "Nadstrešnica",
  lockers: "Ormarići",
  rack: "Stalak",
  anchors: "Sidrišta",
  building: "Zgrada",
  "two-tier": "Dvoetažni stalci",
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function clean(value: string | null | undefined): string | null {
  if (!value) return null
  const text = value.replace(/^"+|"+$/g, "").trim()
  return text || null
}

export function kindLabel(kind: string | null): string | null {
  if (!kind) return null
  return KIND_LABELS[kind] ?? kind
}

export function parkingFacts(parking: Parking): ParkingFact[] {
  const rows: ParkingFact[] = []
  const kind = kindLabel(parking.kind)
  if (kind) rows.push({ label: "Vrsta", value: kind })
  if (parking.racks != null) rows.push({ label: "Broj stalaka", value: String(parking.racks) })
  if (parking.capacity != null) rows.push({ label: "Kapacitet", value: `${parking.capacity} bicikala` })
  if (parking.covered === true) rows.push({ label: "Nadstrešnica", value: "da" })
  if (parking.covered === false) rows.push({ label: "Nadstrešnica", value: "ne" })
  if (parking.year) rows.push({ label: "Godina postavljanja", value: String(parking.year) })
  if (parking.district) rows.push({ label: "Gradska četvrt", value: parking.district })
  if (parking.neighborhood) rows.push({ label: "Mjesni odbor", value: parking.neighborhood })
  if (parking.location && parking.location !== parking.name) {
    rows.push({ label: "Lokacija", value: parking.location })
  }
  rows.push({
    label: "Izvor",
    value:
      parking.source === "osm"
        ? "OpenStreetMap"
        : parking.source === "merged"
          ? "Grad Zagreb + OpenStreetMap"
          : "Grad Zagreb (data.gov.hr)",
  })
  return rows
}

export function parseCityParking(collection: FeatureCollection): Parking[] {
  const parkings: Parking[] = []
  for (const feature of collection.features) {
    const point = feature as Feature<Point, CityProps>
    if (point.geometry?.type !== "Point") continue
    const [x, y] = point.geometry.coordinates
    const coord = normalizeCoord(x, y)
    if (!coord) continue
    const props = point.properties ?? {}
    const location = clean(props.lokacija)
    const name = clean(props.naziv) || location || "Parkiralište za bicikle"
    parkings.push({
      id: `zg-${props.OBJECTID ?? parkings.length}`,
      name,
      location,
      kind: clean(props.vrsta),
      racks: num(props.broj_stalaka),
      capacity: num(props.broj_bicikala),
      year: num(props.godina_postavljanja),
      district: clean(props.GRADSKA_CETVRT),
      neighborhood: clean(props.MJESNI_ODBOR),
      covered: null,
      lat: coord.lat,
      lng: coord.lng,
      source: "zagreb",
    })
  }
  return parkings
}

export function parseOsmParking(records: OsmParkingRecord[]): Parking[] {
  return records
    .filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lng))
    .map((record) => ({
      id: record.id,
      name: record.name?.trim() || "Parkiralište za bicikle",
      location: null,
      kind: record.kind ?? null,
      racks: null,
      capacity: record.capacity ?? null,
      year: null,
      district: null,
      neighborhood: null,
      covered: record.covered ?? null,
      lat: record.lat,
      lng: record.lng,
      source: "osm" as const,
    }))
}

/** Točke bliže od 15 m smatraju se istim parkiralištem. */
export function mergeParking(city: Parking[], osm: Parking[]): Parking[] {
  const cell = 0.0002
  const buckets = new Map<string, Parking[]>()
  const all: Parking[] = city.map((parking) => ({ ...parking }))
  const keyOf = (lat: number, lng: number) => `${Math.floor(lat / cell)}:${Math.floor(lng / cell)}`
  const add = (parking: Parking) => {
    const key = keyOf(parking.lat, parking.lng)
    const list = buckets.get(key) ?? []
    list.push(parking)
    buckets.set(key, list)
  }
  for (const parking of all) add(parking)

  for (const extra of osm) {
    const latIndex = Math.floor(extra.lat / cell)
    const lngIndex = Math.floor(extra.lng / cell)
    let near: Parking | null = null
    for (let dy = -1; dy <= 1 && !near; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const list = buckets.get(`${latIndex + dy}:${lngIndex + dx}`) ?? []
        near = list.find((parking) => haversineM(parking, extra) <= 15) ?? null
        if (near) break
      }
    }
    if (near) {
      if (near.covered == null && extra.covered != null) near.covered = extra.covered
      if ((near.capacity == null || near.capacity === 0) && extra.capacity) near.capacity = extra.capacity
      if (!near.kind && extra.kind) near.kind = extra.kind
      if (near.source === "zagreb") near.source = "merged"
    } else {
      const created = { ...extra }
      all.push(created)
      add(created)
    }
  }
  return all
}

export async function loadParking(): Promise<{ parkings: Parking[]; warning: string | null }> {
  let city: Parking[] = []
  let warning: string | null = null
  try {
    const response = await fetch("/data/parking.geojson")
    if (!response.ok) throw new Error(String(response.status))
    city = parseCityParking((await response.json()) as FeatureCollection)
    if (!city.length) warning = "Skup javnih parkirališta je prazan."
  } catch {
    warning = "Javna parkirališta Grada Zagreba nisu učitana. Rute do parkirališta nisu dostupne dok se podaci ne učitaju."
  }

  let osm: Parking[] = []
  try {
    const response = await fetch("/data/osm-parking.json")
    if (response.ok) osm = parseOsmParking((await response.json()) as OsmParkingRecord[])
  } catch {
    /* dopuna nije obavezna */
  }

  const parkings = mergeParking(city, osm)
  if (!city.length && osm.length) {
    warning = "Gradski skup parkirališta nije učitan. Prikazana su samo parkirališta iz OpenStreetMapa."
  }
  return { parkings, warning }
}
