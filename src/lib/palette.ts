import type { SegmentRole } from "../types/trip"

/** Čita token iz CSS-a. MapLibre ne razumije var(), pa se boja razriješi ovdje. */
export function cssColor(name: string): string {
  if (typeof document === "undefined") return ""
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function stationFill(bikes: number): string {
  if (bikes > 3) return cssColor("--st-many")
  if (bikes > 0) return cssColor("--st-few")
  return cssColor("--st-none")
}

export function routeColor(role: SegmentRole): string {
  if (role === "ride") return cssColor("--route-ride")
  if (role === "to-dest") return cssColor("--route-dest")
  return cssColor("--route-walk")
}
