import { haversineM } from "../lib/geo"
import {
  fold,
  housesEqual,
  inSearchArea,
  rankHits,
  searchBBox,
  streetMatches,
  type ParsedQuery,
  type PhotonHit,
} from "../lib/addressQuery"
import type { GeocodeResult, LatLng } from "../types/places"

const DEFAULT_URL =
  "https://arcportal.zagreb.hr/server/rest/services/DKPiRPJ/KBR_kućni_broj/MapServer/1/query"

/** Kućni broj koji je samo za par mjesta dalje od traženog. */
const NEAR_NUMBER = 2
/** Točan pogodak bliži od ovoga ne traži istoimenu ulicu bliže središtu. */
const NEAR_EXACT_M = 4000
/** Daleki istoimeni broj gubi od bliže ulice ako je razlika veća od ovoga. */
const HOMONYM_GAP_M = 2000

const SKIPPED_TOKEN = new Set(["ulica", "ulice", "grada"])
/** Kućni brojevi jedne ulice, da sljedeći broj ne ide ponovo na mrežu. */
const streetHouses = new Map<string, PhotonHit[]>()

export class OfficialAddressError extends Error {
  constructor() {
    super("Službene adrese nisu dostupne")
    this.name = "OfficialAddressError"
  }
}

interface OfficialFeature {
  attributes?: { UL_IME?: string; KB?: string; NA_IME?: string; GC_IME?: string }
  geometry?: { x?: number; y?: number }
}

function serviceUrl(): string {
  const runtime = globalThis as { process?: { env?: { ZAGREB_ADDRESS_URL?: string } } }
  const fromServer = runtime.process?.env?.ZAGREB_ADDRESS_URL?.trim()
  if (fromServer) return fromServer
  const configured = import.meta.env?.VITE_ZAGREB_ADDRESS_URL?.trim()
  if (configured) return configured
  return DEFAULT_URL
}

function sqlToken(token: string): string | null {
  if (!/^[\p{L}\p{N}]+$/u.test(token)) return null
  return token.replace(/'/g, "''")
}

const DIACRITIC: Record<string, string[]> = {
  c: ["c", "č", "ć"],
  s: ["s", "š"],
  z: ["z", "ž"],
  d: ["d", "đ"],
  C: ["C", "Č", "Ć"],
  S: ["S", "Š"],
  Z: ["Z", "Ž"],
  D: ["D", "Đ"],
}

/** "Subiceva" i "Šubićeva" moraju pogoditi isti zapis u službenom sloju. */
function diacriticForms(token: string): string[] {
  let forms = [""]
  for (const char of token) {
    const options = DIACRITIC[char] ?? [char]
    const next: string[] = []
    for (const form of forms) {
      for (const option of options) {
        next.push(form + option)
        if (next.length >= 24) return next
      }
    }
    forms = next
  }
  return forms
}

function spellings(token: string): string[] {
  const folded = fold(token)
  const alts = new Set<string>([token])
  for (const ending of ["ska", "ova", "eva"]) {
    if (folded.endsWith(ending) && folded.length - ending.length >= 6) {
      alts.add(token.slice(0, token.length - ending.length))
    }
  }
  if (folded.endsWith("gne") && token.length > 4) alts.add(`${token.slice(0, -3)}nje`)
  if (folded.endsWith("nje") && token.length > 4) alts.add(`${token.slice(0, -3)}gne`)
  return [...alts]
}

function streetClause(street: string): string | null {
  const groups: string[] = []
  for (const token of street.split(/\s+/)) {
    if (SKIPPED_TOKEN.has(fold(token)) || fold(token).length < 4) continue
    const likes = [...new Set(spellings(token).flatMap((item) => diacriticForms(item)))]
      .map(sqlToken)
      .filter((item): item is string => item != null)
      .slice(0, 12)
      .map((item) => `UL_IME LIKE '%${item}%'`)
    if (!likes.length) return null
    groups.push(likes.length === 1 ? likes[0] : `(${likes.join(" OR ")})`)
  }
  return groups.length ? groups.join(" AND ") : null
}

function houseClause(house: string): string | null {
  const compact = house.toLowerCase().replace(/\s+/g, "")
  const letter = compact.match(/^(\d+)[/-]?([a-z])$/)
  const plain = compact.match(/^(\d+)$/)
  const number = letter?.[1] ?? plain?.[1]
  if (!number || !/^\d+$/.test(number)) return null
  if (!letter) return `(KB = '${number}' OR KB LIKE '${number}/%')`
  const suffix = letter[2]
  const forms = [...new Set([suffix, suffix.toUpperCase()])]
  const parts = forms.flatMap((form) => [
    `KB = '${number}${form}'`,
    `KB = '${number}/${form}'`,
    `KB LIKE '${number}${form}/%'`,
    `KB LIKE '${number}/${form}/%'`,
  ])
  return `(${parts.join(" OR ")})`
}

export function houseWhere(parsed: ParsedQuery, exact: boolean): string | null {
  const street = streetClause(parsed.street)
  if (!street) return null
  if (!exact) return street
  const house = parsed.house ? houseClause(parsed.house) : null
  if (!house) return null
  return `${street} AND ${house}`
}

function houseNumeric(value: string): number {
  const match = value.match(/\d+/)
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY
}

function closest(hits: PhotonHit[], bias: LatLng): PhotonHit | null {
  return hits.reduce<PhotonHit | null>(
    (best, hit) => (!best || haversineM(bias, hit) < haversineM(bias, best) ? hit : best),
    null,
  )
}

export function pickOfficialHits(
  exactHits: PhotonHit[],
  streetHits: PhotonHit[],
  parsed: ParsedQuery,
  bias: LatLng,
): PhotonHit[] {
  if (!parsed.house) return []
  const bbox = searchBBox(parsed)
  const inside = (hit: PhotonHit) => inSearchArea(hit, bbox)
  const wanted = houseNumeric(parsed.house)
  const onStreet = (hit: PhotonHit) => inside(hit) && streetMatches(parsed.street, hit)
  const exact = exactHits.filter(
    (hit) => onStreet(hit) && hit.housenumber && housesEqual(parsed.house ?? "", hit.housenumber),
  )
  const nearestExact = closest(exact, bias)
  if (nearestExact && haversineM(nearestExact, bias) <= NEAR_EXACT_M) return exact
  const pool = streetHits.length ? streetHits : exactHits
  const onStreetHits = pool
    .filter((hit) => onStreet(hit) && hit.housenumber)
    .sort((a, b) => {
      const delta = Math.abs(houseNumeric(a.housenumber) - wanted) - Math.abs(houseNumeric(b.housenumber) - wanted)
      if (delta !== 0) return delta
      return haversineM(bias, a) - haversineM(bias, b)
    })
  const nearNumbers = onStreetHits.filter((hit) => Math.abs(houseNumeric(hit.housenumber) - wanted) <= NEAR_NUMBER)
  const nearestClose = closest(nearNumbers, bias)
  if (
    nearestExact &&
    nearestClose &&
    !housesEqual(parsed.house ?? "", nearestClose.housenumber) &&
    haversineM(nearestExact, bias) - haversineM(nearestClose, bias) > HOMONYM_GAP_M
  ) {
    return [nearestClose]
  }
  if (nearestExact) return exact
  const bestNear = nearNumbers[0]
  if (bestNear) return housesEqual(parsed.house ?? "", bestNear.housenumber) ? exact : [bestNear]
  return onStreetHits[0] ? [onStreetHits[0]] : []
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
  const any = (AbortSignal as { any?: (list: AbortSignal[]) => AbortSignal }).any
  if (any) return any.call(AbortSignal, signals)
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort()
      return controller.signal
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true })
  }
  return controller.signal
}

