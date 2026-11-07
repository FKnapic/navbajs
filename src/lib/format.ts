const kmFormat = new Intl.NumberFormat("hr-HR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const timeFormat = new Intl.DateTimeFormat("hr-HR", {
  hour: "2-digit",
  minute: "2-digit",
})

export function formatMinutes(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "—"
  if (meters < 1000) return `${Math.max(0, Math.round(meters))} m`
  return `${kmFormat.format(meters / 1000)} km`
}

export function formatClock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return timeFormat.format(date)
}
