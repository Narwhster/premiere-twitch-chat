import { useEffect, useState } from "react";
import type { Failure } from "../../../src/result";
import { api } from "../shared/bridge";
import { isPlaying } from "./playhead";
import type { PlayheadSample } from "./playhead";
import { sourceTimeAt } from "./sync";

export type Playhead =
  | { kind: "over"; source: number; playing: boolean }
  | { kind: "off" }
  | { kind: "failed"; failure: Failure };

const pollMs = 100;

function samePlayhead(a: Playhead, b: Playhead): boolean {
  if (a.kind === "over" && b.kind === "over")
    return a.source === b.source && a.playing === b.playing;
  if (a.kind === "failed" && b.kind === "failed") return a.failure.kind === b.failure.kind;
  return a.kind === b.kind;
}

export function usePlayhead(projectItemId: string | null): Playhead {
  const [playhead, setPlayhead] = useState<Playhead>({ kind: "off" });
  useEffect(() => {
    if (projectItemId === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous: PlayheadSample | null = null;
    const tick = async () => {
      const started = performance.now();
      const timeline = await api.timeline();
      let next: Playhead;
      if (timeline.ok) {
        const sample = { position: timeline.value.position, atSeconds: performance.now() / 1000 };
        const source = sourceTimeAt(timeline.value.clips, projectItemId, sample.position);
        next =
          source === null
            ? { kind: "off" }
            : { kind: "over", source, playing: isPlaying(previous, sample) };
        previous = sample;
      } else {
        next = { kind: "failed", failure: timeline.failure };
        previous = null;
      }
      if (stopped) return;
      setPlayhead((current) => (samePlayhead(current, next) ? current : next));
      timer = setTimeout(() => void tick(), Math.max(0, pollMs - (performance.now() - started)));
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [projectItemId]);
  return playhead;
}
