import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // host: true binds 0.0.0.0 so Replit / Codespaces / Docker can proxy the dev server.
    host: true,
    port: 5173,
    // allow *.replit.dev preview origins
    allowedHosts: true,
  },
});
