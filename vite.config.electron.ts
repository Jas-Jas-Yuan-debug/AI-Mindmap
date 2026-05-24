import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, "src/renderer"),
  base: "./",
  define: {
    __PLATFORM__: JSON.stringify("electron"),
  },
  build: {
    outDir: resolve(__dirname, "dist-electron/renderer"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "src/renderer/index.html"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
