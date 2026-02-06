import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/app/" : "/",
  build: {
    outDir: "dist",
    assetsDir: "app/assets",
    emptyOutDir: true
  }
}));
