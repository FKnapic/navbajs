import type { NextbikePlace, NextbikeResponse } from "../types/nextbike"
import type { Station } from "../types/station"

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function normalizePlace(place: NextbikePlace): Station | null {
  if (place.active_place !== 1) return null
  if (place.bike === true && place.spot !== true) return null
  const lat = num(place.lat)
  const lng = num(place.lng)
  if (lat == null || lng == null || Math.abs(lat) < 1 || Math.abs(lng) < 1) return null
  const onSite = num(place.bikes) ?? 0
  const booked = num(place.booked_bikes) ?? 0
  const available = num(place.bikes_available_to_rent) ?? Math.max(0, onSite - booked)
  return {
    id: place.uid,
    number: place.number,
    name: (place.name ?? "").trim() || `Stanica ${place.number}`,
    lat,
    lng,
    bikes: Math.max(0, available),
    bikesOnSite: Math.max(0, onSite),
    freeRacks: Math.max(0, num(place.free_racks) ?? 0),
    racks: Math.max(0, num(place.bike_racks) ?? 0),
    maintenance: place.maintenance === true,
  }
}

export function normalizeNextbike(payload: NextbikeResponse): Station[] {
  const stations: Station[] = []
  for (const country of payload.countries ?? []) {
    for (const city of country.cities ?? []) {
      for (const place of city.places ?? []) {
        const station = normalizePlace(place)
        if (station) stations.push(station)
      }
    }
  }
  return stations
}
