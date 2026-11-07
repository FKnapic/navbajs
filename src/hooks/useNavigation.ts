import { useEffect, useRef, useState } from "react"
import { geoErrorMessage, toFix } from "../lib/geolocation"
import { haversineM, projectToLine } from "../lib/geo"
import type { GeoFix, LatLng } from "../types/places"
import type { Segment, SegmentRole } from "../types/trip"

export interface NavSnapshot {
  fix: GeoFix | null
  error: string | null
  instruction: string
  distanceToManeuverM: number | null
  remainingS: number | null
  remainingM: number | null
  activeRole: SegmentRole | null
  arrived: boolean
}

const EMPTY: NavSnapshot = {
  fix: null,
  error: null,
  instruction: "Krećem…",
  distanceToManeuverM: null,
  remainingS: null,
  remainingM: null,
  activeRole: null,
  arrived: false,
}

function threshold(role: SegmentRole | null): number {
  return role === "ride" ? 70 : 55
}

export function useNavigation(options: {
  enabled: boolean
  segments: Segment[]
  destination: LatLng | null
  pickupPenaltyS: number
  dropoffPenaltyS: number
  onOffRoute: (fix: GeoFix) => void
}): NavSnapshot {
  const [snapshot, setSnapshot] = useState<NavSnapshot>(EMPTY)
  const optionsRef = useRef(options)
  optionsRef.current = options
  const offRouteAt = useRef(0)
  const streak = useRef(0)
  const startedAt = useRef(0)

  useEffect(() => {
    if (!options.enabled) {
      setSnapshot(EMPTY)
      return
    }
    if (!navigator.geolocation) {
      setSnapshot({ ...EMPTY, error: "Ovaj preglednik ne podržava geolokaciju." })
      return
    }
    startedAt.current = Date.now()
    streak.current = 0
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        const fix = toFix(position)
        const current = optionsRef.current
        const segments = current.segments
        if (!segments.length || !current.destination) {
          setSnapshot((prev) => ({ ...prev, fix }))
          return
        }
        let bestIndex = 0
        let best = projectToLine(segments[0].geometry.coordinates as [number, number][], fix.lng, fix.lat)
        for (let index = 1; index < segments.length; index += 1) {
          const projection = projectToLine(
            segments[index].geometry.coordinates as [number, number][],
            fix.lng,
            fix.lat,
          )
          if (projection.distM < best.distM) {
            best = projection
            bestIndex = index
          }
        }
        const segment = segments[bestIndex]
        const role = segment.role
        const progress = Math.min(best.alongM, best.totalM)
        const steps = segment.steps
        let currentStep = 0
        for (let index = 0; index < steps.length; index += 1) {
          if (steps[index].alongM <= progress + 12) currentStep = index
        }
        const upcoming = steps[currentStep + 1]
        const distanceToUpcoming = upcoming ? upcoming.alongM - progress : best.totalM - progress
        const showUpcoming = upcoming != null && distanceToUpcoming <= 45
        const instruction = showUpcoming ? upcoming.instruction : (steps[currentStep]?.instruction ?? segment.title)
        const distanceToManeuverM = Math.max(0, showUpcoming ? distanceToUpcoming : distanceToUpcoming)
        const fraction = best.totalM > 0 ? Math.min(1, Math.max(0, (best.totalM - progress) / best.totalM)) : 0
        const after = segments.slice(bestIndex + 1).reduce((total, item) => total + item.durationS, 0)
        const penalties =
          role === "to-pickup"
            ? current.pickupPenaltyS + current.dropoffPenaltyS
            : role === "ride"
              ? current.dropoffPenaltyS
              : 0
        const remainingS = segment.durationS * fraction + after + penalties
        const remainingGeometry = best.totalM - progress
        const remainingAfter = segments
          .slice(bestIndex + 1)
          .reduce((total, item) => total + item.distanceM, 0)
        const distDest = haversineM(fix, current.destination)
        const onLast = bestIndex === segments.length - 1
        const arrived = onLast && (distDest < 35 || (best.totalM - progress < 35 && best.distM < 45))
        const accuracy = fix.accuracy ?? 30
        const offRoute =
          !arrived &&
          accuracy <= 50 &&
          best.distM > threshold(role) &&
          Date.now() - startedAt.current > 5000
        if (offRoute) {
          streak.current += 1
          if (streak.current >= 3 && Date.now() - offRouteAt.current > 20_000) {
            offRouteAt.current = Date.now()
            streak.current = 0
            current.onOffRoute(fix)
          }
        } else {
          streak.current = 0
        }
        setSnapshot({
          fix,
          error: null,
          instruction,
          distanceToManeuverM,
          remainingS: arrived ? 0 : remainingS,
          remainingM: arrived ? 0 : remainingGeometry + remainingAfter,
          activeRole: role,
          arrived,
        })
      },
      (error) => {
        setSnapshot((prev) => ({ ...prev, error: geoErrorMessage(error) }))
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [options.enabled, options.segments])

  return snapshot
}
