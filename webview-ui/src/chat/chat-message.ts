import { z } from "zod";
import type { Theme } from "../settings/settings";

export type Emote = { source: "twitch"; id: string } | { source: "image"; url: string };
type Fragment = { text: string; emote: Emote | null };

export type ChatMessage = {
  id: string;
  offsetSeconds: number;
  createdAt: number;
  login: string;
  displayName: string;
  color: string;
  badges: { url: string; title: string }[];
  fragments: Fragment[];
};

export type ChatAssets = {
  badges: Map<string, { url: string; title: string }>;
  emotes: Map<string, string>;
};

export function emoteUrl(emote: Emote, theme: Theme): string {
  return emote.source === "twitch"
    ? `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/default/${theme}/2.0`
    : emote.url;
}

export const commentSchema = z.object({
  id: z.string(),
  contentOffsetSeconds: z.number(),
  createdAt: z.string(),
  commenter: z.object({ login: z.string(), displayName: z.string() }).nullable(),
  message: z.object({
    userColor: z.string().nullable(),
    userBadges: z.array(z.object({ setID: z.string(), version: z.string() })).nullable(),
    fragments: z.array(
      z.object({ text: z.string(), emote: z.object({ emoteID: z.string() }).nullable() }),
    ),
  }),
});
export type Comment = z.infer<typeof commentSchema>;

const defaultColors = [
  "#FF0000",
  "#0000FF",
  "#008000",
  "#B22222",
  "#FF7F50",
  "#9ACD32",
  "#FF4500",
  "#2E8B57",
  "#DAA520",
  "#D2691E",
  "#5F9EA0",
  "#1E90FF",
  "#FF69B4",
  "#8A2BE2",
  "#00FF7F",
];

function defaultColor(login: string): string {
  let hash = 0;
  for (const char of login) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return defaultColors[hash % defaultColors.length] ?? "#FF0000";
}

export function toChatMessage(comment: Comment, assets: ChatAssets): ChatMessage | null {
  if (comment.commenter === null) return null;
  const fragments: Fragment[] = [];
  const pushText = (text: string) => {
    const last = fragments.at(-1);
    if (last?.emote === null) last.text += text;
    else fragments.push({ text, emote: null });
  };
  for (const fragment of comment.message.fragments) {
    if (fragment.emote !== null) {
      fragments.push({
        text: fragment.text,
        emote: { source: "twitch", id: fragment.emote.emoteID },
      });
      continue;
    }
    for (const word of fragment.text.split(/(\s+)/)) {
      const url = assets.emotes.get(word);
      if (url === undefined) pushText(word);
      else fragments.push({ text: word, emote: { source: "image", url } });
    }
  }
  return {
    id: comment.id,
    offsetSeconds: comment.contentOffsetSeconds,
    createdAt: Date.parse(comment.createdAt),
    login: comment.commenter.login,
    displayName: comment.commenter.displayName,
    color: comment.message.userColor ?? defaultColor(comment.commenter.login),
    badges: (comment.message.userBadges ?? []).flatMap((badge) => {
      const found = assets.badges.get(`${badge.setID}/${badge.version}`);
      return found === undefined ? [] : [found];
    }),
    fragments: fragments.filter((fragment) => fragment.text !== ""),
  };
}
