import { ChevronDown, ExternalLink, Lock, Navigation } from "lucide-react"
import { formatDistance, formatMinutes } from "../lib/format"
import { openBajsApp } from "../lib/bajsApp"
import { parkingFacts } from "../api/parking"
import type { Parking } from "../types/parking"
import type { SegmentRole, TripPlan } from "../types/trip"

const ROLE_COLOR: Record<SegmentRole, string> = {
  "to-pickup": "var(--route-walk)",
  ride: "var(--route-ride)",
  "to-dest": "var(--route-dest)",
  direct: "var(--route-walk)",
}

interface RoutePanelProps {
  plan: TripPlan
  lanePct: number | null
  parkings: Parking[]
  viewWalk: boolean
  canReturnToBike: boolean
  planning: boolean
  onStart: () => void
  onShowWalk: () => void
  onShowBike: () => void
  onChooseParking: (id: string) => void
}

export function RoutePanel(props: RoutePanelProps) {
  const { plan } = props
  const selectedParking = plan.parking
    ? props.parkings.find((parking) => parking.id === String(plan.parking?.id))
    : undefined
  const usesBajs = plan.mode === "bajs" || plan.mode === "bajs-riding"

  return (
    <div className="space-y-4">
      <div>
        <p className="font-display text-[2.6rem] leading-none tracking-tight tabular-nums">{formatMinutes(plan.totalDurationS)}</p>
        <p className="mt-1 text-sm text-muted">{formatDistance(plan.totalDistanceM)} ukupno</p>
        {plan.penaltyNote && <p className="mt-1 text-sm">{plan.penaltyNote}</p>}
        {props.lanePct != null && plan.bikeDurationS > 0 && (
          <p className="mt-1 text-sm">
            Na službenim stazama: <strong>{Math.round(props.lanePct)}%</strong> vožnje
            <span className="mt-0.5 block text-xs text-muted">
              Procjena prema udaljenosti od staza Grada Zagreba (oko 20 m).
            </span>
          </p>
        )}
      </div>

      {plan.warnings.map((warning) => (
        <p key={warning} role="status" className="note">
          {warning}
        </p>
      ))}

      {plan.walkAlternative && !props.viewWalk && (
        <button
          type="button"
          onClick={props.onShowWalk}
          className="btn btn-quiet w-full justify-start text-left"
        >
          Pješice je brže ({formatMinutes(plan.walkAlternative.totalDurationS)}). Prikaži pješačku rutu.
        </button>
      )}
      {props.viewWalk && props.canReturnToBike && (
        <button
          type="button"
          onClick={props.onShowBike}
          className="btn btn-quiet w-full justify-start text-left"
        >
          Vrati rutu biciklom
        </button>
      )}

      <ol className="space-y-2">
        {plan.segments.map((segment, index) => (
          <li key={`${segment.role}-${index}`} className="border-t border-line py-3 first:border-t-0 first:pt-0">
            <div className="flex items-start gap-2">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: ROLE_COLOR[segment.role] }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{segment.title}</p>
                <p className="truncate text-sm text-muted">
                  {segment.fromLabel} → {segment.toLabel}
                </p>
                <p className="text-sm">
                  {formatMinutes(segment.durationS)} · {formatDistance(segment.distanceM)}
                </p>
                <details className="disclosure mt-1" open={index === 0}>
                  <summary className="text-sm font-bold">
                    <ChevronDown size={15} strokeWidth={1.75} className="chev" aria-hidden="true" />
                    Koraci ({segment.steps.length})
                  </summary>
                  <ol className="mt-2 space-y-1.5 text-sm">
                    {segment.steps.map((step, stepIndex) => (
                      <li key={`${step.alongM}-${stepIndex}`} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 text-pretty">{step.instruction}</span>
                        <span className="shrink-0 tabular-nums text-muted">
                          {formatDistance(step.distanceM)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {selectedParking && (
        <section className="note-calm" aria-label="Odabrano parkiralište">
          <h3 className="font-bold">Parkiraj ovdje</h3>
          <p>{selectedParking.name}</p>
          <p className="text-sm">
            {formatDistance(plan.segments.find((segment) => segment.role === "to-dest")?.distanceM ?? 0)} pješice do cilja
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {parkingFacts(selectedParking).map((fact) => (
              <div key={fact.label} className="contents">
                <dt className="text-muted">{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {plan.parkingChoices.length > 1 && (
        <fieldset>
          <legend className="mb-1 text-sm font-bold">Druga parkirališta</legend>
          <div className="space-y-1">
            {plan.parkingChoices.map((choice) => {
              const selected = choice.parkingId === plan.parking?.id
              return (
                <button
                  key={choice.parkingId}
                  type="button"
                  aria-pressed={selected}
                  disabled={props.planning || selected}
                  onClick={() => props.onChooseParking(choice.parkingId)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-line py-2 text-left text-sm last:border-b-0 disabled:opacity-60"
                >
                  <span>
                    {choice.name}
                    <span className="block text-xs text-muted">
                      {formatDistance(choice.walkM)} do cilja
                    </span>
                  </span>
                  <span>{formatMinutes(choice.totalS)}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {plan.lockReminder && (
        <p role="status" className="note-calm flex gap-2">
          <Lock size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>Na kraju rute zaključajte bicikl. Vežite okvir, ne samo kotač, uz stalak ili stup.</span>
        </p>
      )}

      <button
        type="button"
        onClick={props.onStart}
        className="btn btn-primary w-full"
      >
        <Navigation size={16} strokeWidth={1.75} aria-hidden="true" />
        Kreni
      </button>
      {usesBajs && (
        <button type="button" onClick={openBajsApp} className="btn btn-quiet w-full">
          <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
          Otvori Bajs aplikaciju
        </button>
      )}
    </div>
  )
}
