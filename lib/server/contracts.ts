import { z } from "zod";
import { dayFields, bodySchema } from "../day-input.ts";
import { placeSchema } from "../place-schema.ts";
export { placeSchema } from "../place-schema.ts";

export const publishSchema = z.object({
  ...dayFields,
  place: placeSchema,
  requestId: z.uuid(),
  locale: z.enum(["zh", "en"]).default("zh"),
  timeZone: z.string().min(1).max(80).refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }),
}).strict();
export type PublishInput = z.infer<typeof publishSchema>;
export const commentSchema = z.object({ requestId: z.uuid(), body: bodySchema, locale: z.enum(["zh", "en"]).default("zh") }).strict();
export type CommentInput = z.infer<typeof commentSchema>;
export const idSchema = z.uuid();

export function readPlaceCursor(value: string | null) {
  if (value === null) return null;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error("INVALID_CURSOR");
  return value;
}
const recentCursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).strict();
export function readRecentCursor(value: string | null) {
  if (!value) return null;
  if (value.length > 512) throw new Error("INVALID_CURSOR");
  try { return recentCursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); }
  catch { throw new Error("INVALID_CURSOR"); }
}

export function serverDay(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() }).strict();
export type DiaryCursor = z.infer<typeof cursorSchema>;
export function decodeCursor(value: string | null): DiaryCursor | null {
  if (!value) return null;
  if (value.length > 512) throw new Error("INVALID_CURSOR");
  try { return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); }
  catch { throw new Error("INVALID_CURSOR"); }
}
export function encodeCursor(value: DiaryCursor) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
export function readLimit(value: string | null, fallback: number, max: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || +value < 1 || +value > max) throw new Error("INVALID_LIMIT");
  return +value;
}
