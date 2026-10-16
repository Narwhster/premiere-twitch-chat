import { z } from "zod";
import { parseJson } from "../shared/parse-json";

const settingsSchema = z.object({
  animation: z.enum(["still", "typing"]),
  background: z.boolean(),
  theme: z.enum(["dark", "light"]),
  width: z.number().int().positive().default(340),
  lines: z.number().int().positive().nullable().default(null),
  quality: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
});
export type Settings = z.infer<typeof settingsSchema>;
export type Theme = Settings["theme"];

export const defaultSettings: Settings = {
  animation: "still",
  background: true,
  theme: "dark",
  width: 340,
  lines: null,
  quality: 2,
};

export function parseSettings(saved: string | null): Settings {
  return (saved === null ? null : parseJson(settingsSchema, saved)) ?? defaultSettings;
}
