import { z } from "zod";
import type { Clip } from "../../../src/timeline";

export const syncSchema = z.object({
  videoId: z.string(),
  projectItemId: z.string(),
  offsetSeconds: z.number(),
});
export type Sync = z.infer<typeof syncSchema>;

export function sourceTimeAt(
  clips: Clip[],
  projectItemId: string,
  position: number,
): number | null {
  let top: Clip | null = null;
  for (const clip of clips) {
    if (clip.projectItemId !== projectItemId || position < clip.start || position >= clip.end)
      continue;
    if (top === null || clip.trackIndex > top.trackIndex) top = clip;
  }
  return top === null ? null : top.inPoint + (position - top.start) * top.speed;
}
