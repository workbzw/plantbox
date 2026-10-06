import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep the largest libraries independent of changing application code,
        // so their content hashes and browser/CDN caches remain reusable.
        manualChunks(id) {
          if (id.includes("/node_modules/@dimforge/rapier3d-compat/"))
            return "physics-engine";
          if (id.includes("/node_modules/three/")) return "three";
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: false } },
  },
});
