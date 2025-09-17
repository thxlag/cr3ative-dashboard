import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "src/web/app"),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": {
        target: "http://localhost:4003",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:4003",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:4003",
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/web/app/src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "src/web/app/dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "src/web/app/index.html"),
    },
  },
});
