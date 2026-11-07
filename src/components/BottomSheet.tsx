import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Bike,
  Briefcase,
  Clock,
  Footprints,
  Home,
  MapPin,
  Navigation,
  Search,
} from "lucide-react"
import { geocode } from "../api/geocode"
import { searchPlaces } from "../data/zagrebPlaces"
import { fold } from "../lib/addressQuery"
import { readableName } from "../lib/readableName"
import { ROUTE_UNAVAILABLE, SEARCH_UNAVAILABLE } from "../lib/messages"
import type { TripController, PlanSlot } from "../hooks/useTripState"
import { LogoMark, Wordmark } from "./LogoMark"
import { haversineM, ZAGREB_CENTER } from "../lib/geo"
import { nearestStation, walkMinutes } from "../lib/nearestStation"
import { formatDistance, formatMinutes } from "../lib/format"
import { cn } from "../lib/cn"
import type { Place } from "../types/places"
import type { Station } from "../types/station"
import type { TripPlan } from "../types/trip"

type Snap = "peek" | "half" | "full"


function countLabel(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} ${few}`
  return `${count} ${many}`
}

function bikesLabel(count: number): string {
  return countLabel(count, "bicikl", "bicikla", "bicikala")
}

function racksLabel(count: number): string {
  return countLabel(count, "slobodno mjesto", "slobodna mjesta", "slobodnih mjesta")
}

function shortReason(message: string): string {
  const text = message.toLowerCase()
  if (text.includes("dostupnim biciklom")) return "Nema slobodnih bicikala"
  if (text.includes("slobodnim mjestom") || text.includes("slobodno mjesto")) return "Nema slobodnih mjesta"
  if (text.includes("povezati stanice")) return "Ruta između stanica nije dostupna"
  if (text.includes("parkirališta su pronađena")) return "Nema rute do parkirališta"
  if (text.includes("nije moguće izračunati")) return "Nije izračunato"
  if (text.includes("internetske") || text.includes("nije dostupan")) return "Nema veze"
  return message
}

function splitWarnings(warnings: string[]): { bar: string[]; rest: string[] } {
  const bar: string[] = []
  const rest: string[] = []
  for (const warning of warnings) {
    if (/održavanju|30 minuta|300 m|600 m|parkirališt|izvan okvira/i.test(warning)) bar.push(warning)
    else rest.push(warning)
  }
  return { bar, rest }
}

function moveLabel(role: TripPlan["segments"][number]["role"]): string {
  if (role === "ride") return "Vožnja"
  if (role === "direct") return "Pješice"
  return "Hod"
}

function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 960px)").matches)
  useEffect(() => {
    const query = window.matchMedia("(min-width: 960px)")
    const onChange = () => setDesktop(query.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])
  return desktop
}

export function BottomSheet({ trip, onFrame }: { trip: TripController; onFrame: (snap: Snap) => void }) {
  const desktop = useDesktop()
  const sheetRef = useRef<HTMLElement>(null)
  const listId = useId()
  const [text, setText] = useState(trip.destination?.label ?? "")
  const [originText, setOriginText] = useState("")
  const [focused, setFocused] = useState<"dest" | "origin" | null>(null)
  const [originOpen, setOriginOpen] = useState(false)
  const [stepsOpen, setStepsOpen] = useState(false)
  const [snap, setSnap] = useState<Snap>("peek")
  const [dragH, setDragH] = useState<number | null>(null)
  const [addresses, setAddresses] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [routeSlow, setRouteSlow] = useState(false)
  const routeWaiting =
    trip.slots.bajs.status === "loading" || trip.slots.own.status === "loading" || trip.slots.walk.status === "loading"
  useEffect(() => {
    if (!routeWaiting) {
      setRouteSlow(false)
      return
    }
    const timer = window.setTimeout(() => setRouteSlow(true), 5_000)
    return () => window.clearTimeout(timer)
  }, [routeWaiting])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchDown, setSearchDown] = useState(false)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [highlight, setHighlight] = useState(-1)
  const highlightRef = useRef(-1)
  const suggestCountRef = useRef(0)
  highlightRef.current = highlight
  const [saveAs, setSaveAs] = useState<"home" | "work" | null>(null)
  const [chipMenu, setChipMenu] = useState<"home" | "work" | null>(null)
  const drag = useRef<{ y: number; h: number } | null>(null)
  const holdTimer = useRef(0)
  const held = useRef(false)
  const request = useRef(0)
  const originInputRef = useRef<HTMLInputElement>(null)
  const biasRef = useRef(trip.origin)
  biasRef.current = trip.origin

  const query = (focused === "origin" ? originText : text).trim()
  const folded = fold(query)
  const showSearch = focused != null || originOpen
  const stage = trip.mapPick ? "pick" : trip.destination && !showSearch ? "result" : showSearch ? "search" : "idle"

  const focusedRef = useRef(focused)
  focusedRef.current = focused
  useEffect(() => {
    if (focusedRef.current === "dest") return
    if (!trip.destination) return
    setText(readableName(trip.destination.label))
  }, [trip.destination])
  useEffect(() => {
    if (focusedRef.current === "origin") return
    if (!trip.origin) return
    setOriginText(readableName(trip.origin.label))
  }, [trip.origin])

  useEffect(() => {
    const next: Snap = trip.mapPick ? "peek" : stepsOpen ? "full" : stage === "idle" ? "peek" : "half"
    setSnap(next)
  }, [trip.mapPick, stepsOpen, stage])

  useEffect(() => {
    onFrame(snap)
  }, [snap, onFrame])

  useEffect(() => {
    setHighlight(-1)
  }, [query])

  useEffect(() => {
    if (highlight < 0) return
    sheetRef.current?.querySelector(`[data-suggest-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" })
  }, [highlight])

  useEffect(() => {
    document.documentElement.classList.toggle("sheet-tall", snap !== "peek")
    return () => document.documentElement.classList.remove("sheet-tall")
  }, [snap])

  useEffect(() => {
    const node = sheetRef.current
    if (!node) return
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--sheet-h", `${Math.round(node.getBoundingClientRect().height)}px`)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const sync = () => {
      const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      document.documentElement.style.setProperty("--kb", `${Math.round(keyboard)}px`)
      document.documentElement.style.setProperty("--vvh", `${Math.round(viewport.height)}px`)
    }
    viewport.addEventListener("resize", sync)
    viewport.addEventListener("scroll", sync)
    sync()
    return () => {
      viewport.removeEventListener("resize", sync)
      viewport.removeEventListener("scroll", sync)
    }
  }, [])

  useEffect(() => {
    const local = searchPlaces(query).map((item) => ({ ...item, source: "search" as const }))
    if (query.length < 3) {
      setAddresses(local)
      setSearchError(null)
      setSearchDown(false)
      setSearching(false)
      return
    }
    const token = ++request.current
    const controller = new AbortController()
    setAddresses(local)
    setSearching(local.length < 3)
    const timer = window.setTimeout(() => {
      void geocode(query, { signal: controller.signal, bias: biasRef.current ?? undefined })
        .then((found) => {
          if (token !== request.current) return
          setAddresses(found.map((item) => ({ ...item, source: "search" as const })))
          setSearchDown(false)
          setSearchError(
            found.length ? null : `Nema rezultata za '${query}'. Provjerite naziv ili odaberite točku na karti.`,
          )
        })
        .catch((error: unknown) => {
          if (token !== request.current || (error instanceof DOMException && error.name === "AbortError")) return
          setAddresses([])
          setSearchDown(true)
          setSearchError(SEARCH_UNAVAILABLE)
        })
        .finally(() => {
          if (token === request.current) setSearching(false)
        })
    }, 160)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, searchAttempt])

  function choose(place: Place) {
    const label = readableName(place.title ?? place.label)
    if (focused === "origin") {
      trip.setOrigin(place)
      setOriginText(label)
    } else {
      if (saveAs) {
        trip.savePlace(saveAs, place)
        setSaveAs(null)
      }
      trip.setDestination(place)
      setText(label)
    }
    setFocused(null)
    setOriginOpen(false)
    setStepsOpen(false)
  }

  function openOriginEditor() {
    setOriginText((current) => current.trim() || (trip.origin ? readableName(trip.origin.label) : ""))
    setFocused("origin")
    setOriginOpen(true)
    window.setTimeout(() => originInputRef.current?.focus(), 0)
  }

  function startMapPick() {
    trip.setMapPick(focused === "origin" ? "origin" : "destination")
    setFocused(null)
    setOriginOpen(false)
  }

  function release(which: "dest" | "origin") {
    window.setTimeout(() => {
      const active = document.activeElement
      if (active instanceof HTMLInputElement) return
      if (active instanceof Element && active.closest("#nav-sheet")) return
      setFocused((current) => (current === which ? null : current))
      if (which === "origin") setOriginOpen(false)
    }, 180)
  }

  function onSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setFocused(null)
      setOriginOpen(false)
      setHighlight(-1)
      event.currentTarget.blur()
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const count = suggestCountRef.current
      if (!count) return
      setHighlight((current) => {
        if (event.key === "ArrowDown") return current < 0 ? 0 : (current + 1) % count
        return current < 0 ? count - 1 : (current - 1 + count) % count
      })
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const current = highlightRef.current
      const button =
        current >= 0
          ? event.currentTarget.closest("#nav-sheet")?.querySelector<HTMLButtonElement>(`[data-suggest-index="${current}"]`)
          : null
      if (button) button.click()
      else submitSearch()
    }
  }

  function editDestination() {
    setText(trip.destination ? readableName(trip.destination.label) : text)
    if (trip.origin) setOriginText(readableName(trip.origin.label))
    setOriginOpen(true)
    setFocused("dest")
    setStepsOpen(false)
  }

  const anchor = trip.origin ?? ZAGREB_CENTER
  const stationHits = trip.stations
    .filter((station) => !folded || fold(station.name).includes(folded))
    .sort((a, b) => haversineM(a, anchor) - haversineM(b, anchor))
    .slice(0, folded ? 6 : 5)

  const saved = [
    trip.book.home ? { label: "Dom", place: trip.book.home, icon: "home" as const } : null,
    trip.book.work ? { label: "Posao", place: trip.book.work, icon: "work" as const } : null,
    ...trip.book.recent
      .filter((place) => place.label !== trip.book.home?.label && place.label !== trip.book.work?.label)
      .slice(0, 4)
      .map((place) => ({ label: place.label, place, icon: "pin" as const })),
  ].filter((item) => item && (!folded || fold(item.label).includes(folded) || fold(item.place.label).includes(folded)))

  const showMine = !folded || fold("moja lokacija").includes(folded)
  let suggestCursor = 0
  const mineIndex = showMine ? suggestCursor++ : -1
  const savedIndex = saved.map((item) => (item ? suggestCursor++ : -1))
  const stationIndex = stationHits.map(() => suggestCursor++)
  const addressIndex = addresses.map(() => suggestCursor++)
  const originIndex = focused !== "origin" ? suggestCursor++ : -1
  const mapIndex = suggestCursor++
  suggestCountRef.current = suggestCursor
  const selectedSlot = trip.slots[trip.selected]
  const plan = selectedSlot.status === "ready" ? selectedSlot.plan : null
  const bajsSlot = trip.slots.bajs
  const walkSlot = trip.slots.walk
  const walkFaster =
    bajsSlot.status === "ready" &&
    walkSlot.status === "ready" &&
    walkSlot.plan.totalDurationS + 30 < bajsSlot.plan.totalDurationS
  const warnings = plan ? splitWarnings(plan.warnings) : { bar: [], rest: [] }
  const failedSlots = (["bajs", "own", "walk"] as const)
    .map((key) => trip.slots[key])
    .filter((slot): slot is Extract<PlanSlot, { status: "error" }> => slot.status === "error")
  const routeProblem =
    failedSlots.length === 3 && failedSlots.every((slot) => slot.message === ROUTE_UNAVAILABLE)
      ? ROUTE_UNAVAILABLE
      : failedSlots.length === 3 && failedSlots.every((slot) => slot.message.includes("internetske"))
        ? failedSlots[0].message
        : null
  const showBrand = !trip.destination && !text.trim() && stage !== "pick"
  const nearest = nearestStation(trip.userFix, trip.stations)
  const shortcuts = [
    trip.book.home ? { kind: "home" as const, label: "Dom", place: trip.book.home } : null,
    trip.book.work ? { kind: "work" as const, label: "Posao", place: trip.book.work } : null,
  ].filter((item) => item != null)
  const recentPlaces = trip.book.recent
    .filter((place) => place.label !== trip.book.home?.label && place.label !== trip.book.work?.label)
    .slice(0, 2)

  function armHold(action: () => void) {
    held.current = false
    window.clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => {
      held.current = true
      action()
    }, 550)
  }

  function endHold() {
    window.clearTimeout(holdTimer.current)
  }

  function submitSearch() {
    const station = stationHits[0]
    const place =
      addresses[0] ??
      (station ? { lat: station.lat, lng: station.lng, label: readableName(station.name), source: "station" as const } : null)
    if (place) choose(place)
  }

  return (
    <>
      {stage === "search" && <div className="map-dim pointer-events-none absolute inset-0 z-20" />}
      <section
        id="nav-sheet"
        ref={sheetRef}
        aria-label="Pretraga i ruta"
        className={cn(
          "panel absolute z-30 flex flex-col rounded-2xl border border-line",
          snap === "peek" ? "overflow-y-auto" : "overflow-hidden",
          "left-3 right-3",
          "min-[960px]:inset-y-3 min-[960px]:left-3 min-[960px]:right-auto min-[960px]:w-[380px]",
          snap === "peek" ? "min-[960px]:bottom-auto min-[960px]:h-auto" : "min-[960px]:h-[calc(100dvh-1.5rem)]",
        )}
        style={
          desktop
            ? undefined
            : {
                bottom: "calc(var(--kb, 0px) + 12px)",
                height:
                  dragH != null
                    ? dragH
                    : snap === "peek" || stage === "result"
                      ? "auto"
                      : snap === "half"
                        ? "min(58%, calc(var(--vvh, 100dvh) - 5.5rem))"
                        : "calc(var(--vvh, 100dvh) - 5.5rem)",
                maxHeight:
                  snap === "peek"
                    ? showBrand
                      ? 284
                      : 228
                    : stage === "result"
                      ? "min(70%, calc(var(--vvh, 100dvh) - 5.5rem))"
                      : "calc(var(--vvh, 100dvh) - 5.5rem)",
                transition: dragH == null ? "height 180ms ease" : "none",
              }
        }
      >
        <button
          type="button"
          className="flex min-h-11 w-full shrink-0 items-center justify-center min-[960px]:hidden"
          aria-label="Povuci ploču"
          onPointerDown={(event) => {
            if (desktop) return
            const current = sheetRef.current?.getBoundingClientRect().height ?? 0
            drag.current = { y: event.clientY, h: current }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (!drag.current) return
            const viewport = window.visualViewport?.height ?? window.innerHeight
            const next = Math.min(viewport - 72, Math.max(120, drag.current.h + (drag.current.y - event.clientY)))
            setDragH(next)
          }}
          onPointerUp={() => {
            if (!drag.current || dragH == null) {
              drag.current = null
              return
            }
            const viewport = window.visualViewport?.height ?? window.innerHeight
            const points: Array<[Snap, number]> = [
              ["peek", 210],
              ["half", viewport * 0.52],
              ["full", viewport - 72],
            ]
            const next = points.reduce((best, item) => (Math.abs(item[1] - dragH) < Math.abs(best[1] - dragH) ? item : best))
            setSnap(next[0])
            if (next[0] !== "full") setStepsOpen(false)
            setDragH(null)
            drag.current = null
          }}
        >
          <span className="h-1 w-10 rounded-full bg-line" />
        </button>

        <div className="shrink-0 space-y-3 px-3.5 pb-3.5 min-[960px]:pt-4">
          {showBrand && (
            <div className="flex h-8 items-center gap-2.5">
              <LogoMark size={32} />
              <Wordmark />
            </div>
          )}
          {stage === "result" && trip.destination ? (
            <button type="button" onClick={editDestination} className="search-pill w-full text-left">
              <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{readableName(trip.destination.label)}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className={cn("search-pill min-w-0 flex-1", focused === "dest" && "is-focus")}>
                <Search size={18} strokeWidth={1.75} aria-hidden="true" />
                <input
                  role="combobox"
                  aria-expanded={focused === "dest"}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-label="Odredište"
                  placeholder="Kamo idete?"
                  value={text}
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onFocus={() => setFocused("dest")}
                  onBlur={() => release("dest")}
                  onChange={(event) => {
                    setText(event.target.value)
                    setFocused("dest")
                  }}
                  onKeyDown={onSearchKey}
                />
                <button
                  type="button"
                  className="search-go"
                  aria-label="Traži"
                  disabled={!text.trim()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={submitSearch}
                >
                  <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                className="btn btn-quiet h-12 shrink-0 px-3 text-sm"
                onMouseDown={(event) => event.preventDefault()}
                onClick={startMapPick}
              >
                Klikni na kartu
              </button>
            </div>
          )}

          {saveAs && stage !== "result" && (
            <p className="text-xs text-muted">{saveAs === "home" ? "Sprema se kao Dom" : "Sprema se kao Posao"}</p>
          )}

          {stage !== "result" && (originOpen || originText.trim().length > 0 || trip.origin != null) && (
            <div className={cn("search-pill", focused === "origin" && "is-focus")}>
              <MapPin size={18} strokeWidth={1.75} aria-hidden="true" />
              <input
                ref={originInputRef}
                aria-label="Polazište"
                placeholder="Polazište"
                value={originText}
                autoComplete="off"
                onFocus={() => {
                  setFocused("origin")
                  setOriginOpen(true)
                }}
                onBlur={() => release("origin")}
                onChange={(event) => {
                  setOriginText(event.target.value)
                  setFocused("origin")
                }}
                onKeyDown={onSearchKey}
              />
            </div>
          )}

          {trip.destination && !trip.origin && !originOpen && !originText.trim() && (
            <div className="space-y-2">
              <p className="text-sm">Odakle krećete?</p>
              {trip.locating && <p className="text-sm">Tražim vašu lokaciju.</p>}
              {trip.gpsError && !trip.locating && <p className="text-sm text-danger">{trip.gpsError}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary min-h-11" onClick={() => void trip.useMyLocation("origin")}>
                  Moja lokacija
                </button>
                <button type="button" className="btn btn-quiet min-h-11" onClick={openOriginEditor}>
                  Upiši polazište
                </button>
              </div>
            </div>
          )}

          {stage === "idle" && (
            <>
              <div className="flex gap-2 overflow-x-auto">
                {shortcuts.length === 0 && (
                  <button
                    type="button"
                    className="place-chip"
                    onClick={() => {
                      setSaveAs(trip.book.home ? "work" : "home")
                      setFocused("dest")
                    }}
                  >
                    <MapPin size={14} strokeWidth={1.75} aria-hidden="true" />
                    Spremi mjesto
                  </button>
                )}
                {shortcuts.map((item) => (
                  <div key={item.kind} className="relative">
                    <button
                      type="button"
                      className="place-chip"
                      aria-label={item.label}
                      onPointerDown={() => armHold(() => setChipMenu(item.kind))}
                      onPointerUp={endHold}
                      onPointerCancel={endHold}
                      onClick={() => {
                        if (held.current) {
                          held.current = false
                          return
                        }
                        trip.setDestination(item.place)
                      }}
                    >
                      {item.kind === "home" ? (
                        <Home size={14} strokeWidth={1.75} aria-hidden="true" />
                      ) : (
                        <Briefcase size={14} strokeWidth={1.75} aria-hidden="true" />
                      )}
                      {item.label}
                    </button>
                    {chipMenu === item.kind && (
                      <div className="absolute left-0 top-12 z-10 w-36 rounded-xl border border-line bg-sand p-1 shadow-[var(--shadow-card)]">
                        <button
                          type="button"
                          className="menu-row"
                          onClick={() => {
                            setChipMenu(null)
                            setSaveAs(item.kind)
                            setText("")
                            setFocused("dest")
                          }}
                        >
                          Uredi
                        </button>
                        <button
                          type="button"
                          className="menu-row"
                          onClick={() => {
                            trip.removePlace(item.kind)
                            setChipMenu(null)
                          }}
                        >
                          Ukloni
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {nearest && (
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-3 border-t border-line pt-2 text-left"
                  onClick={() => {
                    const station = nearest.station
                    trip.setOrigin({ lat: station.lat, lng: station.lng, label: readableName(station.name), source: "station" })
                    trip.focusMap(station.lat, station.lng)
                  }}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper text-ink">
                    <Bike size={16} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">Najbliža stanica: {readableName(nearest.station.name)}</span>
                    <span className="block text-xs text-muted">
                      {walkMinutes(nearest.meters)} min hoda · {nearest.meters < 1000 ? `${Math.round(nearest.meters)} m` : formatDistance(nearest.meters)}
                    </span>
                    {nearest.note && <span className="block text-xs text-muted">{nearest.note}</span>}
                  </span>
                  <span className="shrink-0 text-sm font-medium" style={{ color: bikeColor(nearest.station) }}>
                    {bikesLabel(nearest.station.bikes)}
                  </span>
                </button>
              )}
              {recentPlaces.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted">Nedavno</p>
                  {recentPlaces.map((place) => (
                    <button key={`${place.label}-${place.lat}`} type="button" className="menu-row px-0" onClick={() => trip.setDestination(place)}>
                      <Clock size={16} strokeWidth={1.75} aria-hidden="true" />
                      <span className="min-w-0 truncate">{readableName(place.label)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {trip.mapPick && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <p>Dodirnite kartu za {trip.mapPick === "origin" ? "polazište" : "odredište"}.</p>
              <button type="button" className="btn btn-quiet" onClick={() => trip.setMapPick(null)}>
                Odustani
              </button>
            </div>
          )}

          {originOpen && trip.origin && trip.destination && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-quiet"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  const nextDestination = trip.origin
                  const nextOrigin = trip.destination
                  trip.swap()
                  setText(nextDestination ? readableName(nextDestination.label) : "")
                  setOriginText(nextOrigin ? readableName(nextOrigin.label) : "")
                  setFocused(null)
                }}
                aria-label="Zamijeni polazište i odredište"
              >
                <ArrowLeftRight size={16} strokeWidth={1.75} aria-hidden="true" />
                Zamijeni
              </button>
              <button type="button" className="btn btn-quiet" onMouseDown={(event) => event.preventDefault()} onClick={() => trip.savePlace("home")}>
                <Home size={15} strokeWidth={1.75} aria-hidden="true" />
                Spremi kao Dom
              </button>
              <button type="button" className="btn btn-quiet" onMouseDown={(event) => event.preventDefault()} onClick={() => trip.savePlace("work")}>
                <Briefcase size={15} strokeWidth={1.75} aria-hidden="true" />
                Spremi kao Posao
              </button>
            </div>
          )}
        </div>

        {snap !== "peek" && stage === "search" && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
            <ul
              id={listId}
              role="listbox"
              aria-label="Prijedlozi"
              className="pb-2"
              onPointerDown={(event) => {
                if (event.target instanceof Element && event.target.closest("button")) event.preventDefault()
              }}
            >
              {showMine && (
                <li>
                  <button type="button" role="option" data-suggest-index={mineIndex} aria-selected={highlight === mineIndex} className={cn("menu-row", highlight === mineIndex && "is-active")} onMouseDown={(event) => event.preventDefault()} onClick={() => void trip.useMyLocation(focused === "origin" ? "origin" : "destination")}>
                    <Navigation size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span>Moja lokacija</span>
                  </button>
                </li>
              )}
              {saved.length > 0 && (
                <li className="px-3 pb-1 pt-3 text-xs text-muted">Nedavno i spremljeno</li>
              )}
              {saved.map((item, index) =>
                item ? (
                  <li key={`${item.icon}-${item.place.label}`}>
                    <button type="button" role="option" data-suggest-index={savedIndex[index]} aria-selected={highlight === savedIndex[index]} className={cn("menu-row", highlight === savedIndex[index] && "is-active")} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item.place)}>
                      {item.icon === "home" ? (
                        <Home size={16} strokeWidth={1.75} aria-hidden="true" />
                      ) : item.icon === "work" ? (
                        <Briefcase size={16} strokeWidth={1.75} aria-hidden="true" />
                      ) : (
                        <MapPin size={16} strokeWidth={1.75} aria-hidden="true" />
                      )}
                      <span className="min-w-0 truncate">{item.icon === "pin" ? readableName(item.place.label) : item.label}</span>
                    </button>
                  </li>
                ) : null,
              )}
              {stationHits.length > 0 && <li className="px-3 pb-1 pt-3 text-xs text-muted">Stanice Bajs</li>}
              {stationHits.map((station, index) => (
                <li key={station.id}>
                  <button
                    type="button"
                    role="option"
                    data-suggest-index={stationIndex[index]}
                    aria-selected={highlight === stationIndex[index]}
                    className={cn("menu-row", highlight === stationIndex[index] && "is-active")}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose({ lat: station.lat, lng: station.lng, label: readableName(station.name), source: "station" })}
                  >
                    <Bike size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{readableName(station.name)}</span>
                    <span className="shrink-0 text-xs font-medium" style={{ color: bikeColor(station) }}>
                      {bikesLabel(station.bikes)}
                    </span>
                  </button>
                </li>
              ))}
              {addresses.length > 0 && <li className="px-3 pb-1 pt-3 text-xs text-muted">Adrese i mjesta</li>}
              {addresses.map((place, index) => (
                <li key={`${place.label}-${place.lat}`}>
                  <button type="button" role="option" data-suggest-index={addressIndex[index]} aria-selected={highlight === addressIndex[index]} className={cn("menu-row", highlight === addressIndex[index] && "is-active")} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(place)}>
                    <MapPin size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{place.title ?? place.label}</span>
                      {place.subtitle && <span className="block truncate text-xs text-muted">{place.subtitle}</span>}
                    </span>
                  </button>
                </li>
              ))}
              {searching && <li className="px-3 py-2 text-sm text-muted">Tražim…</li>}
              {searchError && !addresses.length && (
                <li className="space-y-2 px-3 py-2">
                  <p className="text-sm text-muted">{searchError}</p>
                  {searchDown && (
                    <button type="button" className="btn btn-quiet min-h-11" onMouseDown={(event) => event.preventDefault()} onClick={() => setSearchAttempt((value) => value + 1)}>
                      Pokušaj ponovno
                    </button>
                  )}
                </li>
              )}
              {focused !== "origin" && (
                <li>
                  <button type="button" role="option" data-suggest-index={originIndex} aria-selected={highlight === originIndex} className={cn("menu-row", highlight === originIndex && "is-active")} onMouseDown={(event) => event.preventDefault()} onClick={openOriginEditor}>
                    <MapPin size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span>Promijeni polazište</span>
                  </button>
                </li>
              )}
              <li>
                <button
                  type="button"
                  role="option"
                  data-suggest-index={mapIndex}
                  aria-selected={highlight === mapIndex}
                  className={cn("menu-row", highlight === mapIndex && "is-active")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={startMapPick}
                >
                  <MapPin size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>Odaberi na karti</span>
                </button>
              </li>
            </ul>
          </div>
        )}

        {snap !== "peek" && stage === "result" && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-3">
            {routeProblem && (
              <div className="space-y-2">
                <p className="text-sm">{routeProblem}</p>
                {routeProblem === ROUTE_UNAVAILABLE && (
                  <button type="button" className="btn btn-primary min-h-11" onClick={trip.retryRoutes}>
                    Pokušaj ponovno
                  </button>
                )}
              </div>
            )}
            {trip.origin && (
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Način putovanja">
              <ModeCard
                label="Bajs"
                icon={<Bike size={16} strokeWidth={1.75} aria-hidden="true" />}
                slot={trip.slots.bajs}
                selected={trip.selected === "bajs"}
                note={walkFaster ? "Pješice je brže" : undefined}
                onSelect={() => trip.selectMode("bajs")}
              />
              <ModeCard
                label="Svoj bicikl"
                icon={<Bike size={16} strokeWidth={1.75} aria-hidden="true" />}
                slot={trip.slots.own}
                selected={trip.selected === "own"}
                extra={trip.slots.own.status === "ready" ? "+ vezanje" : undefined}
                onSelect={() => trip.selectMode("own")}
              />
              <ModeCard
                label="Pješice"
                icon={<Footprints size={16} strokeWidth={1.75} aria-hidden="true" />}
                slot={trip.slots.walk}
                selected={trip.selected === "walk"}
                onSelect={() => trip.selectMode("walk")}
              />
            </div>
            )}

            {routeSlow && <p className="text-sm">Još računam, ovo traje dulje nego inače.</p>}

            {trip.lanePct != null && (
              <p className="text-xs text-muted">{Math.round(trip.lanePct / 5) * 5}% vožnje uz službene staze, procjena</p>
            )}

            <button
              type="button"
              aria-pressed={trip.onBajs}
              onClick={trip.toggleOnBajs}
              className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm"
            >
              <span>Već sam na Bajsu</span>
              <span className={cn("h-6 w-11 rounded-full p-0.5", trip.onBajs ? "bg-pine" : "bg-line")} aria-hidden="true">
                <span className={cn("block h-5 w-5 rounded-full bg-sand transition-transform duration-150", trip.onBajs && "translate-x-5")} />
              </span>
            </button>

            {plan && (
              <div>
                <ol className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  {plan.segments
                    .filter((segment) => segment.role === "ride" || segment.role === "direct" || segment.durationS >= 60)
                    .map((segment, index) => (
                    <li key={`${segment.role}-${index}`} className="flex items-baseline gap-2">
                      {index > 0 && <span aria-hidden="true">→</span>}
                      <span>
                        {moveLabel(segment.role)} {formatMinutes(segment.durationS)}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {[
                    plan.pickup ? `${plan.pickup.name} · ${bikesLabel(plan.pickup.bikes ?? 0)}` : null,
                    plan.dropoff ? `${plan.dropoff.name} · ${racksLabel(plan.dropoff.freeRacks ?? 0)}` : null,
                    plan.parking ? plan.parking.name.replace(/^OSM parkiralište za bicikle$/, "Parkiralište za bicikle") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            )}

            {warnings.bar.map((warning) => (
              <p key={warning} className="note px-3 py-1.5 text-xs">
                {warning}
              </p>
            ))}

            {plan && (
              <div>
                <button type="button" className="min-h-11 text-sm font-medium" onClick={() => setStepsOpen((value) => !value)}>
                  {stepsOpen ? "Sakrij korake" : "Prikaži korake"}
                </button>
                {stepsOpen && (
                  <div className="mt-2 space-y-3">
                    {plan.penaltyNote && <p className="text-xs text-muted">{plan.penaltyNote}</p>}
                    {warnings.rest.map((warning) => (
                      <p key={warning} className="text-xs text-muted">
                        {warning}
                      </p>
                    ))}
                    {plan.segments.map((segment, index) => (
                      <div key={`${segment.role}-steps-${index}`}>
                        <p className="text-sm font-medium">
                          {segment.title} · {formatMinutes(segment.durationS)}
                        </p>
                        <ol className="mt-1 space-y-1 text-sm">
                          {segment.steps.map((step, stepIndex) => (
                            <li key={`${step.alongM}-${stepIndex}`} className="flex justify-between gap-3">
                              <span className="min-w-0">{step.instruction}</span>
                              <span className="shrink-0 tabular-nums text-muted">{Math.round(step.distanceM)} m</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                    {trip.selected === "own" && plan.parkingChoices.length > 1 && (
                      <div>
                        <p className="text-sm font-medium">Druga parkirališta</p>
                        <ul className="mt-1">
                          {plan.parkingChoices
                            .filter((choice) => choice.parkingId !== plan.parking?.id)
                            .map((choice) => (
                              <li key={choice.parkingId}>
                                <button type="button" className="menu-row px-0" onClick={() => trip.chooseParking(choice.parkingId)}>
                                  <span className="min-w-0 flex-1 truncate text-left">{choice.name}</span>
                                  <span className="text-xs text-muted">{formatMinutes(choice.totalS)}</span>
                                </button>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {stage === "result" && (
          <div className="shrink-0 border-t border-line px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <button type="button" className="btn btn-primary h-12 w-full rounded-xl text-base" disabled={!plan} onClick={trip.startNavigation}>
              <Navigation size={16} strokeWidth={1.75} aria-hidden="true" />
              Kreni
            </button>
          </div>
        )}
      </section>
    </>
  )
}

function bikeColor(station: Station): string {
  if (station.maintenance) return "var(--st-maint)"
  if (station.bikes > 3) return "var(--st-many)"
  if (station.bikes > 0) return "var(--st-few)"
  return "var(--st-none)"
}

function ModeCard({
  label,
  icon,
  slot,
  selected,
  note,
  extra,
  onSelect,
}: {
  label: string
  icon: ReactNode
  slot: PlanSlot
  selected: boolean
  note?: string
  extra?: string
  onSelect: () => void
}) {
  const ready = slot.status === "ready"
  const failed = slot.status === "error"
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={slot.status === "idle"}
      onClick={onSelect}
      className={cn(
        "flex min-h-[4.75rem] flex-col items-start rounded-xl border-2 px-2 py-2 text-left",
        selected ? "border-pine bg-wash" : "border-line",
        failed && "opacity-55",
      )}
    >
      <span className="flex items-center gap-1 text-xs">{icon}{label}</span>
      {slot.status === "loading" || slot.status === "idle" ? (
        <span className="mt-1 text-xs text-muted">Računam</span>
      ) : ready ? (
        <span className="mt-1 text-base font-medium tabular-nums">{formatMinutes(slot.plan.totalDurationS)}</span>
      ) : (
        <span className="mt-1 text-xs leading-snug text-muted">{shortReason(slot.message)}</span>
      )}
      {extra && ready && <span className="text-[11px] text-muted">{extra}</span>}
      {note && ready && <span className="text-[11px] text-muted">{note}</span>}
    </button>
  )
}
