import { randomId } from "./random-id";
import { z } from "zod";
import { places } from "./catalog";
import { dayFields } from "./day-input";
import { nickname } from "./nickname";
import type { Diary } from "./types";

export const SAVED_DAYS_KEY = "one-day-saved-days-v1";
export const COMPOSER_KEY = "one-day-composer-v2";
export const dayInputSchema = z.object({
  placeId: z
    .string()
    .refine((id) => places.some((p) => p.id === id), "请选择一个地点"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ...dayFields,
});
export type DayInput = z.infer<typeof dayInputSchema>;
const savedSchema = dayInputSchema.extend({
  // Existing private preview records remain readable; new writes use 200.
  body: z.string().min(1).max(5000),
  id: z.string(),
  nickname: z.string(),
  isLocal: z.literal(true),
  createdAt: z.string().optional(),
  comments: z.array(
    z.object({
      id: z.string(),
      nickname: z.string(),
      body: z.string(),
    }),
  ),
});
export function readSavedDays(): Diary[] {
  const raw = localStorage.getItem(SAVED_DAYS_KEY);
  if (!raw) return [];
  const data = z.array(savedSchema).safeParse(JSON.parse(raw));
  if (!data.success)
    throw new Error("本机记录暂时无法读取，已有内容未被覆盖。");
  return data.data;
}
export function saveDay(input: DayInput, locale: "zh" | "en" = "zh"): Diary {
  const parsed = dayInputSchema.parse(input);
  const id = randomId();
  const day: Diary = {
    ...parsed,
    id,
    nickname: nickname(locale, id, "local"),
    createdAt: new Date().toISOString(),
    isLocal: true,
    comments: [],
  };
  localStorage.setItem(
    SAVED_DAYS_KEY,
    JSON.stringify([day, ...readSavedDays()]),
  );
  return day;
}
export function today() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}
