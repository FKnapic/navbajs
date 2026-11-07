import { handle } from "hono/vercel"
import { api } from "../server/app"

export default handle(api)
