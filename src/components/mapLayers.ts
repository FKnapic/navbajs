import type { FeatureCollection } from "geojson"
import { GeoJSONSource, Map, Popup, type ExpressionSpecification, type LngLatLike } from "maplibre-gl"
import { parkingFacts } from "../api/parking"
import type { Parking } from "../types/parking"
import type { Station } from "../types/station"
import type { Theme } from "../hooks/useTheme"
import { cssColor, routeColor } from "../lib/palette"

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
  context.strokeStyle = cssColor("--accent")
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

function wrenchIcon(): ImageData {
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d")
  if (!context) return new ImageData(size, size)
  context.strokeStyle = cssColor("--text")
  context.lineWidth = 6
  context.lineCap = "round"
  context.beginPath()
  context.arc(46, 16, 8, 0.4, Math.PI * 1.7)
  context.moveTo(40, 22)
  context.lineTo(18, 46)
  context.moveTo(14, 42)
  context.lineTo(22, 50)
  context.stroke()
  return context.getImageData(0, 0, size, size)
}

export function ensureLayers(map: Map): void {
  if (!map.hasImage("parking-icon")) {
    map.addImage("parking-icon", parkingIcon(), { pixelRatio: 2 })
  }
  if (!map.hasImage("wrench")) {
    map.addImage("wrench", wrenchIcon(), { pixelRatio: 2 })
  }
  if (map.getSource("lanes")) return
  map.addSource("lanes", { type: "geojson", data: EMPTY })
  map.addSource("route", { type: "geojson", data: EMPTY })
  map.addSource("parking", { type: "geojson", data: EMPTY })
  map.addSource("stations", {
    type: "geojson",
    data: EMPTY,
    cluster: true,
    clusterRadius: 120,
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
    minzoom: 14,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": cssColor("--accent"),
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1.2, 17, 2.4],
      "line-opacity": 0.6,
    },
  })
  map.addLayer({
    id: "route-casing",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": cssColor("--surface"),
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 7, 16, 12],
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
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 4, 16, 7],
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
  const clusterRadius = ["interpolate", ["linear"], ["get", "point_count"], 2, 18, 20, 28] as ExpressionSpecification
  const bestStroke = [
    "case",
    [">=", ["to-number", ["get", "best"]], 3],
    cssColor("--st-many"),
    [">=", ["to-number", ["get", "best"]], 2],
    cssColor("--st-few"),
    cssColor("--st-none"),
  ] as ExpressionSpecification
  map.addLayer({
    id: "cluster-ring",
    type: "circle",
    source: "stations",
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": ["+", clusterRadius, 4],
      "circle-color": cssColor("--cluster-ring"),
      "circle-opacity": 1,
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
      "circle-stroke-color": bestStroke,
      "circle-stroke-width": 3,
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
    paint: { "text-color": cssColor("--text") },
  })
  map.addLayer({
    id: "stations",
    type: "circle",
    source: "stations",
    minzoom: 14,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["case", ["==", ["get", "focus"], 1], 18, 14],
      "circle-color": [
        "case",
        [">", ["to-number", ["get", "bikes"]], 3],
        cssColor("--st-many"),
        [">", ["to-number", ["get", "bikes"]], 0],
        cssColor("--st-few"),
        cssColor("--st-none"),
      ],
      "circle-opacity": ["case", ["==", ["get", "dim"], 1], 0.22, 1],
      "circle-stroke-color": [
        "case",
        ["==", ["get", "focus"], 1],
        cssColor("--text"),
        ["==", ["get", "maint"], 1],
        cssColor("--st-maint"),
        cssColor("--marker-ring"),
      ],
      "circle-stroke-width": ["case", ["==", ["get", "focus"], 1], 3, 2],
    },
  })
  map.addLayer({
    id: "station-count",
    type: "symbol",
    source: "stations",
    minzoom: 14,
    filter: ["all", ["!", ["has", "point_count"]], ["!=", ["get", "maint"], 1]],
    layout: {
      "text-field": ["to-string", ["get", "bikes"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": cssColor("--text"),
      "text-opacity": ["case", ["==", ["get", "dim"], 1], 0.25, 1],
    },
  })
  map.addLayer({
    id: "station-tool",
    type: "symbol",
    source: "stations",
    minzoom: 14,
    filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "maint"], 1]],
    layout: {
      "icon-image": "wrench",
      "icon-size": 0.42,
      "icon-allow-overlap": true,
    },
    paint: {
      "icon-opacity": ["case", ["==", ["get", "dim"], 1], 0.25, 1],
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
  new Popup({ className: "bikebr-popup", maxWidth: "280px", offset: 16 })
    .setLngLat(lngLat)
    .setDOMContent(root)
    .addTo(map)
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
