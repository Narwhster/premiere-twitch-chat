import { describe, expect, test } from "vitest";
import { targetTrack } from "../../src/timeline";

const recording = { projectItemId: "rec", trackIndex: 0, start: 0, end: 600, inPoint: 0, speed: 1 };
const overlay = { ...recording, projectItemId: "chat", trackIndex: 2, start: 130, end: 135 };

describe("a placed message never covers a clip on the timeline", () => {
  test("goes on the track above the highest clip it overlaps", () => {
    expect(targetTrack([recording, overlay], 132, 137)).toBe(3);
  });

  test("a clip that ends where the message starts doesn't count as overlapping", () => {
    expect(targetTrack([recording, overlay], 135, 140)).toBe(1);
  });
});
