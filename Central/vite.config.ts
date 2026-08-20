import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(({ mode }) => {
  // The Render deployment is a normal Node/Vinext application. Cloudflare
  // Worker bindings are not available while Vite loads its configuration, so
  // do not import @cloudflare/vite-plugin here. Render accesses D1 at runtime
  // through lib/server/d1.ts and the CLOUDFLARE_* environment variables.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const localEnv = loadEnv(mode, process.cwd(), "CENTRAL_FRETE_");
  const localVars = Object.fromEntries(
    ["CENTRAL_FRETE_PASSWORD", "CENTRAL_FRETE_SESSION_SECRET"]
      .map((name) => [name, localEnv[name] || process.env[name]])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );

  // Keep the Worker binding description for tooling that consumes the config,
  // but do not instantiate the Cloudflare Vite plugin during a Render build.
  // The real D1 id is supplied at runtime by CLOUDFLARE_D1_DATABASE_ID.
  void d1;
  void r2;
  void SITE_CREATOR_PLACEHOLDER_DATABASE_ID;
  void localVars;

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [vinext(), sites()],
  };
});
