import { z } from "zod";
import { fail, ok } from "../../../src/result";
import type { Result, Service } from "../../../src/result";
import { api } from "../shared/bridge";
import { commentSchema } from "../chat/chat-message";
import type { ChatAssets, Comment } from "../chat/chat-message";
import { parseJson } from "../shared/parse-json";
import { pickVariant } from "./pick-variant";

export type Vod = {
  id: string;
  title: string;
  channelId: string;
  lengthSeconds: number;
  playlistUrl: string;
};

export type EmoteProvider = "BetterTTV" | "FrankerFaceZ" | "7TV";
export type PageRequest = { kind: "offset"; seconds: number } | { kind: "cursor"; cursor: string };
export type CommentPage = { comments: Comment[]; next: string | null };

const webClientId = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const androidAppClientId = "kd1unb4b3q4t58fwlpcbzcbnm76a8fp";

async function getJson<T>(
  service: Service,
  schema: z.ZodType<T>,
  url: string,
  init: Parameters<typeof api.fetchText>[1] = {},
): Promise<Result<T>> {
  const response = await api.fetchText(url, init);
  if (!response.ok) return response;
  const { status, body } = response.value;
  if (status !== 200) return fail({ kind: "server", service, status });
  const json = parseJson(schema, body);
  return json === null ? fail({ kind: "unreadable", service }) : ok(json);
}

type GqlBody =
  | { query: string; variables: { id: string } }
  | {
      operationName: string;
      variables:
        | { videoID: string; contentOffsetSeconds: number }
        | { videoID: string; cursor: string };
      extensions: { persistedQuery: { version: number; sha256Hash: string } };
    };

