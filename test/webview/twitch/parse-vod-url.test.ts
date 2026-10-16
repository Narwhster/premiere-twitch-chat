import { describe, expect, test } from "vitest";
import { parseVodUrl } from "../../../webview-ui/src/twitch/parse-vod-url";

describe("pasting a Twitch VOD link or ID finds the VOD", () => {
  test.each([
    "https://www.twitch.tv/videos/1234567890",
    "https://www.twitch.tv/videos/1234567890?t=1h2m3s",
    "  https://www.twitch.tv/videos/1234567890/  ",
    "http://twitch.tv/videos/1234567890#chat",
    "twitch.tv/videos/1234567890",
    "m.twitch.tv/videos/1234567890",
    "1234567890",
  ])("reads the VOD ID from %j", (input) => {
    expect(parseVodUrl(input)).toBe("1234567890");
  });

  test("keeps an ID longer than a safe integer as written", () => {
    expect(parseVodUrl("0099999999999999999999")).toBe("0099999999999999999999");
  });

  test.each([
    "",
    "https://www.twitch.tv/somechannel",
    "https://clips.twitch.tv/ExampleClip",
    "https://www.twitch.tv/videos/",
    "https://www.twitch.tv/videos/1234567890/extra",
    "https://www.twitch.tv.example.com/videos/1234567890",
    "https://example.com/twitch.tv/videos/1234567890",
    "ftp://www.twitch.tv/videos/1234567890",
    "https://[",
  ])("finds no VOD in %j", (input) => {
    expect(parseVodUrl(input)).toBeNull();
  });
});
