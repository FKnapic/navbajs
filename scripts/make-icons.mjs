import { mkdir, readFile } from "node:fs/promises"
import { chromium } from "playwright"

const jobs = [
  ["public/logo-mark.svg", 192, "public/icons/icon-192.png"],
  ["public/logo-mark.svg", 512, "public/icons/icon-512.png"],
  ["public/logo-mark-maskable.svg", 512, "public/icons/icon-maskable-512.png"],
  ["public/logo-mark.svg", 180, "public/icons/apple-touch-icon.png"],
  ["public/logo-mark-32.svg", 32, "public/favicon-32.png"],
]

await mkdir("public/icons", { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
for (const [svgPath, size, out] of jobs) {
  const svg = (await readFile(svgPath, "utf8")).replace("<svg ", `<svg width="${size}" height="${size}" `)
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<!doctype html><style>html,body{margin:0;width:${size}px;height:${size}px}</style>${svg}`)
  await page.locator("svg").screenshot({ path: out, omitBackground: true })
}
await browser.close()
console.log("Ikone su u public/icons i public/favicon-32.png")
