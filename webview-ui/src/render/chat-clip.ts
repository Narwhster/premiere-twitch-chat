import type { ChatMessage } from "../chat/chat-message";
import { messageLength } from "../chat/ChatLine";

export type Picture = { frames: { src: string; endsAt: number }[]; duration: number };
export type ClipLine = { message: ChatMessage; appearsAt: number; length: number };
export type ShownLine = { message: ChatMessage; typed: number | null };
export type ClipPlan = {
  lines: ClipLine[];
  seconds: number;
  typing: boolean;
  limit: number | null;
};
export type Hold = { from: number; frames: number };

const charsPerSecond = 40;
const holdSeconds = 5;

export function frameAt(picture: Picture, seconds: number): number {
  const looped = seconds % picture.duration;
  return picture.frames.findIndex((frame) => looped < frame.endsAt);
}

export function planClip(
  selected: [ChatMessage, ...ChatMessage[]],
  typing: boolean,
  limit: number | null,
): ClipPlan {
  const startedAt = Math.min(...selected.map((message) => message.createdAt));
  const lines = selected
    .map((message) => ({
      message,
      appearsAt: (message.createdAt - startedAt) / 1000,
      length: messageLength(message),
    }))
    .sort((a, b) => a.appearsAt - b.appearsAt);
  const doneAt = Math.max(
    ...lines.map((line) => line.appearsAt + (typing ? line.length / charsPerSecond : 0)),
  );
  return { lines, seconds: doneAt + holdSeconds, typing, limit };
}

export function frameCount(plan: ClipPlan, fps: number): number {
  return Math.ceil(plan.seconds * fps);
}

export function linesAt(plan: ClipPlan, seconds: number): ShownLine[] {
  const shown = plan.lines
    .filter((line) => line.appearsAt <= seconds)
    .map((line) => ({
      message: line.message,
      typed: plan.typing
        ? Math.min(line.length, Math.floor((seconds - line.appearsAt) * charsPerSecond))
        : null,
    }));
  return plan.limit === null ? shown : shown.slice(-plan.limit);
}

export function linesKey(plan: ClipPlan, seconds: number): string {
  return linesAt(plan, seconds)
    .map((line) => `${line.message.id}:${line.typed ?? ""}`)
    .join(" ");
}

export function holds(keys: string[]): Hold[] {
  const runs: Hold[] = [];
  keys.forEach((key, index) => {
    const last = runs.at(-1);
    if (last !== undefined && keys[last.from] === key) last.frames++;
    else runs.push({ from: index, frames: 1 });
  });
  return runs;
}

export function tallestRun(heights: number[], limit: number | null): number {
  const size = Math.min(limit ?? heights.length, heights.length);
  return Math.max(
    0,
    ...heights
      .slice(size - 1)
      .map((_, index) => heights.slice(index, index + size).reduce((sum, h) => sum + h, 0)),
  );
}
