export interface LatLng {
  lat: number
  lng: number
}

export interface Place extends LatLng {
  label: string
  source: "search" | "gps" | "map" | "station" | "parking"
  title?: string
  subtitle?: string
  approximate?: boolean
}

export interface GeoFix extends LatLng {
  accuracy: number | null
  heading: number | null
}

export interface GeocodeResult {
  label: string
  title: string
  subtitle: string
  lat: number
  lng: number
  approximate?: boolean
}
