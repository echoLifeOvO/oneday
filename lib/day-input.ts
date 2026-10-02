import { z } from "zod";
import { BODY_LIMIT, MAX_COST, textLength } from "./limits.ts";

export const bodySchema = z.string().max(BODY_LIMIT * 2).refine(s => textLength(s) <= BODY_LIMIT && !s.includes("\0")).trim().min(1);
export const costSchema = z.number().finite().min(0).max(MAX_COST).refine(n => Number(n.toFixed(2)) === n);

export const dayFields = {
  body: bodySchema,
  cost: costSchema,
  currency: z.enum(["CNY", "USD", "EUR", "JPY", "GBP", "HKD"]),
  score: z.number().int().min(0).max(100),
};
