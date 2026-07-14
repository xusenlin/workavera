import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8090",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // Serve the curated language/theme subset in src/lib/shiki-lite.ts to
      // every consumer of the bare "shiki" import (our code and
      // @streamdown/code). Subpath imports like shiki/engine/javascript are
      // not affected.
      {
        find: /^shiki$/,
        replacement: path.resolve(__dirname, "./src/lib/shiki-lite.ts"),
      },
    ],
  },
})
