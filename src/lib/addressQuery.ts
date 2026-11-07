import { haversineM } from "./geo"
import type { GeocodeResult, LatLng } from "../types/places"

export interface SearchBBox {
  south: number
  west: number
  north: number
  east: number
}

/** Grad Zagreb, uključujući Sesvete, Podsused, Dubravu i Novi Zagreb. */
export const CITY_BBOX: SearchBBox = {
  south: 45.74,
  west: 15.78,
  north: 45.9,
  east: 16.22,
}

/** Šira okolica, samo kad je upit to traži (Velika Gorica, Zaprešić, Samobor). */
export const WIDER_BBOX: SearchBBox = {
  south: 45.68,
  west: 15.78,
  north: 45.95,
  east: 16.25,
}

export interface ParsedQuery {
  raw: string
  text: string
  street: string
  house: string | null
  wider: boolean
}

export interface PhotonHit {
  lat: number
  lng: number
  name: string
  street: string
  housenumber: string
  locality: string
  district: string
  city: string
  kind: "house" | "street" | "poi" | "other"
  /** Zgrada, place=house ili kućni broj bez imena lokala. */
  addressPoint: boolean
}

export function fold(value: string): string {
  return value
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function parseAddressQuery(input: string): ParsedQuery {
  let text = input.replace(/,/g, " ").replace(/\s+/g, " ").trim()
  text = text.replace(/\bul\.(?=\s|$)/gi, "")
  text = text.replace(/\bul(?=\s)/gi, "")
  text = text.replace(/\bbr\.(?=\s|$)/gi, "")
  text = text.replace(/\bbr(?=\s+\d)/gi, "")
  text = text.replace(/\btr\.(?=\s|$)/gi, "trg")
  text = text.replace(/\btr(?=\s)/gi, "trg")
  text = text.replace(/\bav\.(?=\s|$)/gi, "avenija")
  text = text.replace(/\bav(?=\s)/gi, "avenija")
  text = text.replace(/\bc\.(?=\s|$)/gi, "cesta")
  text = text.replace(/\bc(?=\s)/gi, "cesta")
  text = text.replace(/(\p{L})(\d)/gu, "$1 $2")
  const withoutCity = text
    .replace(/\bgrad\s+zagreb\b/gi, " ")
    .replace(/\bzagreb\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (/\d/.test(withoutCity) || withoutCity.split(" ").filter(Boolean).length >= 2) text = withoutCity
  text = text.replace(/\s+/g, " ").trim()
  const wider = /\b(velika\s+gorica|gorica|zapresic|samobor)\b/.test(fold(text))
  const leadingHouse = text.match(/^(\d+[a-zA-Z]?(?:\/\d+[a-zA-Z]?)?)\s+(.*\p{L}.*)$/u)
  if (leadingHouse && fold(leadingHouse[2]).length >= 2) {
    const street = leadingHouse[2].trim()
    const house = leadingHouse[1]
    return { raw: input.trim(), text: `${street} ${house}`, street, house, wider }
  }
  const houseMatch = text.match(/^(.*\p{L}.*?)\s+(\d+[a-zA-Z]?(?:\/\d+[a-zA-Z]?)?)$/u)
  if (houseMatch && fold(houseMatch[1]).length >= 2) {
    return { raw: input.trim(), text, street: houseMatch[1].trim(), house: houseMatch[2], wider }
  }
  return { raw: input.trim(), text, street: text, house: null, wider }
}

export function searchBBox(parsed: ParsedQuery): SearchBBox {
  return parsed.wider ? WIDER_BBOX : CITY_BBOX
}

export function inSearchArea(point: LatLng, bbox: SearchBBox): boolean {
  return point.lat >= bbox.south && point.lat <= bbox.north && point.lng >= bbox.west && point.lng <= bbox.east
}

function houseKey(value: string): string {
  const compact = value.toLowerCase().replace(/\s+/g, "")
  const letter = compact.match(/^(\d+)[/-]([a-z])$/)
  if (letter) return `${letter[1]}${letter[2]}`
  return compact
}

export function housesEqual(wanted: string, got: string): boolean {
  return houseKey(wanted) === houseKey(got)
}

function houseNumeric(value: string): number {
  const match = value.match(/\d+/)
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY
}

const STREET_SUFFIX = /^(?:a|u|e|o|ov|ova|evo|eva|ska|ski|sko|skoj|skog|ina|in)?$/
const GENERIC_STREET = new Set([
  "ulica",
  "ulice",
  "cesta",
  "ceste",
  "avenija",
  "avenije",
  "put",
  "aleja",
  "poljana",
  "prolaz",
  "prilaz",
  "trg",
  "grada",
  "kneza",
  "kralja",
])
const DISTINCT_TYPE = new Set(["obala", "setaliste", "nasip", "most", "stube", "brijeg", "odvojak", "gat"])

function sharedPrefix(left: string, right: string): number {
  const length = Math.min(left.length, right.length)
  let index = 0
  while (index < length && left[index] === right[index]) index += 1
  return index
}

function tokenNear(token: string, part: string): boolean {
  if (token === part) return true
  if (part.startsWith(token)) {
    const rest = part.slice(token.length)
    if (rest === "" || STREET_SUFFIX.test(rest)) return true
  }
  if (token.startsWith(part) && part.length >= 5 && STREET_SUFFIX.test(token.slice(part.length))) return true
  return stemMatch(token, part)
}

function tokensMatch(query: string, hay: string): boolean {
  const wanted = query.split(" ").filter((token) => token.length >= 4)
  const parts = hay.split(" ").filter((token) => token.length >= 4)
  if (!wanted.length) {
    if (query.length < 3) return false
    return hay.split(" ").some((part) => part.startsWith(query) || tokenNear(query, part))
  }
  return wanted.every((token) => parts.some((part) => tokenNear(token, part)))
}

export function streetMatches(queryStreet: string, hit: PhotonHit, allowName = false): boolean {
  if (conflictingType(queryStreet, hit)) return false
  const query = fold(queryStreet)
  if (!query) return false
  const street = fold(hit.street)
  const name = fold(hit.name)
  if (street && tokensMatch(query, street)) return true
  if (!street && name && tokensMatch(query, name)) return true
  if (allowName && name && (tokensMatch(query, name) || acronymHit(query, name))) return true
  return false
}

function initials(name: string): string {
  return fold(name)
    .split(/[\s-]+/)
    .filter((word) => word.length > 2)
    .map((word) => word[0])
    .join("")
}

function acronymHit(query: string, name: string): boolean {
  if (!query || query.includes(" ") || query.length < 2 || query.length > 6) return false
  return initials(name) === query
}

function stemMatch(token: string, part: string): boolean {
  const stem = sharedPrefix(token, part)
  const left = token.slice(stem)
  const right = part.slice(stem)
  if ((left === "gne" && right === "nje") || (left === "nje" && right === "gne")) return stem >= 4
  if (stem < 5) return false
  if (left === right) return true
  const adjective = new Set(["ska", "ova", "eva"])
  return (adjective.has(left) && right === "a") || (adjective.has(right) && left === "a")
}

function specificExtras(queryStreet: string, hit: PhotonHit): number {
  const queryTokens = fold(queryStreet).split(" ").filter((token) => token.length >= 4)
  return fold(hit.street)
    .split(" ")
    .filter((part) => part.length >= 4)
    .filter((part) => !GENERIC_STREET.has(part) && !queryTokens.some((token) => tokenNear(token, part))).length
}

function conflictingType(queryStreet: string, hit: PhotonHit): boolean {
  const queryTokens = new Set(fold(queryStreet).split(" "))
  return fold(hit.street)
    .split(" ")
    .some((part) => DISTINCT_TYPE.has(part) && !queryTokens.has(part))
}

function cityAllowed(hit: PhotonHit, wider: boolean): boolean {
  const city = fold(hit.city)
  if (!city) return true
  if (city.includes("zagreb")) return true
  if (!wider) return false
  return city.includes("gorica") || city.includes("zapresic") || city.includes("samobor")
}

function areaLabel(hit: PhotonHit): string {
  const raw = hit.district || hit.locality
  return raw
    .replace(/^mjesni odbor\s+/i, "")
    .replace(/^gradska četvrt\s+/i, "")
    .replace(/"/g, "")
    .trim()
}


function present(hit: PhotonHit, approximate: boolean): GeocodeResult {
  const area = areaLabel(hit)
  const title = hit.street && hit.housenumber
    ? `${hit.street} ${hit.housenumber}`
    : hit.name
      ? hit.name
      : hit.street || "Točka u Zagrebu"
  const subtitle = [approximate ? "približna lokacija" : "", area, "Zagreb"].filter(Boolean).join(", ")
  return {
    label: approximate ? `${title} · približna lokacija` : title,
    title,
    subtitle,
    lat: hit.lat,
    lng: hit.lng,
    ...(approximate ? { approximate: true } : {}),
  }
}

function dedupe(places: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>()
  const unique: GeocodeResult[] = []
  for (const place of places) {
    const key = `${fold(place.title)}@${place.lat.toFixed(4)},${place.lng.toFixed(4)}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(place)
  }
  return unique.slice(0, 8)
}

export function rankHits(hits: PhotonHit[], parsed: ParsedQuery, bias: LatLng): GeocodeResult[] {
  const bbox = searchBBox(parsed)
  const inside = hits.filter((hit) => inSearchArea(hit, bbox) && cityAllowed(hit, parsed.wider))
  if (parsed.house) {
    const exact = inside.filter(
      (hit) => hit.housenumber && housesEqual(parsed.house ?? "", hit.housenumber) && streetMatches(parsed.street, hit),
    )
    if (exact.length) {
      const centroid = clusterCentroid(exact)
      exact.sort((a, b) => {
        const point = Number(b.addressPoint) - Number(a.addressPoint)
        if (point !== 0) return point
        const along = haversineM(centroid, a) - haversineM(centroid, b)
        if (Math.abs(along) > 25) return along
        return haversineM(bias, a) - haversineM(bias, b)
      })
      return dedupe(exact.map((hit) => present(hit, false)))
    }
    const onStreet = inside.filter((hit) => streetMatches(parsed.street, hit))
    if (!onStreet.length) return []
    const wanted = houseNumeric(parsed.house)
    onStreet.sort((a, b) => {
      const delta = Math.abs(houseNumeric(a.housenumber) - wanted) - Math.abs(houseNumeric(b.housenumber) - wanted)
      if (delta !== 0) return delta
      return haversineM(bias, a) - haversineM(bias, b)
    })
    return dedupe([present(onStreet[0], true)])
  }
  const ranked = inside
    .filter((hit) => streetMatches(parsed.text, hit, true))
    .sort((a, b) => score(b, parsed, bias) - score(a, parsed, bias))
  return dedupe(ranked.map((hit) => present(hit, false)))
}

function clusterCentroid(hits: PhotonHit[]): LatLng {
  const lat = hits.reduce((sum, hit) => sum + hit.lat, 0) / hits.length
  const lng = hits.reduce((sum, hit) => sum + hit.lng, 0) / hits.length
  return { lat, lng }
}

function score(hit: PhotonHit, parsed: ParsedQuery, bias: LatLng): number {
  let value = 0
  const query = fold(parsed.text)
  const name = fold(hit.name)
  const street = fold(hit.street)
  if (parsed.house && hit.housenumber && housesEqual(parsed.house, hit.housenumber)) value += 1000
  if (streetMatches(parsed.street || parsed.text, hit)) value += 400
  if (name && (name === query || name.includes(query))) value += 350
  if (name && acronymHit(query, name)) value += 800
  if (!hit.name && parsed.house) value += 30
  if (hit.kind === "street" && !parsed.house) value += 40
  if (hit.kind === "poi" && !parsed.house) value += 20
  if (street && query && street.startsWith(query)) value += 20
  value -= specificExtras(parsed.street || parsed.text, hit) * 250
  value -= Math.min(haversineM(bias, hit), 8000) / 80
  return value
}

export function hitFromPhoton(properties: {
  name?: string
  street?: string
  housenumber?: string
  city?: string
  district?: string
  locality?: string
  type?: string
  osm_key?: string
} | undefined, coordinates: number[] | undefined): PhotonHit | null {
  if (!coordinates || coordinates.length < 2) return null
  const [lng, lat] = coordinates
  if (typeof lat !== "number" || typeof lng !== "number") return null
  const housenumber = properties?.housenumber?.trim() ?? ""
  const name = properties?.name?.trim() ?? ""
  const street = properties?.street?.trim() ?? ""
  const type = properties?.type ?? ""
  const key = properties?.osm_key ?? ""
  const kind: PhotonHit["kind"] = housenumber
    ? "house"
    : key === "highway" || type === "street"
      ? "street"
      : name
        ? "poi"
        : "other"
  return {
    lat,
    lng,
    name,
    street,
    housenumber,
    locality: properties?.locality?.trim() ?? "",
    district: properties?.district?.trim() ?? "",
    city: properties?.city?.trim() ?? "",
    kind,
    addressPoint: key === "building" || key === "place" || (housenumber !== "" && name === ""),
  }
}
