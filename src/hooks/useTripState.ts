import { useEffect, useMemo, useRef, useState } from "react"
import type { FeatureCollection } from "geojson"
import { laneSharePercent } from "../routing/laneShare"
import { planTrip } from "../routing/planner"
import { cancelRouting, routing } from "../routing/ValhallaRoutingProvider"
import { reverseGeocode } from "../api/geocode"
import { getCurrentFix, getQuickFix } from "../lib/geolocation"
import { haversineM } from "../lib/geo"
import { SAME_PLACE } from "../lib/messages"
import { loadSaved, rememberPlace, removeNamed, saveNamed, type SavedBook } from "../lib/savedPlaces"
import type { GeoFix, Place } from "../types/places"
import type { Segment, TravelMode, TripPlan } from "../types/trip"
import { useInstallPrompt } from "./useInstallPrompt"
import { useLanes } from "./useLanes"
import { useNavigation } from "./useNavigation"
import { useOnline } from "./useOnline"
import { useParking } from "./useParking"
import { useStations } from "./useStations"
import { useTheme } from "./useTheme"
import { useWakeLock } from "./useWakeLock"

export type MapPick = "origin" | "destination" | null
export type ModeKey = "bajs" | "own" | "walk"

export type PlanSlot =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; plan: TripPlan }
  | { status: "error"; message: string }

const IDLE_SLOTS: Record<ModeKey, PlanSlot> = {
  bajs: { status: "idle" },
  own: { status: "idle" },
  walk: { status: "idle" },
}

const NO_SEGMENTS: Segment[] = []

function modeFor(key: ModeKey, onBajs: boolean): TravelMode {
  if (key === "own") return "own-bike"
  if (key === "walk") return "walk"
  return onBajs ? "bajs-riding" : "bajs"
}

function fastest(slots: Record<ModeKey, PlanSlot>): ModeKey | null {
  let best: ModeKey | null = null
  let time = Infinity
  for (const key of ["bajs", "own", "walk"] as const) {
    const slot = slots[key]
    if (slot.status === "ready" && slot.plan.totalDurationS < time) {
      time = slot.plan.totalDurationS
      best = key
    }
  }
  return best
}

