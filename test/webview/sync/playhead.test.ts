import { describe, expect, test } from "vitest";
import { isPlaying } from "../../../webview-ui/src/sync/playhead";

describe("the sync preview plays only while Premiere plays", () => {
  test("a playhead that moved as far as the clock is playing", () => {
    expect(isPlaying({ position: 10, atSeconds: 1 }, { position: 10.1, atSeconds: 1.1 })).toBe(
      true,
    );
  });

  test("a playhead that stayed put is paused", () => {
    expect(isPlaying({ position: 10, atSeconds: 1 }, { position: 10, atSeconds: 1.1 })).toBe(false);
  });

  test("a jump is a seek, not playback", () => {
    expect(isPlaying({ position: 10, atSeconds: 1 }, { position: 12, atSeconds: 1.1 })).toBe(false);
  });

  test("a playhead that moved backward is paused", () => {
    expect(isPlaying({ position: 10, atSeconds: 1 }, { position: 9.9, atSeconds: 1.1 })).toBe(
      false,
    );
  });
});
