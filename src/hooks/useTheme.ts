import { useEffect, useState } from "react"

export type Theme = "light" | "dark"

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  )

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    localStorage.setItem("bikebr-theme", theme)
    const token = theme === "dark" ? "--surface" : "--accent"
    const color = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color)
  }, [theme])

  return {
    theme,
    toggle: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
  }
}
