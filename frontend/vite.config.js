import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173 },
  // if frontend will make requests to backend on a different origin, you may set proxy rules here later
});
