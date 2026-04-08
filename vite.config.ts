import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

function getCommitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const appCommitSha = getCommitSha();

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/SphenPad/" : "/",
  plugins: [react()],
  define: {
    __APP_COMMIT_SHA__: JSON.stringify(appCommitSha),
  },
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
