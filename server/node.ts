import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { api } from "./app"
import { loadEnvFile } from "./env"

loadEnvFile()

const app = new Hono()
app.route("/", api)

if (process.env.NODE_ENV === "production") {
  const files = serveStatic({ root: "./dist" })
  const spa = serveStatic({ path: "./dist/index.html" })
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api")) return next()
    return files(c, () => spa(c, next))
  })
}

const port = Number(process.env.PORT || 8787)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`NavBajs API sluša na http://127.0.0.1:${info.port}`)
})
