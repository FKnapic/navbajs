import { api } from "../server/app"

interface AssetBinding {
  fetch: (request: Request) => Promise<Response>
}

export default {
  async fetch(request: Request, env: { ASSETS?: AssetBinding }, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith("/api/")) {
      return api.fetch(request, env, ctx)
    }
    if (!env.ASSETS) return new Response("Nedostaje ASSETS binding.", { status: 500 })
    return env.ASSETS.fetch(request)
  },
}
