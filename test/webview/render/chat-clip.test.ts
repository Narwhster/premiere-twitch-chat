import { describe, expect, test } from "vitest";
import type { ChatMessage } from "../../../webview-ui/src/chat/chat-message";
import {
  frameAt,
  holds,
  linesAt,
  linesKey,
  planClip,
  tallestRun,
} from "../../../webview-ui/src/render/chat-clip";

function message(id: string, createdAt: number, text: string): ChatMessage {
  return {
    id,
    offsetSeconds: Math.floor(createdAt / 1000),
    createdAt,
    login: id,
    displayName: id,
    color: "#1E90FF",
    badges: [],
    fragments: [{ text, emote: null }],
  };
}

const gif = {
  frames: [
    { src: "frame-0", endsAt: 0.1 },
    { src: "frame-1", endsAt: 0.2 },
    { src: "frame-2", endsAt: 0.3 },
  ],
  duration: 0.3,
};

const hello = message("a", 10_000, "hello");
const later = message("b", 12_000, "hi");
const third = message("c", 13_000, "yo");

describe("animated emotes play in placed clips", () => {
  test("shows the frame on screen at each moment and loops past the end", () => {
    expect([frameAt(gif, 0.15), frameAt(gif, 0.35)]).toEqual([1, 0]);
  });

  test("a still emote stays on its only frame", () => {
    expect(frameAt({ frames: [{ src: "png", endsAt: Infinity }], duration: Infinity }, 42)).toBe(0);
  });
});

describe("placed messages appear at the pace they were sent", () => {
  test("each message appears when it was sent and the last one stays up for 5 seconds", () => {
    expect(planClip([later, hello], false, null)).toEqual({
      lines: [
        { message: hello, appearsAt: 0, length: 5 },
        { message: later, appearsAt: 2, length: 2 },
      ],
      seconds: 7,
      typing: false,
      limit: null,
    });
  });

  test("messages sent minutes apart make one long clip", () => {
    expect(planClip([hello, message("c", 190_000, "late")], false, null).seconds).toBe(185);
  });

  test("a message shows only once its moment comes", () => {
    expect(linesAt(planClip([hello, later], false, null), 1)).toEqual([
      { message: hello, typed: null },
    ]);
  });

  test("with a line limit, the oldest lines leave the top", () => {
    expect(linesAt(planClip([hello, later, third], false, 2), 4)).toEqual([
      { message: later, typed: null },
      { message: third, typed: null },
    ]);
  });
});

describe("Typing types each message out", () => {
  test("types 40 characters a second", () => {
    const reply = message("b", 12_000, "hello there");
    expect(linesAt(planClip([hello, reply], true, null), 2.1)).toEqual([
      { message: hello, typed: 5 },
      { message: reply, typed: 4 },
    ]);
  });

  test("the clip lasts until the longest message finishes typing", () => {
    const long = message("c", 10_000, "x".repeat(400));
    expect(planClip([long, later], true, null).seconds).toBe(15);
  });
});

describe("a .mov stores each distinct picture once", () => {
  test("holds each run of identical frames as one picture", () => {
    expect(holds(["a", "a", "a", "b", "c", "c", "a"])).toEqual([
      { from: 0, frames: 3 },
      { from: 3, frames: 1 },
      { from: 4, frames: 2 },
      { from: 6, frames: 1 },
    ]);
  });

  test("a line leaving the top at the line limit starts a new picture", () => {
    const plan = planClip([hello, later, third], false, 2);
    expect(holds([2.5, 3.5, 4].map((seconds) => linesKey(plan, seconds)))).toEqual([
      { from: 0, frames: 1 },
      { from: 1, frames: 2 },
    ]);
  });

  test("each typed character starts a new picture", () => {
    const plan = planClip([hello], true, null);
    expect(holds([0.05, 0.06, 0.1].map((seconds) => linesKey(plan, seconds)))).toEqual([
      { from: 0, frames: 2 },
      { from: 2, frames: 1 },
    ]);
  });
});

describe("a placed clip is tall enough for every moment of it", () => {
  test("fits the tallest run of lines that can show at once", () => {
    expect([tallestRun([30, 52, 30, 74, 30], 2), tallestRun([30, 52, 30], null)]).toEqual([
      104, 112,
    ]);
  });

  test("fits every line when there are fewer lines than the limit", () => {
    expect(tallestRun([30, 52], 10)).toBe(82);
  });
});
