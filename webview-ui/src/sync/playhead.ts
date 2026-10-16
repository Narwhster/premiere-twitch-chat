export type PlayheadSample = { position: number; atSeconds: number };

const pollJitterSeconds = 0.06;
const playbackRateTolerance = 0.4;

export function isPlaying(previous: PlayheadSample | null, current: PlayheadSample): boolean {
  if (previous === null) return false;
  const moved = current.position - previous.position;
  const elapsed = current.atSeconds - previous.atSeconds;
  return (
    moved > 0 &&
    Math.abs(moved - elapsed) < Math.max(pollJitterSeconds, elapsed * playbackRateTolerance)
  );
}
