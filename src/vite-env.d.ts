/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_VALHALLA_URL?: string
  readonly VITE_PHOTON_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __navbajsMap?: import("maplibre-gl").Map
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}
