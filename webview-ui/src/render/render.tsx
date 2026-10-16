import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { snapdom } from "@zumer/snapdom";
import { decodeFrames } from "modern-gif";
import type { Placement } from "../../../src/api";
import { fail, ok } from "../../../src/result";
import type { Result } from "../../../src/result";
import { api } from "../shared/bridge";
import { frameAt, frameCount, holds, linesAt, linesKey, planClip, tallestRun } from "./chat-clip";
import type { ClipPlan, Hold, Picture, ShownLine } from "./chat-clip";
import { emoteUrl } from "../chat/chat-message";
import type { ChatMessage } from "../chat/chat-message";
import { ChatLine } from "../chat/ChatLine";
import { movHeader, movHeaderSize, movieBox, movTiming } from "./png-mov";
import type { MovSample } from "./png-mov";
import type { Settings, Theme } from "../settings/settings";

const shortestGifDelayMs = 10;
const browserGifDelayMs = 100;

function imageType(base64: string): string {
  if (base64.startsWith("R0lG")) return "image/gif";
  if (base64.startsWith("UklG")) return "image/webp";
  return "image/png";
}

function gifFrames(base64: string): Result<Picture["frames"]> {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context === null) return fail({ kind: "render-failed" });
  let endsAt = 0;
  return ok(
    decodeFrames(Uint8Array.fromBase64(base64)).map((frame) => {
      canvas.width = frame.width;
      canvas.height = frame.height;
      context.putImageData(
        new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height),
        0,
        0,
      );
      endsAt += (frame.delay <= shortestGifDelayMs ? browserGifDelayMs : frame.delay) / 1000;
      return { src: canvas.toDataURL("image/png"), endsAt };
    }),
  );
}

async function loadPicture(url: string): Promise<Result<Picture | null>> {
  const response = await api.fetchBase64(url);
  if (!response.ok || response.value.status !== 200) return ok(null);
  const { body } = response.value;
  const type = imageType(body);
  const frames =
    type === "image/gif"
      ? gifFrames(body)
      : ok([{ src: `data:${type};base64,${body}`, endsAt: Number.POSITIVE_INFINITY }]);
  if (!frames.ok) return frames;
  return ok({ frames: frames.value, duration: frames.value.at(-1)?.endsAt ?? 0 });
}

function pictureUrls(message: ChatMessage, theme: Theme): string[] {
  return [
    ...message.badges.map((badge) => badge.url),
    ...message.fragments.flatMap((fragment) =>
      fragment.emote === null ? [] : [emoteUrl(fragment.emote, theme)],
    ),
  ];
}

async function loadPictures(
  messages: ChatMessage[],
  theme: Theme,
): Promise<Result<Map<string, Picture>>> {
  const urls = [...new Set(messages.flatMap((message) => pictureUrls(message, theme)))];
  const loaded = await Promise.all(
    urls.map(async (url) => ({ url, picture: await loadPicture(url) })),
  );
  const pictures = new Map<string, Picture>();
  for (const { url, picture } of loaded) {
    if (!picture.ok) return picture;
    if (picture.value !== null) pictures.set(url, picture.value);
  }
  return ok(pictures);
}

function availableMessages(
  messages: [ChatMessage, ...ChatMessage[]],
  pictures: Map<string, Picture>,
  theme: Theme,
): [ChatMessage, ...ChatMessage[]] {
  const [first, ...rest] = messages;
  const normalize = (message: ChatMessage): ChatMessage => ({
    ...message,
    badges: message.badges.filter((badge) => pictures.has(badge.url)),
    fragments: message.fragments.map((fragment) =>
      fragment.emote === null || pictures.has(emoteUrl(fragment.emote, theme))
        ? fragment
        : { ...fragment, emote: null },
    ),
  });
  return [normalize(first), ...rest.map(normalize)];
}

