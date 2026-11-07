import { useEffect, useId, useRef, useState } from "react"
import { geocode } from "../api/geocode"
import type { GeocodeResult, Place } from "../types/places"

interface SearchBoxProps {
  label: string
  placeholder: string
  place: Place | null
  onSelect: (place: Place) => void
  onClear: () => void
  onOpenChange?: (open: boolean) => void
}

export function SearchBox({ label, placeholder, place, onSelect, onClear, onOpenChange }: SearchBoxProps) {
  const listId = useId()
  const [text, setText] = useState(place?.label ?? "")
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const request = useRef(0)

  useEffect(() => {
    if (place) setText(place.label)
  }, [place])

  useEffect(() => {
    onOpenChange?.(open && (results.length > 0 || Boolean(error)))
  }, [open, results, error, onOpenChange])

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [])

  useEffect(() => {
    const query = text.trim()
    if (place && query === place.label) return
    if (query.length < 2) {
      setResults([])
      setError(null)
      setLoading(false)
      return
    }
    const token = ++request.current
    setLoading(true)
    const timer = window.setTimeout(() => {
      void geocode(query)
        .then((found) => {
          if (token !== request.current) return
          setResults(found)
          setActive(0)
          setError(found.length ? null : "Nema rezultata u Zagrebu.")
          setOpen(true)
        })
        .catch(() => {
          if (token !== request.current) return
          setError("Pretraga adresa nije uspjela.")
          setResults([])
        })
        .finally(() => {
          if (token === request.current) setLoading(false)
        })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [text, place])

  function choose(result: GeocodeResult) {
    onSelect({ label: result.label, lat: result.lat, lng: result.lng, source: "search" })
    setText(result.label)
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={listId} className="kicker">
        {label}
      </label>
      <input
        id={listId}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${listId}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-opt-${active}` : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder={placeholder}
        value={text}
        onFocus={() => results.length && setOpen(true)}
        onChange={(event) => {
          setText(event.target.value)
          onClear()
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault()
            setOpen(true)
            setActive((index) => Math.min(results.length - 1, index + 1))
          } else if (event.key === "ArrowUp") {
            event.preventDefault()
            setActive((index) => Math.max(0, index - 1))
          } else if (event.key === "Enter" && open && results[active]) {
            event.preventDefault()
            choose(results[active])
          } else if (event.key === "Escape") {
            setOpen(false)
          }
        }}
        className="field outline-none"
      />
      {loading && <p className="mt-1 text-xs text-muted">Tražim…</p>}
      {open && (results.length > 0 || error) && (
        <ul
          id={`${listId}-list`}
          role="listbox"
          aria-label={label}
          className="menu-panel absolute z-20 mt-1 max-h-52 w-full scroll-mb-3 overflow-auto rounded-xl border border-line bg-sand py-1 shadow-[0_18px_40px_rgba(28,26,23,.12)]"
        >
          {results.map((result, index) => (
            <li key={`${result.label}-${result.lat}`} role="presentation">
              <button
                id={`${listId}-opt-${index}`}
                type="button"
                role="option"
                aria-selected={index === active}
                className={`block min-h-11 w-full px-3 py-2 text-left text-sm ${index === active ? "bg-wash" : ""}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(result)}
              >
                {result.label}
              </button>
            </li>
          ))}
          {!results.length && error && <li className="px-3 py-2 text-sm text-muted">{error}</li>}
        </ul>
      )}
    </div>
  )
}
