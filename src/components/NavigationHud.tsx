import { useEffect } from "react"
import {
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  ExternalLink,
  LocateFixed,
  MapPin,
  RotateCw,
  X,
} from "lucide-react"
import { formatDistance, formatMinutes } from "../lib/format"
import { openBajsApp } from "../lib/bajsApp"
import type { NavSnapshot } from "../hooks/useNavigation"
import type { SegmentRole, TripPlan } from "../types/trip"

function phaseLabel(role: SegmentRole | null): string {
  if (role === "to-pickup") return "Hod do stanice"
  if (role === "ride") return "Vožnja"
  if (role === "to-dest") return "Hod do cilja"
  return "Pješice"
}

function phrase(instruction: string, meters: number | null, arrived: boolean): { title: string; street: string | null } {
  if (arrived) return { title: "Odredište je tu", street: null }
  const distance = meters == null ? null : formatDistance(Math.max(0, meters))
  const direction = /desno/i.test(instruction) ? "desno" : /lijevo/i.test(instruction) ? "lijevo" : /ravno|nastavite/i.test(instruction) ? "ravno" : ""
  const street = instruction.match(/\bna\s+(.+)$/i)?.[1]?.replace(/\.$/, "") ?? null
  const title = distance ? `Za ${distance}${direction ? ` ${direction}` : ""}` : instruction
  return { title, street }
}

function ManeuverIcon({ text }: { text: string }) {
  const props = { size: 22, strokeWidth: 1.75, "aria-hidden": true as const }
  if (/desno/i.test(text)) return <CornerUpRight {...props} />
  if (/lijevo/i.test(text)) return <CornerUpLeft {...props} />
  if (/polukruž|natrag/i.test(text)) return <RotateCw {...props} />
  if (/stigli|odredište|cilj/i.test(text)) return <MapPin {...props} />
  return <ArrowUp {...props} />
}

export function NavigationHud({
  plan,
  nav,
  follow,
  onFollow,
  onStop,
}: {
  plan: TripPlan
  nav: NavSnapshot
  follow: boolean
  onFollow: () => void
  onStop: () => void
}) {
  const spoken = phrase(nav.instruction, nav.distanceToManeuverM, nav.arrived)
  const showBajs = plan.mode === "bajs" && nav.activeRole === "to-pickup"
  const showLock =
    plan.lockReminder &&
    (nav.arrived || nav.activeRole === "to-dest" || (plan.noParking && nav.activeRole === "ride" && (nav.remainingM ?? 999) < 180))

  useEffect(() => {
    document.documentElement.style.setProperty("--sheet-h", "4.75rem")
    return () => document.documentElement.style.setProperty("--sheet-h", "0px")
  }, [])

  return (
    <>
      <div className="absolute left-3 right-3 top-[max(12px,env(safe-area-inset-top))] z-30 mx-auto w-[min(92vw,420px)]">
        <section className="panel rounded-3xl border border-line px-4 py-4" aria-live="polite">
          <div className="flex items-start gap-3">
            <ManeuverIcon text={nav.arrived ? "cilj" : nav.instruction} />
            <div className="min-w-0">
              <p className="wordmark text-[1.65rem] leading-none">{spoken.title}</p>
              {spoken.street && <p className="mt-1 truncate text-sm text-muted">{spoken.street}</p>}
            </div>
          </div>
          {nav.activeRole && <p className="nav-chip mt-3">{phaseLabel(nav.activeRole)}</p>}
          {nav.error && <p className="mt-2 text-sm text-danger">{nav.error}</p>}
          {showBajs && (
            <button type="button" className="btn btn-quiet mt-3 w-full" onClick={() => openBajsApp()}>
              <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
              Otvori Bajs
            </button>
          )}
          {showLock && <p className="mt-3 text-sm">Zaključaj okvir, ne samo kotač.</p>}
        </section>
      </div>

      {!follow && (
        <button
          type="button"
          onClick={onFollow}
          className="chrome-btn absolute bottom-[calc(var(--sheet-h,4.75rem)+12px)] right-3 z-30 min-h-11"
        >
          <LocateFixed size={16} strokeWidth={1.75} aria-hidden="true" />
          Prati me
        </button>
      )}

      <div className="panel absolute inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <p className="min-w-0 flex-1 text-sm">
          {nav.remainingS != null ? formatMinutes(nav.remainingS) : "—"}
          {nav.remainingM != null ? ` · ${formatDistance(nav.remainingM)}` : ""}
        </p>
        <button type="button" onClick={onStop} className="btn btn-danger min-h-11">
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
          Završi
        </button>
      </div>
    </>
  )
}
