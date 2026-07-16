import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), tsconfigPaths()],
    build: {
      rollupOptions: {
        input: {
          index: "src/main/index.ts",
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin(), tsconfigPaths()],
    build: {
      rollupOptions: {
        input: {
          index: "src/preload/index.ts",
        },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    plugins: [
      react({
        babel: {
          plugins: ["react-dev-locator"],
        },
      }),
      tsconfigPaths(),
    ],
    build: {
      rollupOptions: {
        input: {
          index: "src/renderer/index.html",
        },
      },
    },
  },
});
