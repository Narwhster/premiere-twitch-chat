import type { z } from "zod";

export function parseJson<T>(schema: z.ZodType<T>, text: string): T | null {
  // oxlint-disable-next-line effect/noTryCatch -- JSON.parse throws for invalid saved or external JSON; parsing returns null to its caller
  try {
    return schema.safeParse(JSON.parse(text)).data ?? null;
  } catch {
    return null;
  }
}
