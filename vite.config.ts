import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    server: {
        port: 1428,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                  protocol: "ws",
                  host,
                  port: 1429
              }
            : undefined,
        watch: {
            ignored: ["**/src-tauri/**"]
        }
    }
}));
