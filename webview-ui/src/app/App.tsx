import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { Recording } from "../../../src/api";
import { ok } from "../../../src/result";
import type { Failure, Result } from "../../../src/result";
import { api, useActiveProject } from "../shared/bridge";
import { ChatLine, formatTime } from "../chat/ChatLine";
import type { ChatAssets, ChatMessage } from "../chat/chat-message";
import { failureText, missingEmotesHint } from "../shared/failure-message";
import { parseJson } from "../shared/parse-json";
import { parseVodUrl } from "../twitch/parse-vod-url";
import { placeMessages } from "../render/render";
import { defaultSettings, parseSettings } from "../settings/settings";
import type { Settings } from "../settings/settings";
import { SyncView } from "../sync/SyncView";
import { syncSchema } from "../sync/sync";
import type { Sync } from "../sync/sync";
import { loadAssets, loadVod } from "../twitch/twitch";
import type { Vod } from "../twitch/twitch";
import { useChat } from "../chat/use-chat";
import { usePlayhead } from "../sync/use-playhead";
import type { Playhead } from "../sync/use-playhead";

type Stream = { vod: Vod; assets: ChatAssets; notice: string };
type Ready = { kind: "setup"; notice: string } | ({ kind: "sync" | "chat"; sync: Sync } & Stream);
type Screen = { kind: "loading" } | Ready;

const endSlackPx = 2;

async function loadStream(videoId: string): Promise<Result<Stream>> {
  const vod = await loadVod(videoId);
  if (!vod.ok) return vod;
  const loaded = await loadAssets(vod.value.channelId);
  if (!loaded.ok) return loaded;
  return ok({
    vod: vod.value,
    assets: loaded.value.assets,
    notice: missingEmotesHint(loaded.value.missing),
  });
}

function setupWith(failure: Failure): Ready {
  return { kind: "setup", notice: failureText(failure) };
}

async function loadSavedScreen(): Promise<Ready> {
  const saved = await api.loadSync();
  if (!saved.ok) return setupWith(saved.failure);
  if (saved.value === null) return { kind: "setup", notice: "" };
  const sync = parseJson(syncSchema, saved.value);
  if (sync === null) return setupWith({ kind: "corrupt-sync" });
  const stream = await loadStream(sync.videoId);
  return stream.ok ? { kind: "chat", sync, ...stream.value } : setupWith(stream.failure);
}

function messageRows(list: HTMLElement): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>("[data-message-id]")];
}

function nonEmpty<T>(items: T[]): [T, ...T[]] | null {
  const [first, ...rest] = items;
  return first === undefined ? null : [first, ...rest];
}

export function App() {
  return <ProjectApp key={useActiveProject()} />;
}

function ProjectApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [settings, setSettings] = useState(defaultSettings);
  const projectItemId = "sync" in screen ? screen.sync.projectItemId : null;
  const playhead = usePlayhead(projectItemId);

  useEffect(() => {
    void Promise.all([api.loadSettings(), loadSavedScreen()]).then(([saved, loaded]) => {
      setSettings(parseSettings(saved.ok ? saved.value : null));
      setScreen(
        saved.ok
          ? loaded
          : { ...loaded, notice: `${failureText(saved.failure)} ${loaded.notice}`.trim() },
      );
    });
  }, []);

  const changeSettings = (next: Settings) => {
    setSettings(next);
    return api.saveSettings(JSON.stringify(next));
  };

  return (
    <main className={settings.theme}>
      {screen.kind === "loading" && <p className="hint">Loading…</p>}
      {screen.kind === "setup" && (
        <Setup
          notice={screen.notice}
          onReady={(stream, recording) =>
            setScreen({
              kind: "sync",
              ...stream,
              sync: {
                videoId: stream.vod.id,
                projectItemId: recording.projectItemId,
                offsetSeconds: 0,
              },
            })
          }
        />
      )}
      {screen.kind === "sync" && (
        <SyncView
          vod={screen.vod}
          playhead={playhead}
          initialOffset={screen.sync.offsetSeconds}
          onSynced={async (offsetSeconds) => {
            const sync = { ...screen.sync, offsetSeconds };
            const saved = await api.saveSync(JSON.stringify(sync));
            if (saved.ok) setScreen({ ...screen, kind: "chat", sync });
            return saved;
          }}
        />
      )}
      {screen.kind === "chat" && (
        <Chat
          vod={screen.vod}
          assets={screen.assets}
          notice={screen.notice}
          playhead={playhead}
          offsetSeconds={screen.sync.offsetSeconds}
          settings={settings}
          onSettings={changeSettings}
          onResync={() => setScreen({ ...screen, kind: "sync" })}
          onChangeVod={() => setScreen({ kind: "setup", notice: "" })}
        />
      )}
    </main>
  );
}

