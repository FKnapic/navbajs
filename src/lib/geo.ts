import type { LatLng } from "../types/places"

/** Okvir malo širi od granica Bajs sustava, da ulovi Sesvete i rubove grada. */
export const ZAGREB_BBOX = {
  south: 45.7,
  west: 15.75,
  north: 45.92,
  east: 16.3,
}

export const ZAGREB_CENTER: LatLng = { lat: 45.813, lng: 15.9815 }

export function inZagreb(point: LatLng): boolean {
  return (
    point.lat >= ZAGREB_BBOX.south &&
    point.lat <= ZAGREB_BBOX.north &&
    point.lng >= ZAGREB_BBOX.west &&
    point.lng <= ZAGREB_BBOX.east
  )
}

export function haversineM(a: LatLng, b: LatLng): number {
  const radius = 6_371_000
  const p1 = (a.lat * Math.PI) / 180
  const p2 = (b.lat * Math.PI) / 180
  const dp = ((b.lat - a.lat) * Math.PI) / 180
  const dl = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function nearest<T>(
  origin: LatLng,
  items: T[],
  count: number,
  coord: (item: T) => LatLng,
  predicate?: (item: T) => boolean,
): T[] {
  const scored: { item: T; distance: number }[] = []
  for (const item of items) {
    if (predicate && !predicate(item)) continue
    scored.push({ item, distance: haversineM(origin, coord(item)) })
  }
  scored.sort((a, b) => a.distance - b.distance)
  return scored.slice(0, count).map((entry) => entry.item)
}

export function withinRadius<T>(
  origin: LatLng,
  items: T[],
  radiusM: number,
  coord: (item: T) => LatLng,
): { item: T; distance: number }[] {
  const hits: { item: T; distance: number }[] = []
  for (const item of items) {
    const distance = haversineM(origin, coord(item))
    if (distance <= radiusM) hits.push({ item, distance })
  }
  hits.sort((a, b) => a.distance - b.distance)
  return hits
}

export interface LineProjection {
  distM: number
  alongM: number
  totalM: number
}

/** Najbliža točka na liniji, u metrima, lokalnom ekvidistantnom aproksimacijom. */
export function projectToLine(coords: [number, number][], lng: number, lat: number): LineProjection {
  if (coords.length === 0) return { distM: Infinity, alongM: 0, totalM: 0 }
  const lat0 = (lat * Math.PI) / 180
  const mLat = 111_320
  const mLng = 111_320 * Math.cos(lat0)
  const px = lng * mLng
  const py = lat * mLat
  if (coords.length === 1) {
    const dx = px - coords[0][0] * mLng
    const dy = py - coords[0][1] * mLat
    return { distM: Math.hypot(dx, dy), alongM: 0, totalM: 0 }
  }
  let best = Infinity
  let bestAlong = 0
  let walked = 0
  for (let index = 1; index < coords.length; index += 1) {
    const ax = coords[index - 1][0] * mLng
    const ay = coords[index - 1][1] * mLat
    const bx = coords[index][0] * mLng
    const by = coords[index][1] * mLat
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const segLen = Math.sqrt(len2)
    let t = 0
    if (len2 > 0) {
      t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
    }
    const dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    if (dist < best) {
      best = dist
      bestAlong = walked + segLen * t
    }
    walked += segLen
  }
  return { distM: best, alongM: bestAlong, totalM: walked }
}
