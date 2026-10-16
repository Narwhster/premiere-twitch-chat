import * as Comlink from "comlink";
import { createApi } from "./api";
import { ppro } from "./globals";
import "./app.css";

declare global {
  interface HTMLElementTagNameMap {
    // oxlint-disable-next-line effect/noUnknownParameters -- Comlink builds and reads these messages, and the UXP bridge carries any JSON value, so this code has no message type to parse
    webview: HTMLElement & { src: string; postMessage(message: unknown): void };
  }
}

const webview = document.createElement("webview");
webview.className = "webview-ui";
Comlink.expose(
  createApi(),
  Comlink.windowEndpoint({ postMessage: (message) => webview.postMessage(message) }),
);
const isDevelopment = import.meta.env["VITE_BOLT_MODE"] === "dev";
if (isDevelopment) webview.setAttribute("uxpAllowInspector", "true");
webview.src = isDevelopment
  ? `http://localhost:${import.meta.env["VITE_BOLT_WEBVIEW_PORT"]}/`
  : "plugin:/webview-ui/main.html";
document.body.appendChild(webview);
ppro.EventManager.addGlobalEventListener(
  ppro.Constants.ProjectEvent.ACTIVATED,
  (event) => {
    if (event !== undefined && "id" in event)
      webview.postMessage({ type: "project-activated", projectId: event.id });
  },
  true,
);
