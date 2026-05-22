import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 3002,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
