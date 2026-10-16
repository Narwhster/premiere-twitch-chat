import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import type { Result } from "../../../src/result";
import { formatTime } from "../chat/ChatLine";
import { failureText } from "../shared/failure-message";
import type { Vod } from "../twitch/twitch";
import type { Playhead } from "./use-playhead";
import { UxpLoader } from "../twitch/uxp-loader";

function vodTimeAt(source: number, offset: number, lengthSeconds: number): number {
  return Math.min(Math.max(source + offset, 0), lengthSeconds);
}

export function SyncView({
  vod,
  playhead,
  initialOffset,
  onSynced,
}: {
  vod: Vod;
  playhead: Playhead;
  initialOffset: number;
  onSynced: (offset: number) => Promise<Result<undefined>>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [offset, setOffset] = useState(initialOffset);
  const [error, setError] = useState("");
  const source = playhead.kind === "over" ? playhead.source : null;
  const playing = playhead.kind === "over" && playhead.playing;

  useEffect(() => {
    const element = video.current;
    if (element === null) return;
    const hls = new Hls({
      loader: UxpLoader,
      enableWorker: false,
      maxBufferLength: 20,
      backBufferLength: 10,
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) setError(failureText({ kind: "preview-failed" }));
    });
    hls.attachMedia(element);
    hls.loadSource(vod.playlistUrl);
    return () => hls.destroy();
  }, [vod]);

  const follow = () => {
    const element = video.current;
    if (element === null || element.readyState < 1) return;
    if (source === null) {
      element.pause();
      return;
    }
    const target = vodTimeAt(source, offset, vod.lengthSeconds);
    const drift = Math.abs(element.currentTime - target);
    if (!element.seeking && drift > (playing ? 0.5 : 0.04)) element.currentTime = target;
    if (playing && element.paused && element.readyState >= 2) {
      element.play().catch((reason: unknown) => {
        const interrupted = reason instanceof DOMException && reason.name === "AbortError";
        if (!interrupted) setError(failureText({ kind: "preview-failed" }));
      });
    }
    if (!playing && !element.paused) element.pause();
  };
  useEffect(follow);

  const sync = async () => {
    const saved = await onSynced(offset);
    if (!saved.ok) setError(failureText(saved.failure));
  };

  return (
    <div className="sync">
      <video
        ref={video}
        muted
        playsInline
        onLoadedMetadata={follow}
        onCanPlay={follow}
        onSeeked={follow}
      />
      {error !== "" && <p className="error">{error}</p>}
      {source === null ? (
        <p className="hint">
          {playhead.kind === "failed"
            ? failureText(playhead.failure)
            : "Move the playhead over the recording to line up the VOD."}
        </p>
      ) : (
        <>
          <input
            type="range"
            min={0}
            max={vod.lengthSeconds}
            step={0.1}
            value={vodTimeAt(source, offset, vod.lengthSeconds)}
            onChange={(event) => setOffset(Number(event.target.value) - source)}
          />
          <span className="hint">
            VOD {formatTime(vodTimeAt(source, offset, vod.lengthSeconds))}
          </span>
        </>
      )}
      <button className="primary" disabled={source === null} onClick={() => void sync()}>
        In sync
      </button>
    </div>
  );
}
