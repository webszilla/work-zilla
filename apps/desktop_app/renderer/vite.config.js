import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  base: "./",
  root: path.resolve(__dirname),
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "es2020",
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("scheduler")) {
              return "vendor-react";
            }
            return "vendor";
          }
          if (id.includes("MonitorScreen")) {
            return "monitor-module";
          }
          if (id.includes("StorageFilesScreen") || id.includes("ChooseFoldersScreen")) {
            return "storage-module";
          }
          return undefined;
        }
      }
    }
  }
});
