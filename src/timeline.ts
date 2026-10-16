export type Clip = {
  projectItemId: string;
  trackIndex: number;
  start: number;
  end: number;
  inPoint: number;
  speed: number;
};

export function targetTrack(clips: Clip[], from: number, to: number): number {
  return Math.max(
    0,
    ...clips.flatMap((clip) => (clip.start < to && clip.end > from ? [clip.trackIndex + 1] : [])),
  );
}