function gql<T>(schema: z.ZodType<T>, body: GqlBody, clientId = webClientId): Promise<Result<T>> {
  return getJson("Twitch", schema, "https://gql.twitch.tv/gql", {
    method: "POST",
    headers: { "Client-ID": clientId, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const videoSchema = z.object({
  data: z.object({
    video: z
      .object({
        title: z.string(),
        lengthSeconds: z.number(),
        owner: z.object({ id: z.string() }),
      })
      .nullable(),
    videoPlaybackAccessToken: z.object({ value: z.string(), signature: z.string() }).nullable(),
  }),
});

export async function loadVod(id: string): Promise<Result<Vod>> {
  const response = await gql(videoSchema, {
    query: `query($id: ID!) {
      video(id: $id) { title lengthSeconds owner { id } }
      videoPlaybackAccessToken(id: $id, params: { platform: "web", playerBackend: "mediaplayer", playerType: "embed" }) { value signature }
    }`,
    variables: { id },
  });
  if (!response.ok) return response;
  const { video, videoPlaybackAccessToken: token } = response.value.data;
  if (video === null || token === null) return fail({ kind: "vod-unavailable" });
  const masterUrl =
    `https://usher.ttvnw.net/vod/v2/${id}.m3u8?allow_source=true&platform=web&player_backend=mediaplayer` +
    `&supported_codecs=h264&sig=${encodeURIComponent(token.signature)}&token=${encodeURIComponent(token.value)}`;
  const master = await api.fetchText(masterUrl);
  if (!master.ok) return master;
  if (master.value.status !== 200) {
    return fail({ kind: "server", service: "Twitch", status: master.value.status });
  }
  const playlistUrl = pickVariant(master.value.body, masterUrl);
  if (playlistUrl === null) return fail({ kind: "vod-unavailable" });
  return ok({
    id,
    title: video.title,
    channelId: video.owner.id,
    lengthSeconds: video.lengthSeconds,
    playlistUrl,
  });
}

const badgeSchema = z.object({
  imageURL: z.string(),
  title: z.string(),
  setID: z.string(),
  version: z.string(),
});
const badgesSchema = z.object({
  data: z.object({
    badges: z.array(badgeSchema),
    user: z.object({ broadcastBadges: z.array(badgeSchema) }).nullable(),
  }),
});
const bttvSchema = z.array(z.object({ id: z.string(), code: z.string() }));
const bttvUserSchema = z.object({ channelEmotes: bttvSchema, sharedEmotes: bttvSchema });
const ffzSchema = z.array(
  z.object({ code: z.string(), images: z.record(z.string(), z.string().nullable()) }),
);
const sevenTvEmotesSchema = z
  .array(
    z.object({
      name: z.string(),
      data: z.object({ animated: z.boolean(), host: z.object({ url: z.string() }) }),
    }),
  )
  .nullable();
const sevenTvSetSchema = z.object({ emotes: sevenTvEmotesSchema });
const sevenTvUserSchema = z.object({
  emote_set: z.object({ emotes: sevenTvEmotesSchema }).nullable(),
});

type EmoteList = [code: string, url: string][];

function bttvEmotes(emotes: z.infer<typeof bttvSchema>): EmoteList {
  return emotes.map((emote) => [emote.code, `https://cdn.betterttv.net/emote/${emote.id}/2x`]);
}

function ffzEmotes(emotes: z.infer<typeof ffzSchema>): EmoteList {
  return emotes.flatMap((emote) => {
    const url = emote.images["2x"] ?? emote.images["1x"] ?? null;
    return url === null ? [] : [[emote.code, url]];
  });
}

function sevenTvEmotes(emotes: z.infer<typeof sevenTvEmotesSchema>): EmoteList {
  return (emotes ?? []).map((emote) => [
    emote.name,
    `https:${emote.data.host.url}/2x.${emote.data.animated ? "gif" : "webp"}`,
  ]);
}

async function emoteList<T>(
  service: Service,
  schema: z.ZodType<T>,
  url: string,
  toList: (value: T) => EmoteList,
): Promise<Result<EmoteList>> {
  const result = await getJson(service, schema, url);
  return result.ok ? ok(toList(result.value)) : result;
}

async function emptyForUnknownChannel(
  list: Promise<Result<EmoteList>>,
): Promise<Result<EmoteList>> {
  const result = await list;
  const unknownChannel =
    !result.ok && result.failure.kind === "server" && result.failure.status === 404;
  return unknownChannel ? ok([]) : result;
}

function emoteSources(
  channelId: string,
): { provider: EmoteProvider; list: Promise<Result<EmoteList>> }[] {
  const bttv = "https://api.betterttv.net/3/cached";
  return [
    {
      provider: "BetterTTV",
      list: emoteList("BetterTTV", bttvSchema, `${bttv}/emotes/global`, bttvEmotes),
    },
    {
      provider: "BetterTTV",
      list: emptyForUnknownChannel(
        emoteList("BetterTTV", bttvUserSchema, `${bttv}/users/twitch/${channelId}`, (user) =>
          bttvEmotes([...user.channelEmotes, ...user.sharedEmotes]),
        ),
      ),
    },
    {
      provider: "FrankerFaceZ",
      list: emoteList("BetterTTV", ffzSchema, `${bttv}/frankerfacez/emotes/global`, ffzEmotes),
    },
    {
      provider: "FrankerFaceZ",
      list: emoteList(
        "BetterTTV",
        ffzSchema,
        `${bttv}/frankerfacez/users/twitch/${channelId}`,
        ffzEmotes,
      ),
    },
    {
      provider: "7TV",
      list: emoteList("7TV", sevenTvSetSchema, "https://7tv.io/v3/emote-sets/global", (set) =>
        sevenTvEmotes(set.emotes),
      ),
    },
    {
      provider: "7TV",
      list: emptyForUnknownChannel(
        emoteList("7TV", sevenTvUserSchema, `https://7tv.io/v3/users/twitch/${channelId}`, (user) =>
          sevenTvEmotes(user.emote_set?.emotes ?? null),
        ),
      ),
    },
  ];
}

export async function loadAssets(
  channelId: string,
): Promise<Result<{ assets: ChatAssets; missing: EmoteProvider[] }>> {
  const [badgeData, lists] = await Promise.all([
    gql(badgesSchema, {
      query: `query($id: ID!) {
        badges { imageURL(size: DOUBLE) title setID version }
        user(id: $id) { broadcastBadges { imageURL(size: DOUBLE) title setID version } }
      }`,
      variables: { id: channelId },
    }),
    Promise.all(
      emoteSources(channelId).map(async ({ provider, list }) => ({ provider, result: await list })),
    ),
  ]);
  if (!badgeData.ok) return badgeData;

  const badges = new Map<string, { url: string; title: string }>();
  const { data } = badgeData.value;
  for (const badge of [...data.badges, ...(data.user?.broadcastBadges ?? [])]) {
    badges.set(`${badge.setID}/${badge.version}`, { url: badge.imageURL, title: badge.title });
  }
  const emotes = new Map(lists.flatMap(({ result }) => (result.ok ? result.value : [])));
  const missing = new Set(lists.flatMap(({ provider, result }) => (result.ok ? [] : [provider])));
  return ok({ assets: { badges, emotes }, missing: [...missing] });
}

const commentsSchema = z.object({
  data: z.object({
    video: z
      .object({
        comments: z
          .object({
            edges: z.array(z.object({ cursor: z.string().nullable(), node: commentSchema })),
            pageInfo: z.object({ hasNextPage: z.boolean() }),
          })
          .nullable(),
      })
      .nullable(),
  }),
});

export async function loadComments(
  videoId: string,
  request: PageRequest,
): Promise<Result<CommentPage>> {
  const response = await gql(
    commentsSchema,
    {
      operationName: "VideoCommentsByOffsetOrCursor",
      variables:
        request.kind === "offset"
          ? { videoID: videoId, contentOffsetSeconds: request.seconds }
          : { videoID: videoId, cursor: request.cursor },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a",
        },
      },
    },
    androidAppClientId,
  );
  if (!response.ok) return response;
  const comments = response.value.data.video?.comments ?? null;
  if (comments === null) return fail({ kind: "vod-unavailable" });
  return ok({
    comments: comments.edges.map((edge) => edge.node),
    next: comments.pageInfo.hasNextPage ? (comments.edges.at(-1)?.cursor ?? null) : null,
  });
}
