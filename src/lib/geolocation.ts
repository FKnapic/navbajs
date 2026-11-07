import type { GeoFix } from "../types/places"

export function geoErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "Pristup lokaciji je odbijen. Uključite dozvolu za lokaciju u pregledniku."
  }
  if (error.code === error.TIMEOUT) {
    return "Isteklo je čekanje na GPS. Pokušajte ponovo na otvorenome."
  }
  return "Lokacija trenutačno nije dostupna."
}

export function toFix(position: GeolocationPosition): GeoFix {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    heading: position.coords.heading,
  }
}

function requestFix(options: PositionOptions): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Ovaj preglednik ne podržava geolokaciju."))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toFix(position)),
      (error) => reject(new Error(geoErrorMessage(error))),
      options,
    )
  })
}

/** Brza lokacija iz predmemorije preglednika. Bez predmemorije odustaje odmah. */
export function getQuickFix(): Promise<GeoFix | null> {
  return requestFix({ enableHighAccuracy: false, timeout: 800, maximumAge: 120_000 }).catch(() => null)
}

export function getCurrentFix(): Promise<GeoFix> {
  return requestFix({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 })
}
