import proj4 from "proj4"

// HTRS96 / Croatia TM, uobičajen za starije izvoze Geoportala.
proj4.defs(
  "EPSG:3765",
  "+proj=tmerc +lat_0=0 +lon_0=16.5 +k=0.9999 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs",
)

export interface LonLat {
  lng: number
  lat: number
}

/**
 * GeoJSON iz data.gov.hr za ova dva skupa već je CRS84 (lng, lat).
 * Ako koordinata izgleda kao metarski HTRS96, pretvara se u WGS84.
 * Ako je par spremljen kao lat/lng, osi se zamijene.
 */
export function normalizeCoord(x: number, y: number): LonLat | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  let lng = x
  let lat = y
  if (Math.abs(x) > 180 || Math.abs(y) > 90) {
    const projected = proj4("EPSG:3765", "WGS84", [x, y]) as [number, number]
    lng = projected[0]
    lat = projected[1]
  } else if (x > 40 && x < 50 && y > 13 && y < 20) {
    lat = x
    lng = y
  }
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null
  return { lng, lat }
}
