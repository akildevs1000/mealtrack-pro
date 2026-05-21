// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Deploying to a plain Node server (IP:PORT), not Cloudflare Workers:
//   - cloudflare: false disables the @cloudflare/vite-plugin so the build emits a Nitro
//     Node bundle instead of a Worker bundle.
//   - server.preset "node-server" tells Nitro to emit a standalone Node listener at
//     .output/server/index.mjs that honors HOST and PORT env vars.
// The Cloudflare-style src/server.ts wrapper is intentionally NOT used in this target.
export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    server: { preset: "node-server" },
  },
  // Dev-only: proxy the API through the same origin the page is served from, so
  // the app can be opened from any LAN device (http://<pc-ip>:8044) and call a
  // relative "/api" with no CORS. The frontend's default base is "/api" (see
  // src/lib/api.ts); this forwards it to the backend on :5044.
  vite: {
    server: {
      proxy: {
        "/api": { target: "http://localhost:5044", changeOrigin: true },
      },
    },
  },
});
