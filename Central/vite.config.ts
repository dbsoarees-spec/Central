import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import { sites } from "./build/sites-vite-plugin";

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(({ mode }) => {
  // Render runs Central as a normal Node/Vinext service. Cloudflare Worker
  // bindings are not available while Vite loads its configuration. D1 access
  // at runtime is handled by lib/server/d1.ts using CLOUDFLARE_* variables.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  loadEnv(mode, process.cwd(), "CENTRAL_FRETE_");

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [vinext(), sites()],
    build: {
      rolldownOptions: {
        // The Render/Node build must never try to resolve Cloudflare's
        // Worker-only virtual modules. `oduleNam` is also externalized because
        // Rolldown is currently emitting that truncated virtual import while
        // processing the RSC server environment.
        external: ["cloudflare:workers", "oduleNam", "moduleName"],
      },
    },
  };
});
