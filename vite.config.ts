import { defineConfig } from "vite";
import { runAction, uxp } from "vite-uxp-plugin";
import { config } from "./uxp.config";

const action = process.env["BOLT_ACTION"];
const mode = process.env["MODE"] ?? "build";
process.env["VITE_BOLT_MODE"] = mode;
process.env["VITE_BOLT_WEBVIEW_PORT"] = config.webviewReloadPort.toString();

if (action !== undefined) runAction(config, action);

export default defineConfig({
  plugins: [uxp(config, mode)],
  build: {
    sourcemap: ["dev", "build"].includes(mode) ? "inline" : false,
    minify: false,
    rollupOptions: {
      external: ["premierepro", "uxp"],
      output: { format: "iife" },
    },
  },
  publicDir: "public",
});
