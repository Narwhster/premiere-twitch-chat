import { expect, test } from "vitest";
import { pickVariant } from "../../../webview-ui/src/twitch/pick-variant";

test("the sync preview plays the smallest video at least 360 pixels tall", () => {
  const master = [
    "#EXTM3U",
    '#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080,VIDEO="chunked"',
    "https://vod.example.net/abc/chunked/index-dvr.m3u8",
    '#EXT-X-STREAM-INF:BANDWIDTH=630000,RESOLUTION=640x360,VIDEO="360p30"',
    "https://vod.example.net/abc/360p30/index-dvr.m3u8",
    '#EXT-X-STREAM-INF:BANDWIDTH=230000,RESOLUTION=284x160,VIDEO="160p30"',
    "https://vod.example.net/abc/160p30/index-dvr.m3u8",
  ].join("\n");
  expect(pickVariant(master, "https://usher.ttvnw.net/vod/v2/1.m3u8")).toBe(
    "https://vod.example.net/abc/360p30/index-dvr.m3u8",
  );
});
