import { expect, test } from "vitest";
import { toChatMessage } from "../../../webview-ui/src/chat/chat-message";

const assets = {
  badges: new Map([["moderator/1", { url: "https://cdn/mod.png", title: "Moderator" }]]),
  emotes: new Map([["wavecat", "https://cdn.7tv.app/emote/wavecat/2x.gif"]]),
};

const comment = {
  id: "c1",
  contentOffsetSeconds: 95,
  createdAt: "2025-03-01T18:01:44.500Z",
  commenter: { login: "pixelfox", displayName: "PixelFox" },
  message: {
    userColor: "#00FF7F",
    userBadges: [
      { setID: "moderator", version: "1" },
      { setID: "unknown", version: "1" },
    ],
    fragments: [
      { text: "Kappa", emote: { emoteID: "25" } },
      { text: " nice run wavecat", emote: null },
    ],
  },
};

test("a message shows its Twitch and third-party emotes and the sender's badges", () => {
  expect(toChatMessage(comment, assets)).toEqual({
    id: "c1",
    offsetSeconds: 95,
    createdAt: Date.parse("2025-03-01T18:01:44.500Z"),
    login: "pixelfox",
    displayName: "PixelFox",
    color: "#00FF7F",
    badges: [{ url: "https://cdn/mod.png", title: "Moderator" }],
    fragments: [
      { text: "Kappa", emote: { source: "twitch", id: "25" } },
      { text: " nice run ", emote: null },
      {
        text: "wavecat",
        emote: { source: "image", url: "https://cdn.7tv.app/emote/wavecat/2x.gif" },
      },
    ],
  });
});

test("a message from a deleted account is left out of the chat", () => {
  expect(toChatMessage({ ...comment, commenter: null }, assets)).toBeNull();
});
