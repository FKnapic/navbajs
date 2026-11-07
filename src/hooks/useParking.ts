import { useEffect, useState } from "react"
import { loadParking } from "../api/parking"
import type { Parking } from "../types/parking"

export function useParking() {
  const [parkings, setParkings] = useState<Parking[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [warning, setWarning] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    void loadParking().then((result) => {
      if (cancel) return
      setParkings(result.parkings)
      setWarning(result.warning)
      setStatus(result.parkings.length ? "ready" : "error")
    })
    return () => {
      cancel = true
    }
  }, [])

  return { parkings, status, warning }
}