function Setup({
  notice,
  onReady,
}: {
  notice: string;
  onReady: (stream: Stream, recording: Recording) => void;
}) {
  const [url, setUrl] = useState("");
  const [recordings, setRecordings] = useState<Result<Recording[]>>(ok([]));
  const [recordingId, setRecordingId] = useState("");
  const [status, setStatus] = useState(notice);
  const videoId = parseVodUrl(url);
  const choices = recordings.ok ? recordings.value : [];
  const recording = choices.find((r) => r.projectItemId === recordingId) ?? choices[0];

  const refresh = () => {
    void api.recordings().then(setRecordings);
  };
  useEffect(refresh, []);

  const start = async () => {
    if (videoId === null || recording === undefined) return;
    setStatus("Loading VOD…");
    const stream = await loadStream(videoId);
    if (stream.ok) onReady(stream.value, recording);
    else setStatus(failureText(stream.failure));
  };

  return (
    <form
      className="setup"
      onSubmit={(event) => {
        event.preventDefault();
        void start();
      }}
    >
      <label>
        Twitch VOD link
        <input
          value={url}
          placeholder="https://www.twitch.tv/videos/…"
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <label>
        Recording
        <select
          value={recording?.projectItemId ?? ""}
          onFocus={refresh}
          onChange={(event) => setRecordingId(event.target.value)}
        >
          {recording === undefined && (
            <option value="">
              {recordings.ok ? "No clips in the active sequence" : failureText(recordings.failure)}
            </option>
          )}
          {choices.map((r) => (
            <option key={r.projectItemId} value={r.projectItemId}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <button className="primary" disabled={videoId === null || recording === undefined}>
        Sync
      </button>
      {status !== "" && <p className="hint">{status}</p>}
    </form>
  );
}

function Chat({
  vod,
  assets,
  notice,
  playhead,
  offsetSeconds,
  settings,
  onSettings,
  onResync,
  onChangeVod,
}: {
  vod: Vod;
  assets: ChatAssets;
  notice: string;
  playhead: Playhead;
  offsetSeconds: number;
  settings: Settings;
  onSettings: (settings: Settings) => Promise<Result<undefined>>;
  onResync: () => void;
  onChangeVod: () => void;
}) {
  const time = playhead.kind === "over" ? playhead.source + offsetSeconds : null;
  const playing = playhead.kind === "over" && playhead.playing;
  const { messages, failure } = useChat(vod, assets, time);
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [status, setStatus] = useState(notice);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const reading = useRef<{ id: string; top: number } | null>(null);
  const wasPlaying = useRef(playing);

  const scrollToEnd = () => {
    const element = list.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  };
  const keepPlace = () => {
    const element = list.current;
    if (element === null) return;
    if (atEnd.current) {
      scrollToEnd();
      return;
    }
    const kept = reading.current;
    if (kept === null) return;
    const row = messageRows(element).find((r) => r.dataset["messageId"] === kept.id);
    if (row === undefined) return;
    element.scrollTop +=
      row.getBoundingClientRect().top - element.getBoundingClientRect().top - kept.top;
  };
  useLayoutEffect(keepPlace, [messages]);
  useLayoutEffect(() => {
    const following = !wasPlaying.current;
    wasPlaying.current = playing;
    if (!following) return;
    atEnd.current = true;
    scrollToEnd();
  }, [time, playing]);
  const trackScroll = () => {
    const element = list.current;
    if (element === null) return;
    atEnd.current = element.scrollHeight - element.scrollTop - element.clientHeight < endSlackPx;
    const top = element.getBoundingClientRect().top;
    const row = messageRows(element).find((r) => r.getBoundingClientRect().bottom > top);
    const id = row?.dataset["messageId"];
    reading.current =
      row === undefined || id === undefined
        ? null
        : { id, top: row.getBoundingClientRect().top - top };
  };

  const report = (result: Result<string>) =>
    setStatus(result.ok ? result.value : failureText(result.failure));
  const alone = async (work: () => Promise<Result<string>>) => {
    if (busy) return;
    setBusy(true);
    report(await work());
    setBusy(false);
  };

  const placeNow = async (chosen: [ChatMessage, ...ChatMessage[]]): Promise<Result<string>> => {
    setStatus("Rendering…");
    const placement = await api.placement();
    if (!placement.ok) return placement;
    const folder = await api.renderFolderName();
    if (!folder.ok) return folder;
    if (folder.value === null) {
      setStatus("Choose a folder for chat renders.");
      const picked = await api.chooseRenderFolder();
      if (!picked.ok) return picked;
      setStatus("Rendering…");
    }
    const placed = await placeMessages(chosen, settings, placement.value, (percent) =>
      setStatus(`Rendering ${percent}%`),
    );
    return placed.ok ? ok(`Placed on V${placed.value}`) : placed;
  };

  const place = (chosen: [ChatMessage, ...ChatMessage[]]) => {
    if (busy) return;
    setSelected([]);
    void alone(() => placeNow(chosen));
  };

  const changeFolder = () =>
    void alone(async () => {
      const folder = await api.chooseRenderFolder();
      return folder.ok ? ok(`Renders go to ${folder.value}`) : folder;
    });

  const changeSettings = async (next: Settings) => {
    const saved = await onSettings(next);
    if (!saved.ok) report(saved);
  };

  const click = (event: MouseEvent, message: ChatMessage) => {
    if (event.shiftKey && anchor !== null) {
      const ids = messages.map((m) => m.id);
      const from = ids.indexOf(anchor);
      const to = ids.indexOf(message.id);
      if (from >= 0) setSelected(ids.slice(Math.min(from, to), Math.max(from, to) + 1));
    } else if (event.shiftKey || event.metaKey || event.ctrlKey) {
      setSelected((current) =>
        current.includes(message.id)
          ? current.filter((id) => id !== message.id)
          : [...current, message.id],
      );
      setAnchor(message.id);
    } else {
      place([message]);
    }
  };

  const chosen = nonEmpty(messages.filter((m) => selected.includes(m.id)));

  return (
    <div className="chat">
      <header>
        <span className="title">{vod.title}</span>
        <button onClick={() => setMenu(!menu)} aria-label="Settings">
          ⚙
        </button>
        {menu && (
          <div className="menu">
            <Toggle
              options={[
                { value: "still", label: "Still" },
                { value: "typing", label: "Typing" },
              ]}
              value={settings.animation}
              onChange={(animation) => void changeSettings({ ...settings, animation })}
            />
            <Toggle
              options={[
                { value: true, label: "Background" },
                { value: false, label: "No background" },
              ]}
              value={settings.background}
              onChange={(background) => void changeSettings({ ...settings, background })}
            />
            <Toggle
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
              value={settings.theme}
              onChange={(theme) => void changeSettings({ ...settings, theme })}
            />
            <Toggle
              options={[
                { value: 260, label: "Narrow" },
                { value: 340, label: "Medium" },
                { value: 460, label: "Wide" },
              ]}
              value={settings.width}
              onChange={(width) => void changeSettings({ ...settings, width })}
            />
            <Toggle
              label="Lines"
              options={[
                { value: null, label: "All" },
                { value: 10, label: "10" },
                { value: 5, label: "5" },
                { value: 3, label: "3" },
              ]}
              value={settings.lines}
              onChange={(lines) => void changeSettings({ ...settings, lines })}
            />
            <Toggle
              label="Quality"
              options={[
                { value: 1, label: "1x" },
                { value: 2, label: "2x" },
                { value: 3, label: "3x" },
              ]}
              value={settings.quality}
              onChange={(quality) => void changeSettings({ ...settings, quality })}
            />
            <div className="links">
              <button onClick={onResync}>Resync</button>
              <button onClick={onChangeVod}>Change VOD</button>
            </div>
            <button onClick={changeFolder}>Change render folder</button>
          </div>
        )}
      </header>
      <div
        className={`messages${busy ? " busy" : ""}`}
        ref={list}
        onScroll={trackScroll}
        onLoadCapture={keepPlace}
      >
        {time === null && (
          <p className="hint chat-hint">
            {playhead.kind === "failed"
              ? failureText(playhead.failure)
              : "Move the playhead over the recording."}
          </p>
        )}
        {time !== null && failure !== null && (
          <p className="hint chat-hint">{failureText(failure)} Trying again…</p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            data-message-id={message.id}
            className={`vod-message${selected.includes(message.id) ? " selected" : ""}`}
            onClick={(event) => click(event, message)}
          >
            <span className="time">{formatTime(message.offsetSeconds)}</span>
            <div className="body">
              <ChatLine message={message} theme={settings.theme} typed={null} />
            </div>
          </div>
        ))}
      </div>
      <footer>
        {chosen !== null ? (
          <>
            <button className="primary" disabled={busy} onClick={() => place(chosen)}>
              Place {chosen.length} {chosen.length === 1 ? "message" : "messages"}
            </button>
            <button onClick={() => setSelected([])}>Clear</button>
          </>
        ) : (
          <span className="hint">
            {status !== "" ? status : "Click to place. Shift-click to pick several."}
          </span>
        )}
      </footer>
    </div>
  );
}

function Toggle<T extends string | number | boolean | null>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="toggle">
      {label !== undefined && <span className="toggle-label">{label}</span>}
      {options.map((option) => (
        <button
          key={option.label}
          className={option.value === value ? "on" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
