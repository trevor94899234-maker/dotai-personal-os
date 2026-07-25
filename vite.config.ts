import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 相對 base：local dev/preview 喺 root，GitHub Pages 子路徑（/dotai-personal-os/）都行。
  base: "./",
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  preview: { port: 4173, strictPort: false }
});
