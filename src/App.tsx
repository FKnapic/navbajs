import { useCallback, useEffect, useRef, useState } from "react"
import { Info, LocateFixed, Moon, Sun } from "lucide-react"
import { LogoMark, Wordmark } from "./components/LogoMark"
import { MapView } from "./components/MapView"
import { BottomSheet } from "./components/BottomSheet"
import { LayerMenu } from "./components/LayerMenu"
import { NavigationHud } from "./components/NavigationHud"
import { StatusChips } from "./components/StatusChips"
import { warmAddresses } from "./api/geocode"
import { useTripState } from "./hooks/useTripState"
import type { Segment } from "./types/trip"

const NO_SEGMENTS: Segment[] = []

export default function App() {
  const trip = useTripState()
  const segments = trip.plan?.segments ?? NO_SEGMENTS
  const [frame, setFrame] = useState("peek")
  const [credit, setCredit] = useState(false)
  const creditRef = useRef<HTMLDivElement>(null)
  const onFrame = useCallback((snap: string) => setFrame(snap), [])

  useEffect(() => {
    warmAddresses()
  }, [])

  useEffect(() => {
    if (!credit) return
    const onPointer = (event: PointerEvent) => {
      if (!creditRef.current?.contains(event.target as Node)) setCredit(false)
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [credit])

  return (
    <div className="relative h-full overflow-hidden bg-paper text-ink">
      <MapView
        theme={trip.theme}
        stations={trip.stations}
        parkings={trip.parkings}
        stationGeo={trip.stationGeo}
        parkingGeo={trip.parkingGeo}
        lanes={trip.lanes}
        segments={segments}
        showStations={trip.showStations}
        showParking={trip.showParking}
        showLanes={trip.showLanes}
        origin={trip.origin}
        destination={trip.destination}
        user={trip.navigating ? trip.navigation.fix : trip.userFix}
        follow={trip.follow}
        navigating={trip.navigating}
        fitToken={`${trip.plan?.id ?? ""}:${frame}:${trip.navigating ? "nav" : "plan"}`}
        locateCue={trip.locateCue}
        mapPick={trip.mapPick}
        onPick={trip.pickOnMap}
        onStationOrigin={(id) => trip.placeFromStation("origin", id)}
        onStationDestination={(id) => trip.placeFromStation("destination", id)}
        onParkingDestination={(id) => {
          const parking = trip.parkings.find((item) => item.id === id)
          if (!parking) return
          trip.setDestination({ lat: parking.lat, lng: parking.lng, label: parking.name, source: "parking" })
        }}
        onParkHere={trip.placeFromParking}
        onUserDrag={() => trip.setFollow(false)}
      />

      {!trip.navigating && (
        <div className="pointer-events-auto absolute right-3 top-[max(12px,env(safe-area-inset-top))] z-40 flex flex-col gap-2">
          <button type="button" className="map-fab" aria-label="Centriraj na moju lokaciju" onClick={() => void trip.centerOnMe()}>
            <LocateFixed size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button type="button" className="map-fab" aria-label={trip.theme === "dark" ? "Uključi svijetlu temu" : "Uključi tamnu temu"} onClick={trip.toggleTheme}>
            {trip.theme === "dark" ? <Sun size={18} strokeWidth={1.75} aria-hidden="true" /> : <Moon size={18} strokeWidth={1.75} aria-hidden="true" />}
          </button>
          <LayerMenu
            showStations={trip.showStations}
            showParking={trip.showParking}
            showLanes={trip.showLanes}
            onStations={trip.setShowStations}
            onParking={trip.setShowParking}
            onLanes={trip.setShowLanes}
            canInstall={trip.install.canInstall}
            onInstall={() => void trip.install.install()}
          />
        </div>
      )}

      {!trip.navigating && (
        <StatusChips
          updatedAt={trip.stationsUpdatedAt}
          stationsError={trip.stationsError}
          onRetry={() => void trip.reloadStations()}
        />
      )}

      {!trip.navigating && (
        <div ref={creditRef} className="map-credit">
          <button type="button" className="map-fab" aria-label="Izvori podataka" aria-expanded={credit} onClick={() => setCredit((value) => !value)}>
            <Info size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {credit && (
            <div className="absolute bottom-12 right-0 w-72 rounded-xl border border-line bg-sand p-3 text-xs shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-3">
                <LogoMark size={80} />
                <div className="min-w-0">
                  <Wordmark />
                  <p className="mt-2 text-muted">Inačica 1.0.0</p>
                  <p className="mt-1">© OpenStreetMap, Grad Zagreb (data.gov.hr)</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {trip.toast && (
        <div role="status" className="panel absolute left-1/2 top-24 z-40 w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border border-line px-4 py-3 text-sm">
          <div className="flex items-start gap-3">
            <p className="flex-1">{trip.toast}</p>
            <button type="button" onClick={trip.dismissToast} className="min-h-11 min-w-11 font-medium" aria-label="Zatvori obavijest">
              U redu
            </button>
          </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {trip.plan ? `Ruta ${trip.plan.originLabel} do ${trip.plan.destinationLabel}, ${Math.round(trip.plan.totalDurationS / 60)} min` : "Ruta još nije izračunata."}
      </p>

      {!trip.navigating && <BottomSheet trip={trip} onFrame={onFrame} />}
      {trip.navigating && trip.plan && (
        <NavigationHud
          plan={trip.plan}
          nav={trip.navigation}
          follow={trip.follow}
          onFollow={() => trip.setFollow(true)}
          onStop={trip.stopNavigation}
        />
      )}
    </div>
  )
}
