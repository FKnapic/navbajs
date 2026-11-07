import { useCallback, useEffect, useState } from "react"
import { fetchStations } from "../api/bajs"
import type { Station } from "../types/station"

const POLL_MS = 40_000

export function useStations() {
  const [stations, setStations] = useState<Station[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (force: boolean) => {
    try {
      const data = await fetchStations(force)
      setStations(data.stations)
      setUpdatedAt(data.fetchedAt)
      setStatus("ready")
      setError(data.stations.length ? null : "Nema aktivnih Bajs stanica u odgovoru.")
    } catch {
      setStatus((current) => (current === "ready" ? "ready" : "error"))
      setError("Stanice Bajsa trenutačno nisu dostupne.")
    }
  }, [])

  useEffect(() => {
    let cancel = false
    const run = (force: boolean) => {
      if (!cancel) void load(force)
    }
    run(false)
    const timer = window.setInterval(() => run(true), POLL_MS)
    const onOffline = () => setError("Nema internetske veze. Stanice uživo trenutačno nisu dostupne.")
    if (!navigator.onLine) onOffline()
    window.addEventListener("offline", onOffline)
    return () => {
      cancel = true
      window.clearInterval(timer)
      window.removeEventListener("offline", onOffline)
    }
  }, [load])

  return { stations, status, updatedAt, error, reload: () => load(true) }
}
