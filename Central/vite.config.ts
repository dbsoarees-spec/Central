import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(async ({ mode }) => {
  // Render runs the application as a normal Node/Vinext service. It does not
  // provide Cloudflare Worker bindings during the Vite build, so the
  // Cloudflare Vite plugin must not be loaded there. Runtime D1 access on
  // Render is handled by lib/server/d1.ts through the Cloudflare REST API.
  const isRender =
    process.env.RENDER === "true" || Boolean(process.env.RENDER_SERVICE_ID);

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
  const localEnv = loadEnv(mode, process.cwd(), "CENTRAL_FRETE_");
  const localVars = Object.fromEntries(
    ["CENTRAL_FRETE_PASSWORD", "CENTRAL_FRETE_SESSION_SECRET"]
      .map((name) => [name, localEnv[name] || process.env[name]])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const localBindingConfig = {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    d1_databases: d1
      ? [
          {
            binding: d1,
            database_name: "site-creator-d1",
            database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          },
        ]
      : [],
    r2_buckets: r2
      ? [
          {
            binding: r2,
            bucket_name: "site-creator-r2",
          },
        ]
      : [],
    vars: localVars,
  };

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  // Import it only for Cloudflare builds; importing it on Render causes the
  // Rollup binding validation to fail because Worker bindings are unavailable.
  const cloudflarePlugin = isRender
    ? null
    : (await import("@cloudflare/vite-plugin")).cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      });

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [vinext(), sites(), ...(cloudflarePlugin ? [cloudflarePlugin] : [])],
  };
});
