/** Normalizirana Bajs stanica. Polja dolaze iz Nextbike live JSON-a. */
export interface Station {
  id: number
  number: number
  name: string
  lat: number
  lng: number
  /** bikes_available_to_rent */
  bikes: number
  /** bikes na lokaciji, uključujući rezervirane */
  bikesOnSite: number
  /** free_racks */
  freeRacks: number
  racks: number
  maintenance: boolean
}

export interface StationsResponse {
  stations: Station[]
  fetchedAt: string
  source: "proxy" | "direct"
}
