/** Nazive iz izvora koji su cijeli velikim slovima vraća u uobičajeni oblik. */
export function readableName(value: string): string {
  const letters = value.replace(/[^\p{L}]/gu, "")
  if (!letters || letters !== letters.toLocaleUpperCase("hr")) return value
  const titled = value
    .toLocaleLowerCase("hr")
    .replace(/(^|[\s./-])(\p{L})/gu, (_, separator: string, letter: string) => separator + letter.toLocaleUpperCase("hr"))
  return titled.replace(/\bUl\./g, "ul.")
}
