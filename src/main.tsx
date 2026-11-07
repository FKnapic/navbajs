import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { setWorkerUrl } from "maplibre-gl"
import { registerSW } from "virtual:pwa-register"
import App from "./App"
import "maplibre-gl/dist/maplibre-gl.css"
import "./index.css"

setWorkerUrl("/maplibre-gl-worker.mjs")

registerSW({ immediate: true })

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
