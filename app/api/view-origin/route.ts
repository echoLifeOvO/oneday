import { viewOrigin } from "@/lib/view-origin";
import { limited } from "@/lib/server/http";
export async function GET(request: Request) {
  return limited("query", async () => Response.json(process.env.VERCEL === "1" ? viewOrigin(request.headers) : null, {
    headers: { "Cache-Control": "private, no-store" },
  }), request);
}
