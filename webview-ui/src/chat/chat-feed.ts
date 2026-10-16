import type { Failure } from "../../../src/result";
import type { ChatMessage } from "./chat-message";

export type ChatRun = {
  loadedFrom: number;
  loadedUntil: number;
  nextCursor: string | null;
  requestedSecond: number;
  messages: ChatMessage[];
};

export type ChatRequest =
  | { kind: "offset"; seconds: number }
  | { kind: "cursor"; cursor: string; run: ChatRun };

export type ChatPage = { messages: ChatMessage[]; next: string | null };
export type ChatLoad =
  | { kind: "idle"; failure: Failure | null }
  | { kind: "loading"; request: ChatRequest; failure: Failure | null }
  | { kind: "failed"; failure: Failure };
export type ChatFeed = { run: ChatRun | null; load: ChatLoad };
export type FeedEvent =
  | { kind: "seek"; time: number; lengthSeconds: number }
  | { kind: "loaded"; request: ChatRequest; page: ChatPage }
  | { kind: "failed"; failure: Failure }
  | { kind: "retry" };

const shownMessages = 150;
const prefetchSeconds = 15;
const followSeconds = 60;

export function nextRequest(
  run: ChatRun | null,
  time: number,
  lengthSeconds: number,
): ChatRequest | null {
  const jumped =
    run === null ||
    time < run.loadedFrom ||
    time > Math.max(run.loadedUntil, run.requestedSecond) + followSeconds;
  if (jumped) {
    const seconds = Math.max(0, Math.floor(time));
    return seconds < lengthSeconds ? { kind: "offset", seconds } : null;
  }
  return run.nextCursor !== null && time >= run.loadedUntil - prefetchSeconds
    ? { kind: "cursor", cursor: run.nextCursor, run }
    : null;
}

export function applyPage(request: ChatRequest, page: ChatPage): ChatRun {
  const first = page.messages[0]?.offsetSeconds;
  const last = page.messages.at(-1)?.offsetSeconds;
  if (request.kind === "offset") {
    return {
      loadedFrom: Math.min(request.seconds, first ?? request.seconds),
      loadedUntil: page.next === null ? Number.POSITIVE_INFINITY : (last ?? request.seconds),
      nextCursor: page.next,
      requestedSecond: request.seconds,
      messages: page.messages,
    };
  }
  const { run } = request;
  const byId = new Map([...run.messages, ...page.messages].map((message) => [message.id, message]));
  return {
    ...run,
    loadedUntil: page.next === null ? Number.POSITIVE_INFINITY : (last ?? run.loadedUntil),
    nextCursor: page.next,
    messages: [...byId.values()].sort((a, b) => a.createdAt - b.createdAt),
  };
}

export function covers(run: ChatRun | null, time: number): run is ChatRun {
  return run !== null && time >= run.loadedFrom && time <= run.loadedUntil;
}

export function updateFeed(feed: ChatFeed, event: FeedEvent): ChatFeed {
  switch (event.kind) {
    case "seek": {
      const { load } = feed;
      if (load.kind !== "idle") return feed;
      const request = nextRequest(feed.run, event.time, event.lengthSeconds);
      if (request !== null) {
        return { ...feed, load: { kind: "loading", request, failure: load.failure } };
      }
      return load.failure === null ? feed : { ...feed, load: { kind: "idle", failure: null } };
    }
    case "loaded":
      return { run: applyPage(event.request, event.page), load: { kind: "idle", failure: null } };
    case "failed":
      return { ...feed, load: { kind: "failed", failure: event.failure } };
    case "retry":
      return { ...feed, load: { kind: "idle", failure: feed.load.failure } };
  }
}

export function shownFailure(feed: ChatFeed, time: number): Failure | null {
  return covers(feed.run, time) ? null : feed.load.failure;
}

export function visibleMessages(run: ChatRun | null, time: number): ChatMessage[] {
  if (!covers(run, time)) return [];
  return run.messages.filter((message) => message.offsetSeconds <= time).slice(-shownMessages);
}
