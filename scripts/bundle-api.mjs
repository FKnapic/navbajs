import { build } from "esbuild"

await build({
  entryPoints: ["server/vercel.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "api/[...path].js",
  legalComments: "none",
  logLevel: "info",
  banner: {
    js: "/* Generirano iz server/vercel.ts. Ne uređivati ručno. */",
  },
})
