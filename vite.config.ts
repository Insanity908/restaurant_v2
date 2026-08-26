import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      devOptions: { enabled: false },
      includeAssets: ["favicon.png", "icons/apple-touch-icon.png", "icons/icon-512-maskable.png", "robots.txt"],
      manifest: {
        name: "Sabor POS — Gestão de Restaurantes",
        short_name: "Sabor POS",
        description: "Sistema de gestão e ponto de venda para restaurantes, funciona offline.",
        lang: "pt-MZ",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0B0B0F",
        theme_color: "#F59E0B",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          // Ficheiro dedicado (não o icon-512 "any"): o desenho vai até à
          // borda, e o Android recorta ícones maskable numa forma — sem
          // margem própria, a asa da chávena ficava cortada em alguns launchers.
          { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));