export function useTripState() {
  const themeApi = useTheme()
  const online = useOnline()
  const stationsApi = useStations()
  const parkingApi = useParking()
  const lanesApi = useLanes()
  const install = useInstallPrompt()

  const [onBajs, setOnBajs] = useState(false)
  const [origin, setOriginState] = useState<Place | null>(null)
  const [destination, setDestinationState] = useState<Place | null>(null)
  const [slots, setSlots] = useState<Record<ModeKey, PlanSlot>>(IDLE_SLOTS)
  const [selected, setSelected] = useState<ModeKey>("bajs")
  const [toast, setToast] = useState<string | null>(null)
  const [navigating, setNavigating] = useState(false)
  const [follow, setFollow] = useState(true)
  const [mapPick, setMapPick] = useState<MapPick>(null)
  const [locating, setLocating] = useState(false)
  const [showStations, setShowStations] = useState(true)
  const [showParking, setShowParking] = useState(true)
  const [showLanes, setShowLanes] = useState(true)
  const [lanePct, setLanePct] = useState<number | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [userFix, setUserFix] = useState<GeoFix | null>(null)
  const [locateCue, setLocateCue] = useState<{ lat: number; lng: number; token: number } | null>(null)
  const [book, setBook] = useState<SavedBook>(() => loadSaved())

  const stationsRef = useRef(stationsApi.stations)
  const parkingsRef = useRef(parkingApi.parkings)
  const navigatingRef = useRef(navigating)
  const planningRef = useRef(false)
  const onBajsRef = useRef(onBajs)
  const originRef = useRef(origin)
  const destinationRef = useRef(destination)
  const selectedRef = useRef(selected)
  const slotsRef = useRef(slots)
  const manualRef = useRef(false)
  const phaseRef = useRef<TripPlan["segments"][number]["role"] | null>(null)
  const fixRef = useRef<GeoFix | null>(null)
  const stationReplanAt = useRef(0)
  const planKey = useRef("")
  const mapToken = useRef(0)
  const tokens = useRef({ bajs: 0, own: 0, walk: 0 })
  const planCache = useRef<Partial<Record<ModeKey, TripPlan>>>({})
  const sessionPlans = useRef(new Map<string, { at: number; slots: Record<ModeKey, PlanSlot> }>())
  const onlineRef = useRef(online)

  stationsRef.current = stationsApi.stations
  parkingsRef.current = parkingApi.parkings
  navigatingRef.current = navigating
  onBajsRef.current = onBajs
  originRef.current = origin
  destinationRef.current = destination
  selectedRef.current = selected
  slotsRef.current = slots
  onlineRef.current = online

  const selectedSlot = slots[selected]
  const shown =
    selectedSlot.status === "ready"
      ? selectedSlot.plan
      : selectedSlot.status === "loading"
        ? (planCache.current[selected] ?? null)
        : null
  const shownRef = useRef(shown)
  shownRef.current = shown

  const navigation = useNavigation({
    enabled: navigating && shown != null,
    segments: shown?.segments ?? NO_SEGMENTS,
    destination,
    pickupPenaltyS: shown?.pickupPenaltyS ?? 0,
    dropoffPenaltyS: shown?.dropoffPenaltyS ?? 0,
    onOffRoute: (fix) => {
      void reroute(fix)
    },
  })
  phaseRef.current = navigation.activeRole
  fixRef.current = navigation.fix

  useWakeLock(navigating)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 8000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const lines =
      shown?.segments.filter((segment) => segment.move === "bicycle").map((segment) => segment.geometry.coordinates) ?? []
    if (!shown || !lanesApi.index || !lines.length) {
      setLanePct(null)
      return
    }
    const index = lanesApi.index
    const timer = window.setTimeout(() => setLanePct(laneSharePercent(lines, index)), 30)
    return () => window.clearTimeout(timer)
  }, [shown, lanesApi.index])

  function publish(next: Record<ModeKey, PlanSlot>, preferFastest: boolean) {
    slotsRef.current = next
    setSlots(next)
    planningRef.current = (["bajs", "own", "walk"] as const).some((key) => next[key].status === "loading")
    if (!planningRef.current && planKey.current) {
      sessionPlans.current.set(planKey.current, { at: Date.now(), slots: next })
    }
    if (!preferFastest || manualRef.current || navigatingRef.current) return
    const best = fastest(next)
    if (best) setSelected(best)
  }

  async function runSlot(
    key: ModeKey,
    from: Place,
    to: Place,
    options: { riding?: boolean; preferredParkingId?: string | null; preferFastest?: boolean; toast?: string },
  ) {
    const token = ++tokens.current[key]
    const mode = modeFor(key, options.riding ?? onBajsRef.current)
    const loading = { ...slotsRef.current, [key]: { status: "loading" as const } }
    publish(loading, false)
    try {
      if (!onlineRef.current) throw new Error("Nema internetske veze. Stanice uživo i novi račun trebaju mrežu.")
      const plan = await planTrip(
        {
          mode,
          origin: from,
          destination: to,
          stations: stationsRef.current,
          parkings: parkingsRef.current,
          preferredParkingId: mode === "own-bike" ? (options.preferredParkingId ?? null) : null,
        },
        routing,
      )
      if (tokens.current[key] !== token) return
      planCache.current[key] = plan
      publish({ ...slotsRef.current, [key]: { status: "ready", plan } }, options.preferFastest ?? false)
      if (options.toast) setToast(options.toast)
    } catch (error) {
      if (tokens.current[key] !== token || (error instanceof DOMException && error.name === "AbortError")) return
      const message = error instanceof Error ? error.message : "Rutu trenutno nije moguće izračunati. Pokušajte ponovno."
      publish({ ...slotsRef.current, [key]: { status: "error", message } }, false)
      if (options.toast) setToast(options.toast)
      if (navigatingRef.current && selectedRef.current === key) setNavigating(false)
    }
  }

  function compareAll(from: Place, to: Place) {
    const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}>${onBajsRef.current ? 1 : 0}`
    const saved = sessionPlans.current.get(key)
    if (saved && Date.now() - saved.at < 30_000) {
      cancelRouting()
      tokens.current = { bajs: tokens.current.bajs + 1, own: tokens.current.own + 1, walk: tokens.current.walk + 1 }
      planKey.current = key
      manualRef.current = false
      publish(saved.slots, false)
      return
    }
    if (planningRef.current && planKey.current === key) return
    cancelRouting()
    planKey.current = key
    manualRef.current = false
    planCache.current = {}
    const riding = onBajsRef.current
    void runSlot("bajs", from, to, { riding, preferFastest: false })
    void runSlot("own", from, to, { preferFastest: false })
    void runSlot("walk", from, to, { preferFastest: false })
  }

  function retryRoutes() {
    planKey.current = ""
    planningRef.current = false
    const from = originRef.current
    const to = destinationRef.current
    if (!from || !to || haversineM(from, to) < 20) return
    compareAll(from, to)
  }

  async function reroute(fix: GeoFix) {
    const current = shownRef.current
    const to = destinationRef.current
    if (!current || !to || planningRef.current) return
    const phase = phaseRef.current
    const pastPickup = current.mode === "bajs" && phase != null && phase !== "to-pickup"
    const riding = onBajsRef.current || pastPickup
    if (pastPickup && !onBajsRef.current) setOnBajs(true)
    const from: Place = { lat: fix.lat, lng: fix.lng, label: "Moja lokacija", source: "gps" }
    setOriginState(from)
    const key: ModeKey = current.mode === "own-bike" ? "own" : current.mode === "walk" ? "walk" : "bajs"
    setToast("Skrenuli ste s rute. Računam novu rutu.")
    await runSlot(key, from, to, { riding, preferFastest: false, toast: "Ruta je ponovno izračunata." })
  }

  const originAt = origin ? `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}` : ""
  const destinationAt = destination ? `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}` : ""

  useEffect(() => {
    if (navigatingRef.current) return
    const from = originRef.current
    const to = destinationRef.current
    if (!from || !to) {
      tokens.current = { bajs: tokens.current.bajs + 1, own: tokens.current.own + 1, walk: tokens.current.walk + 1 }
      planCache.current = {}
      planningRef.current = false
      slotsRef.current = IDLE_SLOTS
      setSlots(IDLE_SLOTS)
      return
    }
    if (haversineM(from, to) < 20) {
      const message = SAME_PLACE
      const errored: Record<ModeKey, PlanSlot> = {
        bajs: { status: "error", message },
        own: { status: "error", message },
        walk: { status: "error", message },
      }
      tokens.current = { bajs: tokens.current.bajs + 1, own: tokens.current.own + 1, walk: tokens.current.walk + 1 }
      planCache.current = {}
      planningRef.current = false
      slotsRef.current = errored
      setSlots(errored)
      return
    }
    compareAll(from, to)
    // compareAll čita svježe refove; effect smije ovisiti samo o koordinatama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originAt, destinationAt])

  useEffect(() => {
    const current = shownRef.current
    if (!current || planningRef.current) return
    if (current.mode !== "bajs" && current.mode !== "bajs-riding") return
    const stations = stationsApi.stations
    if (!stations.length) return
    const from = originRef.current
    const to = destinationRef.current
    if (!from || !to) return
    const phase = phaseRef.current
    const needPickup = current.mode === "bajs" && (!navigating || phase == null || phase === "to-pickup")
    const pickup = current.pickup ? stations.find((station) => station.id === current.pickup?.id) : undefined
    const dropoff = current.dropoff ? stations.find((station) => station.id === current.dropoff?.id) : undefined
    let message: string | null = null
    if (needPickup && current.pickup && (!pickup || pickup.bikes < 1)) {
      message = "Odabrana stanica više nema slobodan bicikl. Ruta je ponovno izračunata."
    } else if (current.dropoff && phase !== "to-dest" && (!dropoff || dropoff.freeRacks < 1)) {
      message = "Odabrana stanica više nema slobodno mjesto. Ruta je ponovno izračunata."
    }
    if (!message || Date.now() - stationReplanAt.current < 20_000) return
    stationReplanAt.current = Date.now()
    const riding = onBajsRef.current || (navigating && phase != null && phase !== "to-pickup")
    if (riding && !onBajsRef.current) setOnBajs(true)
    void runSlot("bajs", riding && fixRef.current ? { lat: fixRef.current.lat, lng: fixRef.current.lng, label: "Moja lokacija", source: "gps" } : from, to, {
      riding,
      preferFastest: false,
      toast: message,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationsApi.stations, shown?.id, navigating])

  function setOrigin(place: Place | null) {
    setOriginState(place)
    if (place) setBook((current) => rememberPlace(current, place))
  }

  function setDestination(place: Place | null) {
    setNavigating(false)
    setDestinationState(place)
    if (place) setBook((current) => rememberPlace(current, place))
  }

  function toggleOnBajs() {
    const next = !onBajsRef.current
    setOnBajs(next)
    const from = originRef.current
    const to = destinationRef.current
    if (!from || !to || navigatingRef.current) return
    void runSlot("bajs", from, to, { riding: next, preferFastest: false })
  }

  function selectMode(key: ModeKey) {
    if (slotsRef.current[key].status === "idle") return
    manualRef.current = true
    setSelected(key)
  }

  async function useMyLocation(kind: "origin" | "destination" = "origin") {
    setLocating(true)
    setGpsError(null)
    const apply = (fix: GeoFix) => {
      setUserFix(fix)
      setGpsError(null)
      const place: Place = { lat: fix.lat, lng: fix.lng, label: "Moja lokacija", source: "gps" }
      if (kind === "origin") setOrigin(place)
      else setDestination(place)
    }
    let rough = false
    const quick = await getQuickFix()
    if (quick) {
      apply(quick)
      rough = true
    }
    try {
      apply(await getCurrentFix())
    } catch (error) {
      if (!rough) setGpsError(error instanceof Error ? error.message : "Lokacija nije dostupna.")
    } finally {
      setLocating(false)
    }
  }

  async function centerOnMe() {
    try {
      const fix = await getCurrentFix()
      setUserFix(fix)
      setGpsError(null)
      setLocateCue({ lat: fix.lat, lng: fix.lng, token: Date.now() })
    } catch (error) {
      setGpsError(error instanceof Error ? error.message : "Lokacija nije dostupna.")
    }
  }

  function sameCoord(place: Place | null, lat: number, lng: number): boolean {
    return place != null && Math.abs(place.lat - lat) < 1e-6 && Math.abs(place.lng - lng) < 1e-6
  }

  async function placeFromMap(kind: "origin" | "destination", lat: number, lng: number) {
    const token = ++mapToken.current
    const provisional: Place = { lat, lng, label: "Točka na karti", source: "map" }
    setNavigating(false)
    if (kind === "origin") setOriginState(provisional)
    else setDestinationState(provisional)
    const label = await reverseGeocode(lat, lng)
    if (mapToken.current !== token) return
    const named = { ...provisional, label }
    if (kind === "origin") {
      setOriginState((current) => (sameCoord(current, lat, lng) ? named : current))
      setBook((current) => rememberPlace(current, named))
    } else {
      setDestinationState((current) => (sameCoord(current, lat, lng) ? named : current))
      setBook((current) => rememberPlace(current, named))
    }
  }

  function pickOnMap(lat: number, lng: number) {
    if (!mapPick) return
    const kind = mapPick
    setMapPick(null)
    void placeFromMap(kind, lat, lng)
  }

  function placeFromStation(kind: "origin" | "destination", id: number) {
    const station = stationsApi.stations.find((item) => item.id === id)
    if (!station) return
    const place: Place = { lat: station.lat, lng: station.lng, label: station.name, source: "station" }
    if (kind === "origin") setOrigin(place)
    else setDestination(place)
  }

  function chooseParking(id: string) {
    const from = originRef.current
    const to = destinationRef.current
    if (!from || !to) return
    manualRef.current = true
    setSelected("own")
    void runSlot("own", from, to, { preferredParkingId: id, preferFastest: false })
  }

  function placeFromParking(id: string) {
    const parking = parkingApi.parkings.find((item) => item.id === id)
    if (!parking) return
    if (originRef.current && destinationRef.current) {
      chooseParking(id)
      return
    }
    setDestination({ lat: parking.lat, lng: parking.lng, label: parking.name, source: "parking" })
  }

  function savePlace(kind: "home" | "work", place?: Place) {
    const target = place ?? destinationRef.current
    if (!target) return
    setBook((current) => saveNamed(current, kind, target))
    setToast(kind === "home" ? "Spremljeno kao Dom." : "Spremljeno kao Posao.")
  }

  function removePlace(kind: "home" | "work") {
    setBook((current) => removeNamed(current, kind))
  }

  function focusMap(lat: number, lng: number) {
    setLocateCue({ lat, lng, token: Date.now() })
  }

  const focusStationIds = useMemo(() => {
    const ids = new Set<number>()
    if (shown?.pickup) ids.add(Number(shown.pickup.id))
    if (shown?.dropoff) ids.add(Number(shown.dropoff.id))
    return ids
  }, [shown])

  const stationGeo = useMemo<FeatureCollection>(() => {
    const dimming = shown != null
    return {
      type: "FeatureCollection",
      features: stationsApi.stations.map((station) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [station.lng, station.lat] },
        properties: {
          id: station.id,
          bikes: station.bikes,
          freeRacks: station.freeRacks,
          name: station.name,
          dim: dimming && !focusStationIds.has(station.id) ? 1 : 0,
          rank: station.bikes > 3 ? 3 : station.bikes > 0 ? 2 : 1,
          maint: station.maintenance ? 1 : 0,
          focus: focusStationIds.has(station.id) ? 1 : 0,
        },
      })),
    }
  }, [stationsApi.stations, shown, focusStationIds])

  const parkingGeo = useMemo<FeatureCollection>(() => {
    const focus = shown?.parking?.id ?? null
    const dimming = shown != null
    return {
      type: "FeatureCollection",
      features: parkingApi.parkings.map((parking) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [parking.lng, parking.lat] },
        properties: {
          id: parking.id,
          name: parking.name,
          dim: dimming && focus !== parking.id ? 1 : 0,
        },
      })),
    }
  }, [parkingApi.parkings, shown])

  return {
    theme: themeApi.theme,
    toggleTheme: themeApi.toggle,
    online,
    onBajs,
    toggleOnBajs,
    selected,
    selectMode,
    slots,
    origin,
    destination,
    setOrigin,
    setDestination,
    swap: () => {
      setOriginState(destination)
      setDestinationState(origin)
      setNavigating(false)
    },
    plan: shown,
    navigating,
    startNavigation: () => {
      if (selectedSlot.status !== "ready") return
      setFollow(true)
      setNavigating(true)
    },
    retryRoutes,
    stopNavigation: () => setNavigating(false),
    follow,
    setFollow,
    navigation,
    mapPick,
    setMapPick,
    pickOnMap,
    locating,
    useMyLocation,
    centerOnMe,
    locateCue,
    userFix,
    gpsError,
    showStations,
    setShowStations,
    showParking,
    setShowParking,
    showLanes,
    setShowLanes,
    stationGeo,
    parkingGeo,
    lanes: lanesApi.collection,
    stations: stationsApi.stations,
    parkings: parkingApi.parkings,
    stationsStatus: stationsApi.status,
    stationsError: stationsApi.error,
    stationsUpdatedAt: stationsApi.updatedAt,
    reloadStations: stationsApi.reload,
    lanePct,
    install,
    placeFromStation,
    placeFromParking,
    chooseParking,
    book,
    savePlace,
    removePlace,
    focusMap,
    toast,
    dismissToast: () => setToast(null),
  }
}

export type TripController = ReturnType<typeof useTripState>
