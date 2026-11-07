import along from "@turf/along"
import { lineString, point } from "@turf/helpers"
import length from "@turf/length"
import nearestPointOnLine from "@turf/nearest-point-on-line"
import type { Position } from "geojson"
import type { LaneIndex } from "../api/lanes"

const SAMPLE_M = 30
const NEAR_M = 20

/**
 * Udio dužine biciklističke rute koji je unutar 20 m od službene staze.
 * Uzorkovanje ide Turfom (along, length, nearest-point-on-line).
 */
export function laneSharePercent(lines: Position[][], index: LaneIndex): number | null {
  if (!lines.length || !index.lines.length) return null
  let samples = 0
  let hits = 0
  for (const coordinates of lines) {
    if (coordinates.length < 2) continue
    const line = lineString(coordinates)
    const kilometers = length(line, { units: "kilometers" })
    const steps = Math.max(1, Math.round((kilometers * 1000) / SAMPLE_M))
    for (let step = 0; step <= steps; step += 1) {
      const sample = along(line, (kilometers * step) / steps, { units: "kilometers" })
      const [lng, lat] = sample.geometry.coordinates
      samples += 1
      if (nearLane(lng, lat, index)) hits += 1
    }
  }
  if (!samples) return null
  return (hits / samples) * 100
}

function nearLane(lng: number, lat: number, index: LaneIndex): boolean {
  const x = Math.floor(lng / index.cell)
  const y = Math.floor(lat / index.cell)
  const seen = new Set<number>()
  const sample = point([lng, lat])
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const list = index.cells.get(`${x + dx}:${y + dy}`)
      if (!list) continue
      for (const lineIndex of list) {
        if (seen.has(lineIndex)) continue
        seen.add(lineIndex)
        const candidate = index.lines[lineIndex]
        if (!candidate || candidate.length < 2) continue
        const snapped = nearestPointOnLine(lineString(candidate), sample, { units: "meters" })
        const distance = snapped.properties.dist ?? Infinity
        if (distance <= NEAR_M) return true
      }
    }
  }
  return false
}
