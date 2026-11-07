export type ParkingSource = "zagreb" | "osm" | "merged"

export interface Parking {
  id: string
  name: string
  location: string | null
  kind: string | null
  racks: number | null
  capacity: number | null
  year: number | null
  district: string | null
  neighborhood: string | null
  /** true = nadstrešnica, false = nema, null = podatak ne postoji */
  covered: boolean | null
  lat: number
  lng: number
  source: ParkingSource
}

export interface OsmParkingRecord {
  id: string
  lat: number
  lng: number
  name?: string | null
  kind?: string | null
  capacity?: number | null
  covered?: boolean | null
}

export interface ParkingFact {
  label: string
  value: string
}
