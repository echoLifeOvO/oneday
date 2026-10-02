export const BODY_LIMIT = 200;
export const MAX_COST = 100_000_000;
export const PLACE_BYTES = 4096;
export const REQUEST_BYTES = 8192;
export const STREAM_SIZE = 12;
export const STREAM_INTERVAL = 5000;
// PostgreSQL char_length counts Unicode code points, including an emoji as one.
export function textLength(text: string) { return Array.from(text).length; }
export function clipText(text: string, limit = BODY_LIMIT) { return Array.from(text).slice(0, limit).join(""); }
