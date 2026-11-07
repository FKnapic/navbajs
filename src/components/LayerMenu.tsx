import { useEffect, useId, useRef, useState } from "react"
import { SlidersHorizontal } from "lucide-react"

interface LayerMenuProps {
  showStations: boolean
  showParking: boolean
  showLanes: boolean
  onStations: (value: boolean) => void
  onParking: (value: boolean) => void
  onLanes: (value: boolean) => void
  canInstall: boolean
  onInstall: () => void
}

const SWATCHES = [
  { color: "var(--st-many)", label: "Više od 3 bicikla" },
  { color: "var(--st-few)", label: "1 do 3 bicikla" },
  { color: "var(--st-none)", label: "Nema bicikla" },
  { color: "var(--st-maint)", label: "Održavanje" },
]

export function LayerMenu(props: LayerMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={titleId}
        aria-label="Filtar"
        onClick={() => setOpen((value) => !value)}
        className="map-fab"
      >
        <SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={titleId}
          role="dialog"
          aria-label="Filtar karte"
          className="menu-panel absolute right-12 top-0 z-40 w-72 rounded-2xl border border-line bg-sand p-4 text-sm shadow-[var(--shadow-card)]"
        >
          <p className="kicker">Na karti</p>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="accent-pine" checked={props.showStations} onChange={(event) => props.onStations(event.target.checked)} />
            Stanice Bajs
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="accent-pine" checked={props.showParking} onChange={(event) => props.onParking(event.target.checked)} />
            Parkirališta za bicikle
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="accent-pine" checked={props.showLanes} onChange={(event) => props.onLanes(event.target.checked)} />
            Biciklističke staze
          </label>
          <p className="mt-2 text-xs leading-relaxed text-muted">Parkirališta i staze pojavljuju se pri bližem prikazu.</p>
          <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs text-muted" aria-label="Boje stanica">
            {SWATCHES.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
          {props.canInstall && (
            <button type="button" onClick={props.onInstall} className="btn btn-primary mt-3 w-full">
              Instaliraj aplikaciju
            </button>
          )}
        </div>
      )}
    </div>
  )
}