function atFrame(
  lines: ShownLine[],
  pictures: Map<string, Picture>,
  seconds: number,
  theme: Theme,
): ShownLine[] {
  const src = (url: string) => {
    const picture = pictures.get(url);
    return picture?.frames[frameAt(picture, seconds)]?.src ?? url;
  };
  return lines.map(({ message, typed }) => ({
    typed,
    message: {
      ...message,
      badges: message.badges.map((badge) => ({ ...badge, url: src(badge.url) })),
      fragments: message.fragments.map((fragment) => ({
        ...fragment,
        emote:
          fragment.emote === null
            ? null
            : { source: "image", url: src(emoteUrl(fragment.emote, theme)) },
      })),
    },
  }));
}

function ChatBox({
  lines,
  settings,
  maxHeight,
}: {
  lines: ShownLine[];
  settings: Settings;
  maxHeight: number;
}) {
  return (
    <div
      className={`chat-box ${settings.theme}${settings.background ? "" : " clear"}`}
      style={{ width: settings.width, maxHeight }}
    >
      {lines.map(({ message, typed }) => (
        <div key={message.id} className="line">
          <ChatLine message={message} theme={settings.theme} typed={typed} />
        </div>
      ))}
    </div>
  );
}

type Layout = { width: number; padding: number; lineHeights: number[] };
type Overlay = { picture: Picture; x: number; y: number; width: number; height: number };
type Shot = { canvas: HTMLCanvasElement; overlays: Overlay[] };
type Renderer = {
  layout: (lines: ShownLine[]) => Promise<Result<Layout>>;
  draw: (
    lines: ShownLine[],
    maxHeight: number,
    animated: Map<string, Picture>,
  ) => Promise<Result<Shot>>;
};

async function withRenderer<T>(
  settings: Settings,
  work: (renderer: Renderer) => Promise<Result<T>>,
): Promise<Result<T>> {
  const host = document.createElement("div");
  host.className = "render-host";
  document.body.append(host);
  const root = createRoot(host);
  const scale = settings.quality;
  const show = async (lines: ShownLine[], maxHeight: number) => {
    flushSync(() =>
      root.render(<ChatBox lines={lines} settings={settings} maxHeight={maxHeight} />),
    );
    const decoded = await Promise.allSettled(
      [...host.querySelectorAll("img")].map((img) => img.decode()),
    );
    await document.fonts.ready;
    const box = host.querySelector<HTMLElement>(".chat-box");
    return box === null || decoded.some((image) => image.status === "rejected") ? null : box;
  };
  // oxlint-disable-next-line effect/noTryCatch -- the offscreen React root must be unmounted even when browser or snapdom work rejects
  try {
    return await work({
      layout: async (lines) => {
        const box = await show(lines, Number.POSITIVE_INFINITY);
        if (box === null) return fail({ kind: "render-failed" });
        const lineHeights = [...box.querySelectorAll(".line")].map(
          (line) => line.getBoundingClientRect().height,
        );
        const { width, height } = box.getBoundingClientRect();
        return ok({
          width,
          padding: height - lineHeights.reduce((sum, h) => sum + h, 0),
          lineHeights,
        });
      },
      draw: async (lines, maxHeight, animated) => {
        const box = await show(lines, maxHeight);
        if (box === null) return fail({ kind: "render-failed" });
        const shown = box.getBoundingClientRect();
        const overlays = [...box.querySelectorAll("img")].flatMap((img) => {
          const picture = animated.get(img.src);
          const { left, top, bottom, width, height } = img.getBoundingClientRect();
          if (picture === undefined || bottom <= shown.top) return [];
          img.style.visibility = "hidden";
          return [
            {
              picture,
              x: (left - shown.left) * scale,
              y: (top - shown.top) * scale,
              width: width * scale,
              height: height * scale,
            },
          ];
        });
        const canvas = await snapdom.toCanvas(box, {
          scale,
          dpr: 1,
          embedFonts: true,
          backgroundColor: null,
        });
        return ok({ canvas, overlays });
      },
    });
  } finally {
    root.unmount();
    host.remove();
  }
}

async function pngBytes(canvas: HTMLCanvasElement): Promise<Result<Uint8Array>> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob === null
    ? fail({ kind: "render-failed" })
    : ok(new Uint8Array(await blob.arrayBuffer()));
}

