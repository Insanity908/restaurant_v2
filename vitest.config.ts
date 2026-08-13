import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // SuperAdminPage e ReportsPage importam recharts a nível de módulo; com
    // vi.resetModules() a recarregar tudo do zero em cada teste, montá-las
    // pode legitimamente levar 8-15s (mais sob contenção de CPU), o que por
    // vezes ultrapassava os 20s por pouco mesmo sem nada de errado. 35s dá
    // margem sem mascarar um hang real (ReportsPage a11y tem o seu próprio
    // override maior por ser o caso mais pesado).
    testTimeout: 35000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
