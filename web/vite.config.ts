import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// host: true exposes the dev server on the LAN so you can test across devices
// on the same network (see README "Testing locally on the same network").
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
