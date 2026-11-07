import type { ExpressionSpecification, Map } from "maplibre-gl"
import { cssColor } from "../lib/palette"

export const STATION_MID_ZOOM = 14
export const STATION_NEAR_ZOOM = 16

const TONES = ["many", "few", "none", "maint"] as const
type Tone = (typeof TONES)[number]

function token(name: string, fallback: string): string {
  return cssColor(name) || fallback
}

function toneColor(tone: Tone): string {
  if (tone === "many") return token("--st-many", "#1D6FD8")
  if (tone === "few") return token("--st-few", "#D9962B")
  if (tone === "maint") return token("--st-maint", "#D2645A")
  return token("--st-none", "#9AA3AD")
}

function draw(css: number, paint: (ctx: CanvasRenderingContext2D, center: number) => void): ImageData {
  const canvas = document.createElement("canvas")
  canvas.width = css * 2
  canvas.height = css * 2
  const ctx = canvas.getContext("2d")
  if (!ctx) return new ImageData(canvas.width, canvas.height)
  ctx.scale(2, 2)
  paint(ctx, css / 2)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

function wrench(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-Math.PI / 4)
  ctx.strokeStyle = toneColor("maint")
  ctx.lineWidth = 1.6
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.arc(0, -s * 0.42, s * 0.32, 0.35, Math.PI * 1.55)
  ctx.moveTo(0, -s * 0.1)
  ctx.lineTo(0, s * 0.7)
  ctx.moveTo(-s * 0.22, s * 0.48)
  ctx.lineTo(s * 0.22, s * 0.48)
  ctx.stroke()
  ctx.restore()
}

function paintFar(focus: boolean, tone: Tone): ImageData {
  return draw(44, (ctx, c) => {
    ctx.fillStyle = toneColor(tone)
    ctx.beginPath()
    ctx.arc(c, c, focus ? 8 : 6.2, 0, Math.PI * 2)
    ctx.fill()
  })
}

function paintBadge(level: "mid" | "near", focus: boolean, tone: Tone): ImageData {
  const css = level === "near" ? 56 : 48
  return draw(css, (ctx, c) => {
    const radius = (level === "near" ? 16 : 13.5) + (focus ? 1.5 : 0)
    const dark = document.documentElement.classList.contains("dark")
    ctx.save()
    ctx.shadowColor = token("--marker-shadow", "rgba(20, 33, 58, 0.16)")
    ctx.shadowBlur = 3
    ctx.shadowOffsetY = 1
    ctx.fillStyle = token("--surface", "#ffffff")
    ctx.beginPath()
    ctx.arc(c, c, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.beginPath()
    ctx.arc(c, c, radius, 0, Math.PI * 2)
    ctx.lineWidth = focus ? 3.5 : 2.5
    ctx.strokeStyle = toneColor(tone)
    ctx.stroke()
    const edge = token("--marker-edge", "rgba(0, 0, 0, 0.08)")
    if (!dark && edge) {
      ctx.beginPath()
      ctx.arc(c, c, radius + (focus ? 2.2 : 1.7), 0, Math.PI * 2)
      ctx.lineWidth = 1
      ctx.strokeStyle = edge
      ctx.stroke()
    }
    if (tone === "maint") wrench(ctx, c, c + radius * 0.42, 4.2)
  })
}

export function installStationIcons(map: Map): void {
  if (map.hasImage("stb-far-many-0")) return
  for (const tone of TONES) {
    for (const focus of [0, 1]) {
      map.addImage(`stb-far-${tone}-${focus}`, paintFar(focus === 1, tone), { pixelRatio: 2 })
      map.addImage(`stb-mid-${tone}-${focus}`, paintBadge("mid", focus === 1, tone), { pixelRatio: 2 })
      map.addImage(`stb-near-${tone}-${focus}`, paintBadge("near", focus === 1, tone), { pixelRatio: 2 })
    }
  }
}

function toneName(): ExpressionSpecification {
  return [
    "case",
    ["==", ["get", "maint"], 1],
    "maint",
    [">", ["to-number", ["get", "bikes"]], 3],
    "many",
    [">", ["to-number", ["get", "bikes"]], 0],
    "few",
    "none",
  ]
}

export function stationIconImage(focus: 0 | 1): ExpressionSpecification {
  const flag = String(focus)
  const tone = toneName()
  return [
    "step",
    ["zoom"],
    ["concat", "stb-far-", tone, "-", flag],
    STATION_MID_ZOOM,
    ["concat", "stb-mid-", tone, "-", flag],
    STATION_NEAR_ZOOM,
    ["concat", "stb-near-", tone, "-", flag],
  ]
}
