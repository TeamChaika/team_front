import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    ...(mode === "saas-admin" ? { outDir: "dist-saas-admin" } : {}),
    rollupOptions: {
      ...(mode === "saas-admin" ? { input: "saas-admin.html" } : {}),
      output: {
        manualChunks:
          mode === "saas-admin"
            ? undefined
            : {
                ui: ["@mantine/core", "@mantine/hooks"],
                react: ["react", "react-dom", "react-router-dom"],
              },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    ...(mode === "saas-admin"
      ? {}
      : { proxy: { "/api": "http://127.0.0.1:8013" } }),
  },
}));
