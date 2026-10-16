import { emoteUrl } from "./chat-message";
import type { ChatMessage } from "./chat-message";
import type { Theme } from "../settings/settings";

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

function characters(text: string): string[] {
  return Array.from(new Intl.Segmenter().segment(text), (part) => part.segment);
}

export function messageLength(message: ChatMessage): number {
  return message.fragments.reduce(
    (sum, f) => sum + (f.emote === null ? characters(f.text).length : 1),
    0,
  );
}

function typedFragments(message: ChatMessage, typed: number): ChatMessage["fragments"] {
  const shown = [];
  let budget = typed;
  for (const fragment of message.fragments) {
    if (budget <= 0) break;
    const parts =
      fragment.emote === null ? characters(fragment.text).slice(0, budget) : [fragment.text];
    shown.push({ ...fragment, text: parts.join("") });
    budget -= parts.length;
  }
  return shown;
}

export function ChatLine({
  message,
  theme,
  typed,
}: {
  message: ChatMessage;
  theme: Theme;
  typed: number | null;
}) {
  const fragments = (typed === null ? message.fragments : typedFragments(message, typed)).map(
    (fragment, index) =>
      fragment.emote === null ? (
        <span key={index}>{fragment.text}</span>
      ) : (
        <img
          key={index}
          className="emote"
          src={emoteUrl(fragment.emote, theme)}
          alt={fragment.text}
        />
      ),
  );
  const login = message.displayName.toLowerCase() === message.login ? null : message.login;
  return (
    <>
      {message.badges.map((badge, index) => (
        <img key={index} className="badge" src={badge.url} alt={badge.title} />
      ))}
      <span className="name" style={{ color: message.color }}>
        {message.displayName}
        {login !== null && <span className="login"> ({login})</span>}
      </span>
      <span className="colon">:</span>
      {fragments}
    </>
  );
}
