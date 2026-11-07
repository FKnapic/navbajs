import { useEffect, useState } from "react"
import { buildLaneIndex, loadLanes, type LaneIndex } from "../api/lanes"
import type { FeatureCollection } from "geojson"

export function useLanes() {
  const [collection, setCollection] = useState<FeatureCollection | null>(null)
  const [index, setIndex] = useState<LaneIndex | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [warning, setWarning] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    const start = () => {
      if (cancel) return
      void loadLanes().then((result) => {
        if (cancel) return
        setCollection(result.collection)
        setWarning(result.warning)
        setStatus(result.collection ? "ready" : "error")
        if (result.collection) {
          const build = () => {
            if (!cancel) setIndex(buildLaneIndex(result.collection!))
          }
          if (window.requestIdleCallback) window.requestIdleCallback(build, { timeout: 1500 })
          else window.setTimeout(build, 0)
        }
      })
    }
    if (window.requestIdleCallback) {
      const idle = window.requestIdleCallback(start, { timeout: 2000 })
      return () => {
        cancel = true
        window.cancelIdleCallback(idle)
      }
    }
    const timer = window.setTimeout(start, 700)
    return () => {
      cancel = true
      window.clearTimeout(timer)
    }
  }, [])

  return { collection, index, status, warning }
}
