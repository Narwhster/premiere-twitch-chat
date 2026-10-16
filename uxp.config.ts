import type { UXP_Manifest, UXP_Config, UXP_Config_Extra } from "vite-uxp-plugin";
import { version } from "./package.json";

const extraPrefs: UXP_Config_Extra = {
  hotReloadPort: 8080,
  webviewUi: true,
  webviewReloadPort: 8082,
  copyZipAssets: [],
  uniqueIds: false,
  debugger: "udt",
};

export const id = "com.narwhster.premiere-twitch-chat";
const name = "Twitch Chat Replay";
const isDevelopment = process.env["MODE"] === "dev";
const webviewOrigin = `http://localhost:${extraPrefs.webviewReloadPort}`;

const manifest: UXP_Manifest = {
  id,
  name,
  version,
  main: "index.html",
  manifestVersion: 5,
  host: [{ app: "premierepro", minVersion: "26.5.0" }],
  entrypoints: [
    {
      type: "panel",
      id: `${id}.main`,
      label: { default: name },
      minimumSize: { width: 280, height: 300 },
      maximumSize: { width: 2000, height: 2000 },
      preferredDockedSize: { width: 340, height: 600 },
      preferredFloatingSize: { width: 340, height: 600 },
    },
  ],
  requiredPermissions: {
    localFileSystem: "request",
    network: {
      domains: [
        "https://gql.twitch.tv",
        "https://usher.ttvnw.net",
        "https://*.cloudfront.net",
        "https://static-cdn.jtvnw.net",
        "https://api.betterttv.net",
        "https://cdn.betterttv.net",
        "https://7tv.io",
        "https://cdn.7tv.app",
        ...(isDevelopment
          ? [
              `ws://localhost:${extraPrefs.hotReloadPort}`,
              webviewOrigin,
              `ws://localhost:${extraPrefs.webviewReloadPort}`,
            ]
          : []),
      ],
    },
    webview: {
      allow: "yes",
      allowLocalRendering: "yes",
      domains: [
        "https://static-cdn.jtvnw.net",
        "https://cdn.betterttv.net",
        "https://cdn.7tv.app",
        ...(isDevelopment ? [webviewOrigin] : []),
      ],
      enableMessageBridge: isDevelopment ? "localAndRemote" : "localOnly",
    },
  },
};

export const config: UXP_Config = {
  manifest,
  ...extraPrefs,
};
