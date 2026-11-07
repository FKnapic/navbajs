import { handle } from "hono/vercel"
import { api } from "./app"

export default handle(api)
