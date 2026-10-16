import { describe, expect, test } from "vitest";
import {
  applyPage,
  nextRequest,
  shownFailure,
  updateFeed,
  visibleMessages,
} from "../../../webview-ui/src/chat/chat-feed";
import type { ChatFeed, ChatRun } from "../../../webview-ui/src/chat/chat-feed";
import type { ChatMessage } from "../../../webview-ui/src/chat/chat-message";

function message(id: string, offsetSeconds: number): ChatMessage {
  return {
    id,
    offsetSeconds,
    createdAt: offsetSeconds * 1000,
    login: "viewer",
    displayName: "Viewer",
    color: "#1E90FF",
    badges: [],
    fragments: [{ text: id, emote: null }],
  };
}

const vodSeconds = 3600;
const run: ChatRun = {
  loadedFrom: 60,
  loadedUntil: 300,
  nextCursor: "page-2",
  requestedSecond: 120,
  messages: [message("a", 60), message("b", 120), message("c", 300)],
};
const offline = { kind: "offline" } as const;

describe("the chat loads as the playhead moves through the VOD", () => {
  test("loads from the playhead's second when nothing is loaded", () => {
    expect(nextRequest(null, 120.6, vodSeconds)).toEqual({ kind: "offset", seconds: 120 });
  });

  test("loads the next page only when the playhead nears the end of the loaded chat", () => {
    expect([nextRequest(run, 200, vodSeconds), nextRequest(run, 290, vodSeconds)]).toEqual([
      null,
      { kind: "cursor", cursor: "page-2", run },
    ]);
  });

  test("keeps following the next page when a page ends before the second it was asked for", () => {
    const short = { ...run, loadedUntil: 100, requestedSecond: 120 };
    expect(nextRequest(short, 120, vodSeconds)).toEqual({
      kind: "cursor",
      cursor: "page-2",
      run: short,
    });
  });

  test("loads from the playhead after a jump back or far ahead", () => {
    expect([nextRequest(run, 30, vodSeconds), nextRequest(run, 2000, vodSeconds)]).toEqual([
      { kind: "offset", seconds: 30 },
      { kind: "offset", seconds: 2000 },
    ]);
  });

  test("loads nothing past the end of the VOD", () => {
    expect(nextRequest(null, vodSeconds, vodSeconds)).toBeNull();
  });

  test("loads nothing more after the last page, however far the playhead plays", () => {
    const request = { kind: "offset", seconds: 3500 } as const;
    const messages = [message("z", 3510)];
    expect([
      nextRequest(applyPage(request, { messages, next: null }), 3599, vodSeconds),
      nextRequest(applyPage(request, { messages, next: "more" }), 3599, vodSeconds),
    ]).toEqual([null, { kind: "offset", seconds: 3599 }]);
  });

  test("loads nothing more while a page is loading", () => {
    const loading: ChatFeed = {
      run: null,
      load: { kind: "loading", request: { kind: "offset", seconds: 120 }, failure: null },
    };
    expect(updateFeed(loading, { kind: "seek", time: 400, lengthSeconds: vodSeconds })).toBe(
      loading,
    );
  });

  test("a page that overlaps the loaded chat doesn't show a message twice", () => {
    const page = { messages: [message("c", 300), message("d", 310)], next: "page-3" };
    const next = applyPage({ kind: "cursor", cursor: "page-2", run }, page);
    expect(visibleMessages(next, 310).map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("the chat shows the messages up to the playhead", () => {
  test("shows the messages sent by the playhead's moment", () => {
    expect(visibleMessages(run, 200).map((m) => m.id)).toEqual(["a", "b"]);
  });

  test("shows nothing while the playhead is outside the loaded chat", () => {
    expect(visibleMessages(run, 400)).toEqual([]);
  });

  test("a busy chat shows its latest 150 messages", () => {
    const busy = { ...run, messages: Array.from({ length: 200 }, (_, i) => message(`m${i}`, 100)) };
    expect(
      visibleMessages(busy, 100)
        .map((m) => m.id)
        .slice(0, 2),
    ).toEqual(["m50", "m51"]);
  });
});

describe("a failed load shows its error until the chat is back", () => {
  test("keeps showing the error while it retries", () => {
    const failed: ChatFeed = { run, load: { kind: "failed", failure: offline } };
    const retrying = updateFeed(updateFeed(failed, { kind: "retry" }), {
      kind: "seek",
      time: 2000,
      lengthSeconds: vodSeconds,
    });
    expect([retrying.load.kind, shownFailure(retrying, 2000)]).toEqual(["loading", offline]);
  });

  test("clears the error once a page loads", () => {
    const loading: ChatFeed = {
      run: null,
      load: { kind: "loading", request: { kind: "offset", seconds: 60 }, failure: offline },
    };
    const page = { messages: [message("a", 60)], next: null };
    expect(
      updateFeed(loading, { kind: "loaded", request: { kind: "offset", seconds: 60 }, page }),
    ).toEqual({
      run: {
        loadedFrom: 60,
        loadedUntil: Number.POSITIVE_INFINITY,
        nextCursor: null,
        requestedSecond: 60,
        messages: [message("a", 60)],
      },
      load: { kind: "idle", failure: null },
    });
  });

  test("drops the error when the playhead moves where there is nothing to load", () => {
    const retried: ChatFeed = { run, load: { kind: "idle", failure: offline } };
    expect(updateFeed(retried, { kind: "seek", time: 4000, lengthSeconds: vodSeconds })).toEqual({
      run,
      load: { kind: "idle", failure: null },
    });
  });

  test("shows the error only while the playhead is outside the loaded chat", () => {
    const failed: ChatFeed = { run, load: { kind: "failed", failure: offline } };
    expect([shownFailure(failed, 310), shownFailure(failed, 200)]).toEqual([offline, null]);
  });
});
