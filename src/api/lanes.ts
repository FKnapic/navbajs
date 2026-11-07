import type { Feature, FeatureCollection, LineString, MultiLineString, Position } from "geojson"

export async function loadLanes(): Promise<{ collection: FeatureCollection | null; warning: string | null }> {
  try {
    const response = await fetch("/data/lanes.geojson")
    if (!response.ok) throw new Error(String(response.status))
    const collection = (await response.json()) as FeatureCollection
    if (collection.type !== "FeatureCollection") throw new Error("neispravan geojson")
    return { collection, warning: null }
  } catch {
    return {
      collection: null,
      warning: "Biciklističke staze Grada Zagreba nisu učitane. Rute i dalje rade, ali udio staza nije izračunat.",
    }
  }
}

export interface LaneIndex {
  cell: number
  cells: Map<string, number[]>
  lines: Position[][]
}

function lineParts(feature: Feature): Position[][] {
  const geometry = feature.geometry
  if (!geometry) return []
  if (geometry.type === "LineString") return [(geometry as LineString).coordinates]
  if (geometry.type === "MultiLineString") return (geometry as MultiLineString).coordinates
  return []
}

export function buildLaneIndex(collection: FeatureCollection): LaneIndex {
  const cell = 0.003
  const cells = new Map<string, number[]>()
  const lines: Position[][] = []
  const push = (key: string, index: number) => {
    const list = cells.get(key)
    if (list) {
      if (list[list.length - 1] !== index) list.push(index)
    } else {
      cells.set(key, [index])
    }
  }
  for (const feature of collection.features) {
    for (const line of lineParts(feature)) {
      if (line.length < 2) continue
      const index = lines.length
      lines.push(line)
      let minLng = Infinity
      let maxLng = -Infinity
      let minLat = Infinity
      let maxLat = -Infinity
      for (const position of line) {
        minLng = Math.min(minLng, position[0])
        maxLng = Math.max(maxLng, position[0])
        minLat = Math.min(minLat, position[1])
        maxLat = Math.max(maxLat, position[1])
      }
      for (let x = Math.floor(minLng / cell); x <= Math.floor(maxLng / cell); x += 1) {
        for (let y = Math.floor(minLat / cell); y <= Math.floor(maxLat / cell); y += 1) {
          push(`${x}:${y}`, index)
        }
      }
    }
  }
  return { cell, cells, lines }
}