export async function drawStill(
  lines: ShownLine[],
  settings: Settings,
  frameHeight: number,
): Promise<Result<HTMLCanvasElement>> {
  const shot = await withRenderer(settings, ({ draw }) =>
    draw(lines, frameHeight / settings.quality, new Map()),
  );
  return shot.ok ? ok(shot.value.canvas) : shot;
}

async function writePng(
  name: string,
  lines: ShownLine[],
  settings: Settings,
  frameHeight: number,
): Promise<Result<string>> {
  const still = await drawStill(lines, settings, frameHeight);
  if (!still.ok) return still;
  const png = await pngBytes(still.value);
  return png.ok ? api.writeFile(name, png.value.toBase64()) : png;
}

function even(pixels: number): number {
  const whole = Math.ceil(pixels);
  return whole + (whole % 2);
}

async function decodedImages(pictures: Picture[]): Promise<Map<string, HTMLImageElement>> {
  const sources = pictures.flatMap((picture) => picture.frames.map((frame) => frame.src));
  return new Map(
    await Promise.all(
      sources.map(async (src): Promise<[string, HTMLImageElement]> => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return [src, image];
      }),
    ),
  );
}

function compose(
  context: CanvasRenderingContext2D,
  shot: Shot,
  images: Map<string, HTMLImageElement>,
  seconds: number,
) {
  const { canvas } = context;
  const top = canvas.height - shot.canvas.height;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(shot.canvas, 0, top);
  context.save();
  context.beginPath();
  context.rect(0, top, shot.canvas.width, shot.canvas.height);
  context.clip();
  for (const { picture, x, y, width, height } of shot.overlays) {
    const image = images.get(picture.frames[frameAt(picture, seconds)]?.src ?? "");
    if (image !== undefined) context.drawImage(image, x, top + y, width, height);
  }
  context.restore();
}

export type ClipHold = Hold & { id: string; paint: () => HTMLCanvasElement };

export async function drawClip(
  plan: ClipPlan,
  pictures: Map<string, Picture>,
  settings: Settings,
  { frameRate, frameHeight }: { frameRate: number; frameHeight: number },
  onHold: (hold: ClipHold) => Promise<Result<undefined>>,
): Promise<Result<{ width: number; height: number }>> {
  const animated = new Map(
    [...pictures.values()].flatMap((picture) =>
      picture.frames.length > 1 ? [[picture.frames[0]?.src ?? "", picture] as const] : [],
    ),
  );
  const images = await decodedImages([...animated.values()]);
  return withRenderer(settings, async ({ layout, draw }) => {
    const all = await layout(plan.lines.map(({ message }) => ({ message, typed: null })));
    if (!all.ok) return all;
    const { width, padding, lineHeights } = all.value;
    const boxHeight = Math.min(
      frameHeight / settings.quality,
      padding + tallestRun(lineHeights, plan.limit),
    );
    const frame = document.createElement("canvas");
    frame.width = even(width * settings.quality);
    frame.height = even(boxHeight * settings.quality);
    const context = frame.getContext("2d");
    if (context === null) return fail({ kind: "render-failed" });
    context.imageSmoothingQuality = "high";
    const frames = frameCount(plan, frameRate);
    const secondsAt = (index: number) => index / frameRate;
    const lineRuns = holds(
      Array.from({ length: frames }, (_, index) => linesKey(plan, secondsAt(index))),
    );
    for (const run of lineRuns) {
      const shot = await draw(
        atFrame(linesAt(plan, secondsAt(run.from)), pictures, 0, settings.theme),
        boxHeight,
        animated,
      );
      if (!shot.ok) return shot;
      const pictureKeys = Array.from({ length: run.frames }, (_, offset) =>
        shot.value.overlays
          .map(({ picture }) => frameAt(picture, secondsAt(run.from + offset)))
          .join(" "),
      );
      for (const hold of holds(pictureKeys)) {
        const from = run.from + hold.from;
        const added = await onHold({
          from,
          frames: hold.frames,
          id: `${run.from} ${pictureKeys[hold.from] ?? ""}`,
          paint: () => {
            compose(context, shot.value, images, secondsAt(from));
            return frame;
          },
        });
        if (!added.ok) return added;
      }
    }
    return ok({ width: frame.width, height: frame.height });
  });
}

