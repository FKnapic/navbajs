import type { Map } from "maplibre-gl"
import type { Theme } from "../hooks/useTheme"
import { cssColor } from "../lib/palette"

function paint(map: Map, id: string, property: "background-color" | "fill-color" | "line-color" | "text-color", token: string): void {
  const value = cssColor(token)
  if (value && map.getLayer(id)) map.setPaintProperty(id, property, value)
}

/** Utišava podlogu: svjetlije ceste, blaga voda, bez brojeva cesta i reljefa. */
export function tuneBasemap(map: Map, theme: Theme): void {
  for (const layer of map.getStyle().layers) {
    if (/shield/i.test(layer.id) && map.getLayer(layer.id)) {
      map.setLayoutProperty(layer.id, "visibility", "none")
    }
    if (layer.type === "hillshade" && map.getLayer(layer.id)) {
      map.setPaintProperty(layer.id, "hillshade-exaggeration", 0.25)
    }
    const source = "source" in layer ? String(layer.source ?? "") : ""
    if (layer.type === "raster" && /shade|hill|ne2/i.test(`${layer.id} ${source}`) && map.getLayer(layer.id)) {
      map.setPaintProperty(layer.id, "raster-opacity", 0.25)
    }
  }

  paint(map, "background", "background-color", "--map-bg")
  paint(map, "water", "fill-color", "--map-water")
  paint(map, "park", "fill-color", "--map-park")
  paint(map, "landuse_park", "fill-color", "--map-park")
  paint(map, "building", "fill-color", "--map-building")
  paint(map, "landcover_wood", "fill-color", "--map-wood")
  paint(map, "landuse_residential", "fill-color", "--map-residential")
  for (const id of ["highway_minor", "highway_path", "tunnel_motorway_inner"]) {
    paint(map, id, "line-color", "--map-road")
  }
  for (const id of ["highway_major_inner", "highway_major_subtle", "highway_motorway_inner", "highway_motorway_subtle", "highway_motorway_bridge_inner"]) {
    paint(map, id, "line-color", "--map-road-major")
  }
  for (const id of ["highway_major_casing", "highway_motorway_casing", "highway_motorway_bridge_casing", "tunnel_motorway_casing"]) {
    paint(map, id, "line-color", "--map-road-casing")
  }

  for (const id of ["label_other", "place_suburb", "place_other"]) {
    if (!map.getLayer(id)) continue
    map.setLayerZoomRange(id, 13, 24)
    paint(map, id, "text-color", "--map-label")
    if (map.getLayer(id)) {
      map.setPaintProperty(id, "text-halo-color", cssColor("--map-label-halo"))
      map.setPaintProperty(id, "text-halo-width", 1.2)
    }
    map.setLayoutProperty(id, "text-size", ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 12])
  }

  void theme
}
