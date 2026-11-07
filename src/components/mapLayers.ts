import type { FeatureCollection } from "geojson"
import { GeoJSONSource, Map, Popup, type ExpressionSpecification, type LngLatLike } from "maplibre-gl"
import { parkingFacts } from "../api/parking"
import type { Parking } from "../types/parking"
import type { Station } from "../types/station"
import type { Theme } from "../hooks/useTheme"
import { cssColor, routeColor } from "../lib/palette"
import { STATION_MID_ZOOM, STATION_NEAR_ZOOM, installStationIcons, stationIconImage } from "./stationIcons"

export const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] }

const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/positron"
const DARK_STYLE = "https://tiles.openfreemap.org/styles/dark"

export function mapStyle(theme: Theme): string {
  return theme === "dark" ? DARK_STYLE : LIGHT_STYLE
}

function parkingIcon(): ImageData {
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d")
  if (!context) return new ImageData(size, size)
  context.clearRect(0, 0, size, size)
  context.strokeStyle = cssColor("--text-secondary")
  context.lineWidth = 3
  context.beginPath()
  context.arc(32, 32, 26, 0, Math.PI * 2)
  context.stroke()
  context.lineWidth = 2.4
  context.beginPath()
  context.arc(22, 40, 7, 0, Math.PI * 2)
  context.arc(44, 40, 7, 0, Math.PI * 2)
  context.moveTo(22, 40)
  context.lineTo(30, 24)
  context.lineTo(42, 24)
  context.lineTo(44, 40)
  context.moveTo(30, 24)
  context.lineTo(22, 40)
  context.moveTo(34, 24)
  context.lineTo(30, 18)
  context.stroke()
  return context.getImageData(0, 0, size, size)
}

const MARKER_DIM = 0.4
const PICKED_SIZE = 1.3

function pickedFilter(id: number): ExpressionSpecification {
  return ["all", ["!", ["has", "point_count"]], ["==", ["to-number", ["get", "id"]], id]]
}

function countSize(picked: number): ExpressionSpecification {
  return ["case", ["==", ["to-number", ["get", "id"]], picked], 16, ["==", ["get", "focus"], 1], 14, 12.5]
}

function detailSize(picked: number): ExpressionSpecification {
  return ["case", ["==", ["to-number", ["get", "id"]], picked], 15.5, ["==", ["get", "focus"], 1], 13.5, 12]
}

const pickedToken = new WeakMap<Map, number>()

