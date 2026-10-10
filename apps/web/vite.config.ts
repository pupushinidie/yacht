import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dayTheme } from "./day-theme";
import { palette } from "./day-palette";

// 端口默认 5293（网页）/ 3022（服务器）；另起一套服务时用 WEB_PORT、SERVER_PORT 改。
const webPort = Number(process.env.WEB_PORT ?? 5293);
const serverTarget = `http://localhost:${process.env.SERVER_PORT ?? 3022}`;

export default defineConfig({
  // 部署在子路径时用 BASE_PATH 指定，例如 BASE_PATH=/yacht/ npm run build。
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), dayTheme(palette)],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      "/socket.io": { target: serverTarget, ws: true },
      "/health": serverTarget
    }
  }
});
