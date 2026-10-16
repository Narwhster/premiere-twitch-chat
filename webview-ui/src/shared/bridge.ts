import * as Comlink from "comlink";
import { useSyncExternalStore } from "react";
import { z } from "zod";
import type { API } from "../../../src/api";

declare global {
  interface Window {
    // oxlint-disable-next-line effect/noUnknownParameters -- Comlink builds and reads these messages, and the UXP bridge carries any JSON value, so this code has no message type to parse
    uxpHost: { postMessage(message: unknown): void };
  }
}

export const api = Comlink.wrap<API>(
  Comlink.windowEndpoint({
    postMessage: (message) => window.uxpHost.postMessage(message),
  }),
);

const activationSchema = z.object({ type: z.literal("project-activated"), projectId: z.string() });

function watchActiveProject() {
  let currentProject: string | null = null;
  const listeners = new Set<() => void>();
  window.addEventListener("message", (event) => {
    const activation = activationSchema.safeParse(event.data);
    if (!activation.success) return;
    currentProject = activation.data.projectId;
    for (const listener of listeners) listener();
  });
  return {
    snapshot: () => currentProject,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const activeProject = watchActiveProject();

export function useActiveProject(): string | null {
  return useSyncExternalStore(activeProject.subscribe, activeProject.snapshot);
}
