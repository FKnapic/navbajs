import { useEffect, useRef } from "react"
import type { FeatureCollection } from "geojson"
import { GeoJSONSource, LngLatBounds, Map, Marker, Popup, ScaleControl, type MapMouseEvent, type PaddingOptions } from "maplibre-gl"
import type { Theme } from "../hooks/useTheme"
import { cssColor } from "../lib/palette"
import type { Place } from "../types/places"
import type { Parking } from "../types/parking"
import type { Station } from "../types/station"
import type { Segment } from "../types/trip"
import { tuneBasemap } from "./mapStyle"
import { EMPTY, ensureLayers, mapStyle, openParkingPopup, openStationPopup, setGeo, setVisible } from "./mapLayers"

interface UserDot {
  lat: number
  lng: number
  heading: number | null
}

interface MapViewProps {
  theme: Theme
  stations: Station[]
  parkings: Parking[]
  stationGeo: FeatureCollection
  parkingGeo: FeatureCollection
  lanes: FeatureCollection | null
  segments: Segment[]
  showStations: boolean
  showParking: boolean
  showLanes: boolean
  origin: Place | null
  destination: Place | null
  user: UserDot | null
  follow: boolean
  navigating: boolean
  fitToken: string
  locateCue: { lat: number; lng: number; token: number } | null
  mapPick: "origin" | "destination" | null
  onPick: (lat: number, lng: number) => void
  onStationOrigin: (id: number) => void
  onStationDestination: (id: number) => void
  onParkingDestination: (id: string) => void
  onParkHere: (id: string) => void
  onUserDrag: () => void
}

function markerElement(label: string, color: string, ink: string): HTMLDivElement {
  const element = document.createElement("div")
  element.className = "point-marker"
  element.style.background = color
  element.style.color = ink
  element.textContent = label
  element.setAttribute("aria-hidden", "true")
  return element
}

function padding(navigating: boolean): PaddingOptions {
  const desktop = window.matchMedia("(min-width: 960px)").matches
  if (navigating) return { top: 168, bottom: 108, left: 28, right: 28 }
  if (desktop) return { top: 72, bottom: 48, left: 420, right: 48 }
  const sheet = document.getElementById("nav-sheet")?.getBoundingClientRect().height
  const bottom = Math.round((sheet ?? window.innerHeight * 0.42) + 28)
  return { top: 72, bottom, left: 24, right: 24 }
}

