import type { Failure } from "../../../src/result";
import type { EmoteProvider } from "../twitch/twitch";

export function failureText(failure: Failure): string {
  switch (failure.kind) {
    case "no-sequence":
      return "Open a sequence first.";
    case "premiere":
      return `Premiere couldn't ${failure.action}.`;
    case "no-folder":
      return "Choose a folder for the chat renders first.";
    case "offline":
      return "Couldn't connect. Check your internet connection.";
    case "server":
      return `${failure.service} returned error ${failure.status}. Try again later.`;
    case "unreadable":
      return `${failure.service} sent a reply the panel can't read.`;
    case "vod-unavailable":
      return "This VOD doesn't exist or isn't public.";
    case "corrupt-sync":
      return "The saved sync can't be read. Sync the VOD again.";
    case "preview-failed":
      return "Can't play the VOD preview.";
    case "render-failed":
      return "Couldn't draw the chat messages.";
  }
}

export function missingEmotesHint(missing: EmoteProvider[]): string {
  if (missing.length === 0) return "";
  return `${new Intl.ListFormat("en", { type: "conjunction" }).format(missing)} emotes didn't load.`;
}