async function writeMov(
  fd: number,
  plan: ClipPlan,
  pictures: Map<string, Picture>,
  settings: Settings,
  placement: Placement,
  onProgress: (percent: number) => void,
): Promise<Result<undefined>> {
  const frames = frameCount(plan, placement.frameRate);
  const samples: MovSample[] = [];
  const stored = new Map<string, MovSample>();
  let end = movHeaderSize;
  const write = (bytes: Uint8Array, position: number) =>
    api.writeMov(fd, bytes.toBase64(), position);
  const drawn = await drawClip(plan, pictures, settings, placement, async (hold) => {
    onProgress(Math.floor((hold.from / frames) * 100));
    let sample = stored.get(hold.id);
    if (sample === undefined) {
      const png = await pngBytes(hold.paint());
      if (!png.ok) return png;
      const written = await write(png.value, end);
      if (!written.ok) return written;
      sample = { offset: end, size: png.value.length };
      stored.set(hold.id, sample);
      end += png.value.length;
    }
    for (let index = 0; index < hold.frames; index++) samples.push(sample);
    return ok(undefined);
  });
  if (!drawn.ok) return drawn;
  const { width, height } = drawn.value;
  const header = await write(movHeader(end), 0);
  if (!header.ok) return header;
  return write(
    movieBox(width, height, movTiming(placement.secondTicks, placement.frameTicks), samples),
    end,
  );
}

async function renderMov(
  name: string,
  plan: ClipPlan,
  pictures: Map<string, Picture>,
  settings: Settings,
  placement: Placement,
  onProgress: (percent: number) => void,
): Promise<Result<string>> {
  const fd = await api.openMov(name);
  if (!fd.ok) return fd;
  const written = await writeMov(fd.value, plan, pictures, settings, placement, onProgress).catch(
    (error: unknown) => {
      console.error(error);
      return fail({ kind: "render-failed" });
    },
  );
  if (!written.ok) {
    await api.discardMov(fd.value, name);
    return written;
  }
  return api.finishMov(fd.value, name);
}

async function renderAndPlace(
  selected: [ChatMessage, ...ChatMessage[]],
  settings: Settings,
  placement: Placement,
  onProgress: (percent: number) => void,
): Promise<Result<number>> {
  const pictures = await loadPictures(selected, settings.theme);
  if (!pictures.ok) return pictures;
  const messages = availableMessages(selected, pictures.value, settings.theme);
  const plan = planClip(messages, settings.animation === "typing", settings.lines);
  const animated = [...pictures.value.values()].some((picture) => picture.frames.length > 1);
  const still = selected.length === 1 && !plan.typing && !animated;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `twitch-chat-${stamp}.${still ? "png" : "mov"}`;
  const { frameHeight, frameRate } = placement;
  const path = still
    ? await writePng(
        name,
        atFrame(linesAt(plan, 0), pictures.value, 0, settings.theme),
        settings,
        frameHeight,
      )
    : await renderMov(name, plan, pictures.value, settings, placement, onProgress);
  if (!path.ok) return path;
  return api.place(
    { name, path: path.value, frames: frameCount(plan, frameRate) },
    placement.atTicks,
  );
}

export async function placeMessages(
  selected: [ChatMessage, ...ChatMessage[]],
  settings: Settings,
  placement: Placement,
  onProgress: (percent: number) => void,
): Promise<Result<number>> {
  // oxlint-disable-next-line effect/noTryCatch -- browser image decoding and third-party rendering can throw or reject; placement returns a rendering failure value
  try {
    return await renderAndPlace(selected, settings, placement, onProgress);
  } catch (error) {
    console.error(error);
    return fail({ kind: "render-failed" });
  }
}