export function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const propsRef = useRef(props)
  const originMarker = useRef<Marker | null>(null)
  const destMarker = useRef<Marker | null>(null)
  const userMarker = useRef<Marker | null>(null)
  const themeRef = useRef(props.theme)
  const wasNavigating = useRef(false)
  propsRef.current = props

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const map = new Map({
      container,
      style: mapStyle(props.theme),
      center: [15.9815, 45.813],
      zoom: 12,
      attributionControl: false,
      fadeDuration: 0,
      cancelPendingTileRequestsWhileZooming: true,
      locale: {
        "Popup.Close": "Zatvori",
        "ScaleControl.Kilometers": "km",
        "ScaleControl.Meters": "m",
        "Map.Title": "Karta",
      },
    })
    map.addControl(new ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-right")
    map.on("load", () => {
      tuneBasemap(map, propsRef.current.theme)
      ensureLayers(map)
      paint(map, propsRef.current)
    })
    map.on("click", (event: MapMouseEvent) => {
      const current = propsRef.current
      const clusterLayers = ["clusters", "cluster-count"].filter((id) => map.getLayer(id))
      const stationLayers = ["station-mark-focus", "station-mark", "stations"].filter((id) => map.getLayer(id))
      const clusterHit = clusterLayers.length
        ? map.queryRenderedFeatures(event.point, { layers: clusterLayers })[0]
        : undefined
      if (clusterHit && !current.mapPick) {
        const source = map.getSource("stations") as GeoJSONSource | undefined
        const clusterId = Number(clusterHit.properties?.cluster_id)
        const count = Number(clusterHit.properties?.point_count)
        if (Number.isFinite(count)) {
          new Popup({ closeButton: false, className: "bikebr-popup", offset: 18 })
            .setLngLat(event.lngLat)
            .setText(`${count} ${stationWord(count)}`)
            .addTo(map)
        }
        if (!source || !Number.isFinite(clusterId)) return
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({ center: event.lngLat, zoom, duration: 200 })
        })
        return
      }
      if (current.mapPick) {
        current.onPick(event.lngLat.lat, event.lngLat.lng)
        return
      }
      const layers = [...stationLayers, "parking"].filter(
        (id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none",
      )
      const feature = layers.length
        ? map.queryRenderedFeatures(event.point, { layers })[0]
        : undefined
      if (feature?.layer?.id === "stations" || feature?.layer?.id === "station-mark" || feature?.layer?.id === "station-mark-focus") {
        const id = Number(feature.properties?.id)
        const station = current.stations.find((item) => item.id === id)
        if (!station) return
        openStationPopup(map, station, event.lngLat, {
          origin: () => current.onStationOrigin(id),
          destination: () => current.onStationDestination(id),
        })
        return
      }
      if (feature?.layer?.id === "parking") {
        const id = String(feature.properties?.id ?? "")
        const parking = current.parkings.find((item) => item.id === id)
        if (!parking) return
        openParkingPopup(map, parking, event.lngLat, {
          destination: () => current.onParkingDestination(id),
          park: () => current.onParkHere(id),
        })
        return
      }
    })
    const syncCursor = (over: boolean) => {
      map.getCanvas().style.cursor = propsRef.current.mapPick ? "crosshair" : over ? "pointer" : ""
    }
    for (const id of ["clusters", "cluster-count", "stations", "station-mark", "station-mark-focus", "parking"]) {
      map.on("mouseenter", id, () => syncCursor(true))
      map.on("mouseleave", id, () => syncCursor(false))
    }
    map.on("zoomend", () => {
      if (map.getSource("stations")) paint(map, propsRef.current)
    })
    map.on("dragstart", () => {
      if (propsRef.current.navigating) propsRef.current.onUserDrag()
    })
    mapRef.current = map
    if (import.meta.env.DEV) window.__navbajsMap = map
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container)
    return () => {
      observer.disconnect()
      originMarker.current?.remove()
      destMarker.current?.remove()
      userMarker.current?.remove()
      originMarker.current = null
      destMarker.current = null
      userMarker.current = null
      map.remove()
      mapRef.current = null
      if (import.meta.env.DEV && window.__navbajsMap === map) delete window.__navbajsMap
    }
    // Karta se stvara jednom; tema i podaci dolaze zasebnim efektima.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || themeRef.current === props.theme) return
    themeRef.current = props.theme
    map.setStyle(mapStyle(props.theme))
    map.once("style.load", () => {
      sent.delete(map)
      tuneBasemap(map, props.theme)
      ensureLayers(map)
      paint(map, propsRef.current)
    })
  }, [props.theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (!map.getSource("stations")) return
      paint(map, props)
    }
    if (map.isStyleLoaded()) apply()
    else map.once("load", apply)
  }, [
    props.stationGeo,
    props.parkingGeo,
    props.lanes,
    props.segments,
    props.showStations,
    props.showParking,
    props.showLanes,
    props.theme,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    syncMarker(map, originMarker, props.origin, "A", cssColor("--accent"), cssColor("--on-accent"))
    syncMarker(map, destMarker, props.destination, "B", cssColor("--text"), cssColor("--on-marker-b"))
  }, [props.origin, props.destination, props.theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!props.user) {
      userMarker.current?.remove()
      userMarker.current = null
      return
    }
    if (!userMarker.current) {
      const element = document.createElement("div")
      element.className = "user-dot"
      const arrow = document.createElement("span")
      arrow.className = "user-arrow"
      element.append(arrow)
      userMarker.current = new Marker({ element, rotationAlignment: "map" })
        .setLngLat([props.user.lng, props.user.lat])
        .addTo(map)
    } else {
      userMarker.current.setLngLat([props.user.lng, props.user.lat])
    }
    userMarker.current.getElement().classList.toggle("is-nav", props.navigating)
    const heading = props.navigating && props.user.heading != null && Number.isFinite(props.user.heading) ? props.user.heading : 0
    userMarker.current.setRotation(heading)
  }, [props.user, props.navigating])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !props.fitToken || !props.segments.length) return
    const bounds = new LngLatBounds()
    for (const segment of props.segments) {
      for (const coordinate of segment.geometry.coordinates) {
        bounds.extend(coordinate as [number, number])
      }
    }
    if (props.origin) bounds.extend([props.origin.lng, props.origin.lat])
    if (props.destination) bounds.extend([props.destination.lng, props.destination.lat])
    if (bounds.isEmpty()) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    map.fitBounds(bounds, { padding: padding(props.navigating), duration: reduce ? 0 : 200, maxZoom: 16 })
  }, [props.fitToken, props.segments, props.origin, props.destination, props.navigating])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !props.user || !props.follow || !props.navigating) {
      if (!props.navigating) wasNavigating.current = false
      return
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const first = !wasNavigating.current
    wasNavigating.current = true
    const center: [number, number] = [props.user.lng, props.user.lat]
    if (reduce) {
      map.jumpTo({ center, zoom: first ? Math.max(map.getZoom(), 16) : map.getZoom() })
    } else {
      map.easeTo({
        center,
        zoom: first ? Math.max(map.getZoom(), 16) : map.getZoom(),
        duration: 200,
      })
    }
  }, [props.user, props.follow, props.navigating])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !props.locateCue || !map.isStyleLoaded()) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const center: [number, number] = [props.locateCue.lng, props.locateCue.lat]
    if (reduce) map.jumpTo({ center, zoom: Math.max(map.getZoom(), 15) })
    else map.easeTo({ center, zoom: Math.max(map.getZoom(), 15), duration: 200 })
  }, [props.locateCue])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = props.mapPick ? "crosshair" : ""
  }, [props.mapPick])

  return <div ref={containerRef} className="h-full w-full" role="region" aria-label="Karta Zagreba" />
}

