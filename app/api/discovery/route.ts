import { database, dataMode } from "@/lib/server/db";
import { DiaryRepository } from "@/lib/server/repository";
import { previewSummaries } from "@/lib/server/preview";
import { readLimit, readPlaceCursor } from "@/lib/server/contracts";
import { limited, json } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return limited("query", async () => {
    const params = new URL(request.url).searchParams;
    const limit = readLimit(params.get("limit"), 100, 200), cursor = readPlaceCursor(params.get("cursor"));
    const mode = dataMode();
    if (mode === "preview") {
      const rows = previewSummaries().filter(p => !cursor || p.place.id > cursor).sort((a,b) => a.place.id.localeCompare(b.place.id)).slice(0,limit+1);
      return json({ mode, places: rows.slice(0,limit), nextCursor: rows.length > limit ? rows[limit-1].place.id : null });
    }
    return json({ mode, ...await new DiaryRepository(database()).summaries(limit, cursor) });
  }, request);
}
