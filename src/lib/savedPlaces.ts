import type { Place } from "../types/places"

const KEY = "navbajs-saved"

export interface SavedBook {
  home: Place | null
  work: Place | null
  recent: Place[]
}

const EMPTY: SavedBook = { home: null, work: null, recent: [] }

export function loadSaved(): SavedBook {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<SavedBook>
    return {
      home: parsed.home ?? null,
      work: parsed.work ?? null,
      recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, 5) : [],
    }
  } catch {
    return EMPTY
  }
}

function write(book: SavedBook): SavedBook {
  localStorage.setItem(KEY, JSON.stringify(book))
  return book
}

export function rememberPlace(book: SavedBook, place: Place): SavedBook {
  if (place.source === "gps") return book
  const recent = [place, ...book.recent.filter((item) => item.label !== place.label)].slice(0, 5)
  return write({ ...book, recent })
}

export function saveNamed(book: SavedBook, kind: "home" | "work", place: Place): SavedBook {
  return write({ ...book, [kind]: place })
}

export function removeNamed(book: SavedBook, kind: "home" | "work"): SavedBook {
  return write({ ...book, [kind]: null })
}
