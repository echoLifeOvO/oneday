import { database, dataMode } from "@/lib/server/db";
import { DiaryRepository } from "@/lib/server/repository";
import { limited, json } from "@/lib/server/http";
import { idSchema } from "@/lib/server/contracts";
import { previewDiaries } from "@/lib/server/preview";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return limited("query", async () => {
    const { id } = await context.params;
    if (id.length > 100) throw new Error("INVALID_PLACE");
    if (dataMode() === "preview") {
      const diary = previewDiaries.find(d => d.id === id);
      if (!diary) throw new Error("NOT_FOUND");
      return json({ diary });
    }
    return json({ diary: await new DiaryRepository(database()).one(idSchema.parse(id)) });
  }, request);
}
