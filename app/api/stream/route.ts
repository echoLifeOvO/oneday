import { database, dataMode } from "@/lib/server/db";
import { DiaryRepository } from "@/lib/server/repository";
import { previewDiaries, previewSummaries } from "@/lib/server/preview";
import { limited, json } from "@/lib/server/http";
import { readLimit } from "@/lib/server/contracts";
import { STREAM_SIZE } from "@/lib/limits";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return limited("query", async () => {
    const limit = readLimit(new URL(request.url).searchParams.get("limit"), STREAM_SIZE, 20);
    const mode = dataMode();
    if (mode === "preview") {
      const places = previewSummaries();
      return json({ mode, diaries: [...previewDiaries].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,limit)
        .map(({id,placeId,cost,currency,score,createdAt,isDemo}) => ({id,placeId,cost,currency,score,createdAt,isDemo,place:places.find(p=>p.place.id===placeId)!.place})) });
    }
    return json({ mode, diaries: await new DiaryRepository(database()).stream(limit) });
  }, request);
}
