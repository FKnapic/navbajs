export interface RawManeuver {
  type?: number
  street_names?: string[]
  roundabout_exit_count?: number
}

function streetName(names?: string[]): string {
  if (!names?.length) return ""
  for (const name of names) {
    const parts = name
      .split("/")
      .map((part) => part.trim())
      .filter((part) => part && !/^(\d+|E\d+)$/i.test(part) && !/^unnamed/i.test(part))
    const cleaned = parts.join(" / ").trim()
    if (cleaned) return cleaned
  }
  return ""
}

function withStreet(base: string, street: string): string {
  return street ? `${base} na ${street}` : base
}

/** Valhalla na javnom poslužitelju vraća engleski tekst, pa upute slažemo iz tipa manevra. */
export function croatianInstruction(maneuver: RawManeuver): string {
  const street = streetName(maneuver.street_names)
  const type = maneuver.type ?? 8
  const exitCount = maneuver.roundabout_exit_count
  switch (type) {
    case 1:
    case 2:
    case 3:
      return withStreet("Krenite", street)
    case 4:
      return "Stigli ste na odredište"
    case 5:
      return "Odredište je s desne strane"
    case 6:
      return "Odredište je s lijeve strane"
    case 7:
      return withStreet("Nastavite", street)
    case 8:
      return withStreet("Nastavite ravno", street)
    case 9:
      return withStreet("Blago desno", street)
    case 10:
      return withStreet("Skrenite desno", street)
    case 11:
      return withStreet("Oštro desno", street)
    case 12:
    case 13:
      return "Polukružno se okrenite"
    case 14:
      return withStreet("Oštro lijevo", street)
    case 15:
      return withStreet("Skrenite lijevo", street)
    case 16:
      return withStreet("Blago lijevo", street)
    case 17:
      return withStreet("Nastavite na priključak", street)
    case 18:
    case 20:
    case 23:
      return withStreet("Držite se desno", street)
    case 19:
    case 21:
    case 24:
      return withStreet("Držite se lijevo", street)
    case 22:
      return withStreet("Držite se ravno", street)
    case 25:
    case 37:
    case 38:
      return withStreet("Uključite se", street)
    case 26:
      return exitCount
        ? `Uđite u kružni tok i izađite na ${exitCount}. izlazu`
        : "Uđite u kružni tok"
    case 27:
      return withStreet("Izađite iz kružnog toka", street)
    case 28:
      return "Ukrcajte se na trajekt"
    case 29:
      return "Izađite s trajekta"
    default:
      return withStreet("Nastavite", street)
  }
}