const sent = new WeakMap<Map, globalThis.Map<string, unknown>>()

function setGeoOnce(map: Map, id: string, data: FeatureCollection): void {
  let bag = sent.get(map)
  if (!bag) {
    bag = new globalThis.Map()
    sent.set(map, bag)
  }
  if (bag.get(id) === data) return
  bag.set(id, data)
  setGeo(map, id, data)
}

function paint(map: Map, props: MapViewProps): void {
  const zoom = map.getZoom()
  setGeoOnce(map, "stations", props.stationGeo)
  if (zoom >= 15.5) setGeoOnce(map, "parking", props.parkingGeo)
  setGeoOnce(map, "lanes", props.lanes ?? EMPTY)
  const routeKey = props.segments
  let bag = sent.get(map)
  if (!bag) {
    bag = new globalThis.Map()
    sent.set(map, bag)
  }
  if (bag.get("route") !== routeKey) {
    bag.set("route", routeKey)
    setGeo(map, "route", {
      type: "FeatureCollection",
      features: props.segments.map((segment) => ({
        type: "Feature",
        properties: { role: segment.role },
        geometry: segment.geometry,
      })),
    })
  }
  setVisible(map, "stations", props.showStations)
  setVisible(map, "station-mark", props.showStations)
  setVisible(map, "station-mark-focus", props.showStations)
  setVisible(map, "station-pulse", props.showStations)
  setVisible(map, "station-picked", props.showStations)
  setVisible(map, "station-count", props.showStations)
  setVisible(map, "station-detail", props.showStations)
  setVisible(map, "clusters", props.showStations)
  setVisible(map, "cluster-count", props.showStations)
  setVisible(map, "cluster-ring", props.showStations)
  setVisible(map, "parking", props.showParking)
  setVisible(map, "lanes", props.showLanes)
  const hasRoute = props.segments.length > 0
  if (map.getLayer("clusters")) map.setPaintProperty("clusters", "circle-opacity", hasRoute ? 0.28 : 1)
  if (map.getLayer("cluster-ring")) map.setPaintProperty("cluster-ring", "circle-opacity", hasRoute ? 0.2 : 1)
  if (map.getLayer("cluster-count")) map.setPaintProperty("cluster-count", "text-opacity", hasRoute ? 0.4 : 1)
  setVisible(map, "route", hasRoute)
  setVisible(map, "route-casing", hasRoute)
}

function stationWord(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return "stanica"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "stanice"
  return "stanica"
}

function syncMarker(
  map: Map,
  slot: { current: Marker | null },
  place: Place | null,
  label: string,
  color: string,
  ink: string,
): void {
  if (!place) {
    slot.current?.remove()
    slot.current = null
    return
  }
  if (!slot.current) {
    slot.current = new Marker({ element: markerElement(label, color, ink), anchor: "center" })
      .setLngLat([place.lng, place.lat])
      .addTo(map)
  } else {
    const element = slot.current.getElement()
    element.style.background = color
    element.style.color = ink
    slot.current.setLngLat([place.lng, place.lat])
  }
}
