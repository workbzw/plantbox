import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
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
  server: { port: 5173, strictPort: true },
});
