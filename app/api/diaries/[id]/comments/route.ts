import { database, dataMode } from "@/lib/server/db";
import { DiaryRepository } from "@/lib/server/repository";
import { limited, json, readBody } from "@/lib/server/http";
import { idSchema, commentSchema, decodeCursor, readLimit } from "@/lib/server/contracts";
import { moderate } from "@/lib/server/moderation";
export const runtime = "nodejs";
export const maxDuration = 30;
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return limited("query", async () => {
    const id = idSchema.parse((await context.params).id), params = new URL(request.url).searchParams;
    const limit = readLimit(params.get("limit"), 20, 50), cursor = decodeCursor(params.get("cursor"));
    if (dataMode() !== "database") return json({ comments: [], nextCursor: null });
    return json(await new DiaryRepository(database()).comments(id, limit, cursor));
  }, request);
}
export async function POST(request: Request, context: Context) {
  return limited("comment", async () => {
    const id = idSchema.parse((await context.params).id), input = commentSchema.parse(await readBody(request));
    if (dataMode() !== "database") throw new Error("DATABASE_NOT_CONFIGURED");
    const repo = new DiaryRepository(database());
    const existing = await repo.existingComment(id, input);
    if (existing) return json({ comment: existing.comment });
    await repo.one(id);
    const approval = await moderate({ kind: "comment", body: input.body });
    const result = await repo.comment(id, input, approval);
    return json({ comment: result.comment }, result.created ? 201 : 200);
  }, request);
}
