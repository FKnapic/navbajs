import { Bike, Footprints, Navigation } from "lucide-react"
import type { TravelMode } from "../types/trip"
import { cn } from "../lib/cn"


const MODES: { id: TravelMode; label: string; hint: string; icon: typeof Bike }[] = [
  { id: "bajs", label: "Vozim Bajs", hint: "Hod, Bajs, hod", icon: Bike },
  { id: "bajs-riding", label: "Već vozim Bajs", hint: "Već ste na biciklu", icon: Navigation },
  { id: "own-bike", label: "Vozim svoj bicikl", hint: "Do parkirališta", icon: Bike },
  { id: "walk", label: "Pješice", hint: "Samo hod", icon: Footprints },
]

export function ModeSwitch({ mode, onChange }: { mode: TravelMode; onChange: (mode: TravelMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Način vožnje" className="grid grid-cols-2 gap-2">
      {MODES.map((item) => {
        const selected = mode === item.id
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(item.id)}
            className="mode-option"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium leading-tight">
              <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
              {item.label}
            </span>
            <span className={cn("mt-0.5 block text-[11px]", selected ? "text-current opacity-80" : "text-muted")}>
              {item.hint}
            </span>
          </button>
        )
      })}
    </div>
  )
}