function asHit(feature: OfficialFeature): PhotonHit | null {
  const street = feature.attributes?.UL_IME?.trim() ?? ""
  const housenumber = feature.attributes?.KB?.trim() ?? ""
  const lng = feature.geometry?.x
  const lat = feature.geometry?.y
  if (!street || !housenumber || typeof lat !== "number" || typeof lng !== "number") return null
  const settlement = feature.attributes?.NA_IME?.trim() ?? ""
  return {
    lat,
    lng,
    name: "",
    street,
    housenumber,
    locality: settlement && settlement !== "Zagreb" ? settlement : "",
    district: feature.attributes?.GC_IME?.trim() ?? "",
    city: "Zagreb",
    kind: "house",
    addressPoint: true,
  }
}

async function fetchHouses(where: string, signal: AbortSignal): Promise<PhotonHit[]> {
  const url = new URL(serviceUrl())
  url.searchParams.set("where", where)
  url.searchParams.set("outFields", "UL_IME,KB,NA_IME,GC_IME")
  url.searchParams.set("returnGeometry", "true")
  url.searchParams.set("outSR", "4326")
  url.searchParams.set("f", "pjson")
  const timeout = AbortSignal.timeout(8000)
  let response: Response
  try {
    response = await fetch(url, { signal: combineSignals([signal, timeout]) })
  } catch (error) {
    if (signal.aborted) throw error
    throw new OfficialAddressError()
  }
  if (response.status === 429 || response.status >= 500) throw new OfficialAddressError()
  if (!response.ok) throw new OfficialAddressError()
  const payload = (await response.json()) as { features?: OfficialFeature[]; error?: { code?: number } }
  if (payload.error) return []
  const hits: PhotonHit[] = []
  for (const feature of payload.features ?? []) {
    const hit = asHit(feature)
    if (hit) hits.push(hit)
  }
  return hits
}

export async function searchOfficialHouses(
  parsed: ParsedQuery,
  bias: LatLng,
  signal: AbortSignal,
): Promise<GeocodeResult[]> {
  if (!parsed.house) return []
  const streetKey = fold(parsed.street)
  const cached = streetHouses.get(streetKey)
  if (cached) return rankHits(pickOfficialHits(cached, cached, parsed, bias), parsed, bias)
  const exactWhere = houseWhere(parsed, true)
  if (!exactWhere) return []
  const exactHits = await fetchHouses(exactWhere, signal)
  const early = pickOfficialHits(exactHits, [], parsed, bias)
  const earlyRanked = rankHits(early, parsed, bias)
  const earlyExact = earlyRanked.find((item) => !item.approximate)
  const streetWhere = houseWhere(parsed, false)
  if (earlyExact && haversineM(earlyExact, bias) <= NEAR_EXACT_M) {
    if (streetWhere && !streetHouses.has(streetKey)) {
      void fetchHouses(streetWhere, AbortSignal.timeout(8000))
        .then((hits) => {
          if (hits.length) streetHouses.set(streetKey, hits)
        })
        .catch(() => undefined)
    }
    return earlyRanked
  }
  if (!streetWhere) return earlyRanked
  const streetHits = await fetchHouses(streetWhere, signal)
  if (streetHits.length) streetHouses.set(streetKey, streetHits)
  const picked = pickOfficialHits(exactHits, streetHits, parsed, bias)
  return rankHits(picked, parsed, bias)
}
