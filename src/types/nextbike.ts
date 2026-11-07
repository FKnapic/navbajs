/** Stvarna polja places[] iz nextbike-live.json za city=1172 (pregledano 2026-11-05). */
export interface NextbikePlace {
  uid: number
  lat: number
  lng: number
  bike: boolean
  name: string | null
  address?: string | null
  spot: boolean
  number: number
  booked_bikes?: number
  bikes?: number
  bikes_available_to_rent?: number
  active_place?: number
  bike_racks?: number
  free_racks?: number
  special_racks?: number
  free_special_racks?: number
  maintenance?: boolean
  terminal_type?: string
  place_type?: string
  rack_locks?: boolean
}

export interface NextbikeResponse {
  countries?: Array<{
    cities?: Array<{
      uid?: number
      name?: string
      num_places?: number
      places?: NextbikePlace[]
    }>
  }>
}
