import type { LineString } from "geojson"
import type { LatLng } from "../types/places"
import type { Step } from "../types/trip"

export type RouteProfile = "bicycle" | "pedestrian"

export interface MatrixCell {
  timeS: number | null
  distanceM: number | null
}

export interface RouteLeg {
  geometry: LineString
  distanceM: number
  durationS: number
  steps: Step[]
}

export interface RoutingProvider {
  matrix(sources: LatLng[], targets: LatLng[], profile: RouteProfile): Promise<MatrixCell[][]>
  route(locations: LatLng[], profile: RouteProfile): Promise<RouteLeg>
}
