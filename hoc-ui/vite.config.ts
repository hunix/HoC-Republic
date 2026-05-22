import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-icon.svg"],
      manifest: {
        name: "House of Clawdbot",
        short_name: "HoC",
        description: "HoC Web Interface",
        theme_color: "#1a1a1a",
        background_color: "#1a1a1a",
        icons: [
          {
            src: "pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2022",
    outDir: "../dist/control-ui",
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Content-hashed filenames enable immutable caching (1yr max-age)
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          icons: ["lucide-react"],
          "globe-3d": ["globe.gl", "three"],
          maps: ["leaflet", "react-leaflet"],
          state: ["zustand"],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:18789",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:18789",
        ws: true,
      },
      "/sandbox-files": {
        target: "http://localhost:18789",
        changeOrigin: true,
      },
      "/sandbox": {
        target: "http://localhost:18789",
        changeOrigin: true,
      },
      "/sandbox-novnc": {
        target: "http://localhost:18789",
        changeOrigin: true,
        ws: true,
      },
      "/preview": {
        target: "http://localhost:18789",
        changeOrigin: true,
      },
      "/republic-output": {
        target: "http://localhost:18789",
        changeOrigin: true,
      },
      "/games": {
        target: "http://localhost:18789",
        changeOrigin: true,
      },
      "/research": {
        target: "http://localhost:18789",
        changeOrigin: true,
      },
    },
  },
});
