import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Runflow's Solutions API (/v1/models/{slug}/runs) does not return CORS
// headers, so the browser can't call it directly. The Vite dev server
// proxies /api/runflow/* → https://api.runflow.io/v1/* server-side, which
// sidesteps CORS entirely — the browser only ever talks to localhost.
//
// Works the same on Replit (Vite runs there too) and any other dev host.

export default defineConfig({
  plugins: [react()],
  server: {
    // host: true binds 0.0.0.0 so Replit / Codespaces / Docker can proxy the dev server.
    host: true,
    port: 5173,
    // allow *.replit.dev preview origins
    allowedHosts: true,
    proxy: {
      "/api/runflow": {
        target: "https://api.runflow.io",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/runflow/, "/v1"),
      },
    },
  },
});
