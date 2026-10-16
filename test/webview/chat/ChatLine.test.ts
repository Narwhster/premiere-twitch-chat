import { expect, test } from "vitest";
import type { ChatMessage } from "../../../webview-ui/src/chat/chat-message";
import { messageLength } from "../../../webview-ui/src/chat/ChatLine";

test("Typing types an emote, or an emoji with a skin tone, as one character", () => {
  const message: ChatMessage = {
    id: "m1",
    offsetSeconds: 0,
    createdAt: 0,
    login: "viewer",
    displayName: "Viewer",
    color: "#fff",
    badges: [],
    fragments: [
      { text: "hi 👍🏾 ", emote: null },
      {
        text: "wavecat",
        emote: { source: "image", url: "https://cdn.7tv.app/emote/wavecat/2x.gif" },
      },
    ],
  };
  expect(messageLength(message)).toBe(6);
});
