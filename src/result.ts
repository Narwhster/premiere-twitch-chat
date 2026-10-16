export type Service = "Twitch" | "BetterTTV" | "7TV";

export type Failure =
  | { kind: "no-sequence" }
  | { kind: "premiere"; action: string }
  | { kind: "no-folder" }
  | { kind: "offline" }
  | { kind: "server"; service: Service; status: number }
  | { kind: "unreadable"; service: Service }
  | { kind: "vod-unavailable" }
  | { kind: "corrupt-sync" }
  | { kind: "preview-failed" }
  | { kind: "render-failed" };

export type Failed = { ok: false; failure: Failure };
export type Result<T> = { ok: true; value: T } | Failed;

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail(failure: Failure): Failed {
  return { ok: false, failure };
}
