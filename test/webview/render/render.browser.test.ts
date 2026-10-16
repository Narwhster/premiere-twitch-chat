import { expect, test } from "vitest";
import { ok } from "../../../src/result";
import "../../../webview-ui/src/app/app.css";
import { planClip } from "../../../webview-ui/src/render/chat-clip";
import type { ChatMessage } from "../../../webview-ui/src/chat/chat-message";
import { drawClip, drawStill } from "../../../webview-ui/src/render/render";
import { defaultSettings } from "../../../webview-ui/src/settings/settings";

function square(color: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 56;
  canvas.height = 56;
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.fillStyle = color;
    context.fillRect(0, 0, 56, 56);
  }
  return canvas.toDataURL("image/png");
}

function emoteLine(index: number, emote: string): ChatMessage {
  return {
    id: `m${index}`,
    offsetSeconds: 0,
    createdAt: 0,
    login: `viewer${index}`,
    displayName: `viewer${index}`,
    color: "#1E90FF",
    badges: [],
    fragments: [
      { text: "hi ", emote: null },
      { text: "cat", emote: { source: "image", url: emote } },
      { text: " there", emote: null },
    ],
  };
}

function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  return (
    canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data ??
    new Uint8ClampedArray()
  );
}

function misplacedPixels(clip: HTMLCanvasElement, still: HTMLCanvasElement): number {
  const a = pixels(clip);
  const b = pixels(still);
  const width = Math.min(clip.width, still.width);
  const height = Math.min(clip.height, still.height);
  const near = (i: number, j: number) =>
    [0, 1, 2, 3].every((c) => Math.abs((a[i + c] ?? 0) - (b[j + c] ?? 0)) <= 128);
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = ((clip.height - height + y) * clip.width + x) * 4;
      const neighbours = [-1, 0, 1].flatMap((dy) =>
        [-1, 0, 1].map((dx) => ((still.height - height + y + dy) * still.width + x + dx) * 4),
      );
      if (!neighbours.some((j) => near(i, j))) count++;
    }
  }
  return count;
}

test("draws animated emotes in a scrolled-up box where a still render of the same lines draws them", async () => {
  const first = square("#ff0000");
  const animated = {
    frames: [
      { src: first, endsAt: 0.5 },
      { src: square("#0000ff"), endsAt: 1 },
    ],
    duration: 1,
  };
  const lines: [ChatMessage, ...ChatMessage[]] = [
    emoteLine(0, first),
    ...Array.from({ length: 5 }, (_, index) => emoteLine(index + 1, first)),
  ];
  const frame = { frameRate: 60, frameHeight: 300 };
  const firstFrames: HTMLCanvasElement[] = [];
  const drawn = await drawClip(
    planClip(lines, false, null),
    new Map([[first, animated]]),
    defaultSettings,
    frame,
    async (hold) => {
      if (hold.from === 0) firstFrames.push(hold.paint());
      return ok(undefined);
    },
  );
  const still = await drawStill(
    lines.map((message) => ({ message, typed: null })),
    defaultSettings,
    frame.frameHeight,
  );
  const [clip] = firstFrames;
  expect({
    drawn: drawn.ok,
    misplaced: still.ok && clip !== undefined ? misplacedPixels(clip, still.value) : null,
  }).toEqual({ drawn: true, misplaced: 0 });
});
