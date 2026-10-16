import { describe, expect, test } from "vitest";
import {
  movHeader,
  movHeaderSize,
  movieBox,
  movTiming,
} from "../../../webview-ui/src/render/png-mov";

function body(bytes: Uint8Array, path: string[]): DataView {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 0; at < bytes.length; at += view.getUint32(at)) {
    const size = view.getUint32(at);
    if (new TextDecoder().decode(bytes.subarray(at + 4, at + 8)) !== path[0]) continue;
    const inside = bytes.subarray(at + 8, at + size);
    return path.length === 1
      ? new DataView(inside.buffer, inside.byteOffset, inside.byteLength)
      : body(inside, path.slice(1));
  }
  return new DataView(new ArrayBuffer(0));
}

const table = ["moov", "trak", "mdia", "minf", "stbl"];
const ntsc = movTiming(254_016_000_000, 10_594_584_000);
const threeFrames = movieBox(680, 1080, ntsc, [
  { offset: 36, size: 100 },
  { offset: 36, size: 100 },
  { offset: 136, size: 50 },
]);

describe("Premiere imports a placed .mov with its frame rate and transparency", () => {
  test("keeps Premiere's frame rates exact in the movie's time units", () => {
    expect([
      movTiming(254_016_000_000, 4_233_600_000),
      ntsc,
      movTiming(254_016_000_000, 20_321_280_000),
    ]).toEqual([
      { timescale: 60, frameDuration: 1 },
      { timescale: 24000, frameDuration: 1001 },
      { timescale: 25, frameDuration: 2 },
    ]);
  });

  test("starts the file with a QuickTime file type and a 64-bit mdat header up to the last PNG", () => {
    expect([movHeaderSize, Buffer.from(movHeader(1036)).toString("hex")]).toEqual([
      36,
      "0000001466747970717420200000020071742020000000016d64617400000000000003f8",
    ]);
  });

  test("describes 32-bit PNG frames tagged BT.709 so Premiere keeps the transparency", () => {
    const description = body(threeFrames, [...table, "stsd"]);
    const entry = new Uint8Array(description.buffer, description.byteOffset + 8, 104);
    expect(Buffer.from(entry).toString("hex")).toBe(
      "00000068706e672000000000000000010000000000000000000000000000000002a80438004800000048000000000000000100000000000000000000000000000000000000000000000000000000000000000020ffff00000012636f6c726e636c63000100010001",
    );
  });

  test("gives every frame its own sample and points repeated frames at the same PNG", () => {
    const sizes = body(threeFrames, [...table, "stsz"]);
    const offsets = body(threeFrames, [...table, "co64"]);
    const times = body(threeFrames, [...table, "stts"]);
    const media = body(threeFrames, ["moov", "trak", "mdia", "mdhd"]);
    expect({
      sizes: [0, 1, 2].map((index) => sizes.getUint32(12 + 4 * index)),
      offsets: [0, 1, 2].map((index) => Number(offsets.getBigUint64(8 + 8 * index))),
      frames: times.getUint32(8),
      frameDuration: times.getUint32(12),
      timescale: media.getUint32(12),
      duration: media.getUint32(16),
    }).toEqual({
      sizes: [100, 100, 50],
      offsets: [36, 36, 136],
      frames: 3,
      frameDuration: 1001,
      timescale: 24000,
      duration: 3003,
    });
  });
});
