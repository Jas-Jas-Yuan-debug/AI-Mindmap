import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, "src/renderer"),
  base: "/",
  define: {
    __PLATFORM__: JSON.stringify("web"),
  },
  build: {
    outDir: resolve(__dirname, "dist-web"),
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