/** Uveća odabranu stanicu i pusti kratki val oko nje. Vraća funkciju koja je vraća na običnu veličinu. */
function pickStation(map: Map, id: number): () => void {
  const token = (pickedToken.get(map) ?? 0) + 1
  pickedToken.set(map, token)
  if (!map.getLayer("station-picked")) return () => {}
  map.setFilter("station-picked", pickedFilter(id))
  map.setFilter("station-pulse", pickedFilter(id))
  map.setLayoutProperty("station-count", "text-size", countSize(id))
  map.setLayoutProperty("station-detail", "text-size", detailSize(id))
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  if (still) {
    map.setLayoutProperty("station-picked", "icon-size", PICKED_SIZE)
  } else {
    const started = performance.now()
    const frame = (now: number) => {
      if (pickedToken.get(map) !== token || !map.getLayer("station-picked")) return
      const t = Math.min(1, (now - started) / 420)
      const grow = Math.min(1, t / 0.55)
      const back = 1 + 2.2 * (grow - 1) ** 3 + 1.2 * (grow - 1) ** 2
      map.setLayoutProperty("station-picked", "icon-size", 1 + (PICKED_SIZE - 1) * back)
      map.setPaintProperty("station-pulse", "circle-radius", 14 + 22 * t)
      map.setPaintProperty("station-pulse", "circle-stroke-opacity", 0.55 * (1 - t))
      if (t < 1) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }
  return () => {
    if (pickedToken.get(map) !== token || !map.getLayer("station-picked")) return
    map.setFilter("station-picked", pickedFilter(-1))
    map.setFilter("station-pulse", pickedFilter(-1))
    map.setLayoutProperty("station-picked", "icon-size", 1)
    map.setPaintProperty("station-pulse", "circle-stroke-opacity", 0)
    map.setLayoutProperty("station-count", "text-size", countSize(-1))
    map.setLayoutProperty("station-detail", "text-size", detailSize(-1))
  }
}

export function ensureLayers(map: Map): void {
  if (!map.hasImage("parking-icon")) {
    map.addImage("parking-icon", parkingIcon(), { pixelRatio: 2 })
  }
  installStationIcons(map)
  if (map.getSource("lanes")) return
  map.addSource("lanes", { type: "geojson", data: EMPTY })
  map.addSource("route", { type: "geojson", data: EMPTY })
  map.addSource("parking", { type: "geojson", data: EMPTY })
  map.addSource("stations", {
    type: "geojson",
    data: EMPTY,
    cluster: true,
    clusterRadius: 28,
    clusterMaxZoom: 13,
    clusterProperties: {
      bikes: ["+", ["get", "bikes"]],
      best: ["max", ["get", "rank"]],
    },
  })

  map.addLayer({
    id: "lanes",
    type: "line",
    source: "lanes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": cssColor("--lane"),
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 14, 1.2, 17, 2.4],
      "line-opacity": Number(cssColor("--lane-opacity")) || 0.6,
    },
  })
  map.addLayer({
    id: "route-casing",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": cssColor("--route-casing"),
      "line-width": 9,
      "line-opacity": 0.95,
    },
  })
  map.addLayer({
    id: "route",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["match", ["get", "role"], "ride", 2, 1] },
    paint: {
      "line-color": [
        "match",
        ["get", "role"],
        "ride",
        routeColor("ride"),
        "to-dest",
        routeColor("to-dest"),
        "to-pickup",
        routeColor("to-pickup"),
        routeColor("direct"),
      ],
      "line-width": 5,
    },
  })
  map.addLayer({
    id: "parking",
    type: "symbol",
    source: "parking",
    minzoom: 16,
    layout: {
      "icon-image": "parking-icon",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.45, 16, 0.85],
      "icon-allow-overlap": true,
      "text-field": ["step", ["zoom"], "", 15, ["get", "name"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-offset": [0, 1.15],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: {
      "text-color": cssColor("--text"),
      "text-halo-color": cssColor("--surface"),
      "text-halo-width": 1.2,
      "icon-opacity": ["case", ["==", ["get", "dim"], 1], 0.28, 1],
      "text-opacity": ["case", ["==", ["get", "dim"], 1], 0.35, 1],
    },
  })
  const clusterRadius = ["interpolate", ["linear"], ["get", "point_count"], 2, 14, 6, 18, 12, 22] as ExpressionSpecification
  map.addLayer({
    id: "cluster-ring",
    type: "circle",
    source: "stations",
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": ["+", clusterRadius, 4],
      "circle-color": cssColor("--cluster-ring"),
      "circle-opacity": 0,
    },
  })
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stations",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": cssColor("--surface"),
      "circle-radius": clusterRadius,
      "circle-opacity": 1,
      "circle-stroke-color": cssColor("--accent"),
      "circle-stroke-width": 2.5,
    },
  })
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stations",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["to-string", ["get", "bikes"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": 13,
      "text-allow-overlap": true,
    },
    paint: { "text-color": cssColor("--text"), "text-halo-color": cssColor("--surface"), "text-halo-width": 0.6 },
  })
  const single = ["!", ["has", "point_count"]] as ExpressionSpecification
  const textOpacity = ["case", ["==", ["get", "dim"], 1], MARKER_DIM, 1] as ExpressionSpecification
  map.addLayer({
    id: "stations",
    type: "circle",
    source: "stations",
    filter: single,
    paint: {
      "circle-radius": 22,
      "circle-color": cssColor("--surface"),
      "circle-opacity": 0.01,
      "circle-stroke-width": 0,
    },
  })
  map.addLayer({
    id: "station-mark",
    type: "symbol",
    source: "stations",
    filter: single,
    layout: {
      "icon-image": stationIconImage(0),
      "icon-size": 1,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": ["get", "focus"],
    },
    paint: {
      "icon-opacity": ["case", ["==", ["get", "focus"], 1], 0, ["==", ["get", "dim"], 1], MARKER_DIM, 1],
      "icon-opacity-transition": { duration: 150, delay: 0 },
    },
  })
  map.addLayer({
    id: "station-mark-focus",
    type: "symbol",
    source: "stations",
    filter: single,
    layout: {
      "icon-image": stationIconImage(1),
      "icon-size": 1,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": ["get", "focus"],
    },
    paint: {
      "icon-opacity": ["case", ["==", ["get", "focus"], 1], 1, 0],
      "icon-opacity-transition": { duration: 150, delay: 0 },
    },
  })
  map.addLayer({
    id: "station-pulse",
    type: "circle",
    source: "stations",
    filter: pickedFilter(-1),
    paint: {
      "circle-radius": 14,
      "circle-opacity": 0,
      "circle-stroke-color": cssColor("--accent"),
      "circle-stroke-width": 2,
      "circle-stroke-opacity": 0,
    },
  })
  map.addLayer({
    id: "station-picked",
    type: "symbol",
    source: "stations",
    filter: pickedFilter(-1),
    layout: {
      "icon-image": stationIconImage(1),
      "icon-size": 1,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  })
  map.addLayer({
    id: "station-count",
    type: "symbol",
    source: "stations",
    minzoom: STATION_MID_ZOOM,
    maxzoom: STATION_NEAR_ZOOM,
    filter: single,
    layout: {
      "text-field": ["to-string", ["get", "bikes"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": countSize(-1),
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-anchor": "center",
      "text-offset": ["case", ["==", ["get", "maint"], 1], ["literal", [0, -0.32]], ["literal", [0, 0]]],
    },
    paint: {
      "text-color": ["case", ["==", ["to-number", ["get", "bikes"]], 0], cssColor("--text-secondary"), cssColor("--text")],
      "text-halo-color": cssColor("--surface"),
      "text-halo-width": 0.6,
      "text-opacity": textOpacity,
      "text-opacity-transition": { duration: 150, delay: 0 },
    },
  })
  map.addLayer({
    id: "station-detail",
    type: "symbol",
    source: "stations",
    minzoom: STATION_NEAR_ZOOM,
    filter: single,
    layout: {
      "text-field": [
        "format",
        ["to-string", ["get", "bikes"]],
        { "font-scale": 1.05 },
        "\n",
        {},
        ["to-string", ["get", "freeRacks"]],
        { "font-scale": 0.74, "text-color": cssColor("--text-secondary") },
      ],
      "text-font": ["Noto Sans Regular"],
      "text-size": detailSize(-1),
      "text-line-height": 1.15,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-anchor": "center",
      "text-offset": ["case", ["==", ["get", "maint"], 1], ["literal", [0, -0.22]], ["literal", [0, 0]]],
    },
    paint: {
      "text-color": ["case", ["==", ["to-number", ["get", "bikes"]], 0], cssColor("--text-secondary"), cssColor("--text")],
      "text-halo-color": cssColor("--surface"),
      "text-halo-width": 0.5,
      "text-opacity": textOpacity,
      "text-opacity-transition": { duration: 150, delay: 0 },
    },
  })
}

export function setGeo(map: Map, id: string, data: FeatureCollection): void {
  const source = map.getSource(id) as GeoJSONSource | undefined
  source?.setData(data)
}

export function setVisible(map: Map, id: string, visible: boolean): void {
  if (!map.getLayer(id)) return
  map.setLayoutProperty(id, "visibility", visible ? "visible" : "none")
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button")
  element.type = "button"
  element.className = "popup-btn"
  element.textContent = label
  element.addEventListener("click", onClick)
  return element
}

function facts(rows: { label: string; value: string }[]): HTMLElement {
  const list = document.createElement("dl")
  list.className = "popup-facts"
  for (const row of rows) {
    const term = document.createElement("dt")
    term.textContent = row.label
    const value = document.createElement("dd")
    value.textContent = row.value
    list.append(term, value)
  }
  return list
}

export function openStationPopup(
  map: Map,
  station: Station,
  lngLat: LngLatLike,
  actions: { origin: () => void; destination: () => void },
): void {
  const root = document.createElement("div")
  const title = document.createElement("h3")
  title.textContent = station.name
  root.append(title)
  const meta = document.createElement("p")
  meta.textContent = `Stanica ${station.number}`
  root.append(meta)
  root.append(
    facts([
      { label: "Slobodni bicikli", value: String(station.bikes) },
      { label: "Slobodna mjesta", value: String(station.freeRacks) },
      { label: "Stalaka", value: String(station.racks) },
    ]),
  )
  if (station.maintenance) {
    const note = document.createElement("p")
    note.className = "popup-warn"
    note.textContent = "Stanica je označena kao u održavanju."
    root.append(note)
  }
  const row = document.createElement("div")
  row.className = "popup-actions"
  row.append(
    button("Polazište ovdje", actions.origin),
    button("Odredište ovdje", actions.destination),
  )
  root.append(row)
  const release = pickStation(map, station.id)
  const popup = new Popup({ className: "bikebr-popup", maxWidth: "280px", offset: 16 })
    .setLngLat(lngLat)
    .setDOMContent(root)
  popup.on("close", release)
  popup.addTo(map)
}

export function openParkingPopup(
  map: Map,
  parking: Parking,
  lngLat: LngLatLike,
  actions: { destination: () => void; park: () => void },
): void {
  const root = document.createElement("div")
  const title = document.createElement("h3")
  title.textContent = parking.name
  root.append(title)
  root.append(facts(parkingFacts(parking)))
  const row = document.createElement("div")
  row.className = "popup-actions"
  row.append(button("Odredište ovdje", actions.destination), button("Parkiraj ovdje", actions.park))
  root.append(row)
  new Popup({ className: "bikebr-popup", maxWidth: "300px", offset: 18 })
    .setLngLat(lngLat)
    .setDOMContent(root)
    .addTo(map)
}
