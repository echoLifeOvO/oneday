import { z } from "zod";
import { PLACE_BYTES, textLength } from "./limits.ts";
const text = (max: number, min = 0) => z.string().max(max * 2).refine(s => textLength(s) >= min && textLength(s) <= max && !s.includes("\0"));
const lng = z.number().finite().min(-180).max(180);
const lat = z.number().finite().min(-85).max(85);
export const placeSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  name: text(200, 1), englishName: text(200), region: text(500), country: text(100),
  countryCode: z.string().regex(/^[A-Z]{2,3}$/),
  center: z.tuple([lng, lat]), bounds: z.tuple([lng, z.number().finite().min(-90).max(90), lng, z.number().finite().min(-90).max(90)]),
  aliases: text(500), sourceShapeId: text(200), origin: z.literal("photon").optional(),
}).strict().refine(p => p.bounds[0] <= p.center[0] && p.center[0] <= p.bounds[2] && p.bounds[1] <= p.center[1] && p.center[1] <= p.bounds[3])
  .refine(p => new TextEncoder().encode(JSON.stringify(p)).length <= PLACE_BYTES);
