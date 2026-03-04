import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/sp-api": {
        target: "https://sudokupad.app",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/sp-api/, ""),
      },
    },
  },
});
