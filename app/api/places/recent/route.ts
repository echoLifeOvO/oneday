import { database, dataMode } from "@/lib/server/db";
import { DiaryRepository } from "@/lib/server/repository";
import { previewRecent } from "@/lib/server/preview";
import { readLimit, readRecentCursor, encodeCursor } from "@/lib/server/contracts";
import { limited, json } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return limited("query", async () => {
    const params = new URL(request.url).searchParams;
    const limit = readLimit(params.get("limit"), 5, 10), cursor = readRecentCursor(params.get("cursor"));
    const mode = dataMode();
    if (mode === "preview") {
      const rows = previewRecent(limit+1, cursor), last = rows[limit-1];
      return json({ mode, places: rows.slice(0,limit), nextCursor: rows.length > limit ? encodeCursor({ at: last.latestPublishedAt, id: last.place.id }) : null });
    }
    return json({ mode, ...await new DiaryRepository(database()).recentPlaces(limit, cursor) });
  }, request);
}
