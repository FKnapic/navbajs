import type { IncomingMessage, ServerResponse } from "node:http"
import { api } from "./app"

function isWebRequest(value: unknown): value is Request {
  return typeof Request !== "undefined" && value instanceof Request
}

async function readBody(req: AsyncIterable<Uint8Array | string>): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function toRequest(req: IncomingMessage | Request): Promise<Request> {
  if (isWebRequest(req)) return req
  const host = req.headers.host ?? "localhost"
  const url = new URL(req.url ?? "/", `https://${host}`)
  const method = req.method ?? "GET"
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value)
    else if (Array.isArray(value)) headers.set(key, value.join(", "))
  }
  const hasBody = method !== "GET" && method !== "HEAD"
  return new Request(url, {
    method,
    headers,
    body: hasBody ? await readBody(req) : undefined,
  })
}

function write(res: ServerResponse, response: Response): Promise<void> {
  return response.arrayBuffer().then((buffer) => {
    const bytes = Buffer.from(buffer)
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-length") return
      res.setHeader(key, value)
    })
    res.setHeader("content-length", String(bytes.length))
    res.end(bytes)
  })
}

/** Vercel zove `(req, res)` i ignorira vraćeni Response. */
export default function handler(req: IncomingMessage | Request, res: ServerResponse): void {
  toRequest(req)
    .then((request) => api.fetch(request))
    .then((response) => write(res, response))
    .catch((error) => {
      console.error(error)
      if (!res.headersSent) res.statusCode = 500
      res.end("error")
    })
}
