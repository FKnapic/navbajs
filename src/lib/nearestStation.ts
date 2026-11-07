import { haversineM } from "./geo"
import type { Station } from "../types/station"

export interface NearestStation {
  station: Station
  meters: number
  note: string | null
}

export function nearestStation(fix: { lat: number; lng: number } | null, stations: Station[]): NearestStation | null {
  if (!fix || stations.length === 0) return null
  const ranked = stations
    .map((station) => ({ station, meters: haversineM(fix, station) }))
    .sort((a, b) => a.meters - b.meters)
  const available = (item: { station: Station }) => item.station.bikes > 0 && !item.station.maintenance
  const nearby = ranked.find((item) => item.meters <= 1000 && available(item))
  if (nearby) return { station: nearby.station, meters: nearby.meters, note: null }
  const farther = ranked.find(available)
  if (farther) return { station: farther.station, meters: farther.meters, note: "Nema bicikla u blizini" }
  const first = ranked[0]
  return first ? { station: first.station, meters: first.meters, note: "Nema bicikla u blizini" } : null
}

export function walkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 80))
}
