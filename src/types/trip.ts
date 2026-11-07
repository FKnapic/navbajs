import type { LineString } from "geojson"

export type TravelMode = "bajs" | "bajs-riding" | "own-bike" | "walk"
export type SegmentRole = "to-pickup" | "ride" | "to-dest" | "direct"
export type MoveMode = "pedestrian" | "bicycle"

export interface Step {
  instruction: string
  distanceM: number
  durationS: number
  lat: number
  lng: number
  alongM: number
}

export interface Segment {
  role: SegmentRole
  move: MoveMode
  title: string
  fromLabel: string
  toLabel: string
  geometry: LineString
  distanceM: number
  durationS: number
  steps: Step[]
}

export interface ParkingChoice {
  parkingId: string
  name: string
  straightM: number
  walkM: number
  walkS: number
  bikeS: number
  totalS: number
}

export interface PlanStop {
  id: number | string
  name: string
  lat: number
  lng: number
  bikes?: number
  freeRacks?: number
  maintenance?: boolean
}

export interface TripPlan {
  id: string
  mode: TravelMode
  originLabel: string
  destinationLabel: string
  segments: Segment[]
  totalDistanceM: number
  totalDurationS: number
  pickupPenaltyS: number
  dropoffPenaltyS: number
  penaltyNote: string | null
  warnings: string[]
  pickup: PlanStop | null
  dropoff: PlanStop | null
  parking: PlanStop | null
  parkingChoices: ParkingChoice[]
  parkingRadiusM: number | null
  noParking: boolean
  lockReminder: boolean
  bikeDurationS: number
  walkAlternative: TripPlan | null
}
