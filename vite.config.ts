import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"

const webManifest = {
  name: "NavBajs — navigacija biciklom po Zagrebu",
  short_name: "NavBajs",
  description: "Navigacija biciklom po Zagrebu uz Bajs, javna parkirališta i biciklističke staze.",
  lang: "hr",
  dir: "ltr",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#f3efe8",
  theme_color: "#2c4038",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
}

function devManifest(): Plugin {
  return {
    name: "dev-manifest",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/manifest.webmanifest") return next()
        res.setHeader("Content-Type", "application/manifest+json; charset=utf-8")
        res.end(JSON.stringify(webManifest))
      })
    },
    transformIndexHtml(html) {
      if (html.includes('rel="manifest"')) return html
      return html.replace("</head>", '    <link rel="manifest" href="/manifest.webmanifest" />\n  </head>')
    },
  }
}

function maplibreWorker(): Plugin {
  const sourcePath = resolve("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs")
  return {
    name: "maplibre-worker",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/maplibre-gl-worker.mjs") return next()
        res.setHeader("Content-Type", "text/javascript; charset=utf-8")
        res.end(readFileSync(sourcePath))
      })
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "maplibre-gl-worker.mjs",
        source: readFileSync(sourcePath),
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    maplibreWorker(),
    devManifest(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/*.png"],
      manifest: webManifest,
      workbox: {
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,json,geojson,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "openfreemap",
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\/api\/bajs/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "bajs",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 4, maxAgeSeconds: 120 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
  server: {
    port: 5173,
    watch: {
      ignored: ["**/test-results/**", "**/playwright-report/**", "**/blob-report/**", "**/e2e/**", "**/tests/**"],
    },
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
})
