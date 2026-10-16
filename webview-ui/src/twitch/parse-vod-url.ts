const twitchHosts = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);

export function parseVodUrl(input: string): string | null {
  const value = input.trim();
  if (/^\d+$/.test(value)) return value;
  const url = URL.parse(/^https?:\/\//.test(value) ? value : `https://${value}`);
  if (url === null || !twitchHosts.has(url.hostname)) return null;
  return /^\/videos\/(\d+)\/?$/.exec(url.pathname)?.[1] ?? null;
}
