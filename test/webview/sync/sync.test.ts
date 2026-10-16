import { describe, expect, test } from "vitest";
import { sourceTimeAt } from "../../../webview-ui/src/sync/sync";

const clip = { projectItemId: "rec", trackIndex: 0, start: 10, end: 20, inPoint: 600, speed: 1 };

describe("the chat follows the playhead through the recording's clip", () => {
  test("maps the playhead through the clip's in point", () => {
    expect(sourceTimeAt([clip], "rec", 12.5)).toBe(602.5);
  });

  test("accounts for clip speed", () => {
    expect(sourceTimeAt([{ ...clip, speed: 2 }], "rec", 12.5)).toBe(605);
  });

  test("follows the recording on the topmost track", () => {
    const top = { ...clip, trackIndex: 2, inPoint: 0 };
    const other = { ...clip, trackIndex: 3, projectItemId: "other" };
    expect(sourceTimeAt([clip, top, other], "rec", 15)).toBe(5);
  });

  test("finds nothing once the playhead leaves the recording", () => {
    expect(sourceTimeAt([clip], "rec", 20)).toBeNull();
  });
});
