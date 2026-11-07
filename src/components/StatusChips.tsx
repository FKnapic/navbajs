import { useEffect, useState } from "react"

export function StatusChips({
  updatedAt,
  stationsError,
  onRetry,
}: {
  updatedAt: string | null
  stationsError: string | null
  onRetry: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [])

  if (stationsError) {
    return (
      <div className="map-status pointer-events-none absolute z-10">
        <button type="button" onClick={onRetry} className="btn btn-danger pointer-events-auto min-h-11 rounded-full px-3 text-left text-xs">
          {stationsError} Pokušaj ponovo.
        </button>
      </div>
    )
  }

  if (!updatedAt) return null
  const age = Math.round((now - Date.parse(updatedAt)) / 1000)
  if (!Number.isFinite(age) || age < 180) return null
  const minutes = Math.max(1, Math.round(age / 60))

  return (
    <div className="map-status pointer-events-none absolute z-10">
      <button type="button" onClick={onRetry} className="btn btn-quiet pointer-events-auto min-h-11 rounded-full px-3 text-left text-xs">
        Podaci o stanicama nisu svježi (prije {minutes} min). Brojevi bicikala možda više ne vrijede. Pokušaj ponovo.
      </button>
    </div>
  )
}
