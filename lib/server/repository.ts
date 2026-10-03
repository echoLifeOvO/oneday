import type { Pool } from "pg";
import { createHash } from "node:crypto";
import type { Diary, Place, PlaceSummary, RecentPlace, StreamDiary, Comment } from "../types.ts";
import { nickname } from "../nickname.ts";
import { encodeCursor, serverDay, type DiaryCursor, type PublishInput, type CommentInput } from "./contracts.ts";
import type { Approval } from "./moderation.ts";

const commentHash = (diaryId: string, input: CommentInput) => createHash("sha256").update(JSON.stringify({ diaryId, body: input.body })).digest("hex");
const diaryHash = (input: PublishInput, place: Place) => createHash("sha256").update(JSON.stringify({ placeId: place.id, body: input.body, cost: input.cost,
  currency: input.currency, score: input.score, timeZone: input.timeZone })).digest("hex");

// Keep microseconds intact for keyset pagination. Amounts leave PG as JSON numbers.
const timestamp = (alias: string) => `to_char(${alias}.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const columns = `d.id, d.place_id, d.nickname, d.day_date::text AS date, d.body, d.cost::double precision AS cost, d.currency, d.score, d.is_demo,
  ${timestamp("d")} AS created_at, (SELECT count(*)::int FROM comments c WHERE c.diary_id=d.id AND c.hidden_at IS NULL) AS comment_count`;
type DiaryRow = { id: string; place_id: string; nickname: string; date: string; body: string; cost: number; currency: string; score: number; created_at: string; comment_count: number; is_demo: boolean; request_hash?: string; hidden_at?: Date | null };
function diary(row: DiaryRow): Diary {
  return { id: row.id, placeId: row.place_id, nickname: row.nickname, date: row.date, body: row.body,
    cost: row.cost, currency: row.currency, score: row.score, createdAt: row.created_at, comments: [], commentCount: row.comment_count, ...(row.is_demo ? { isDemo: true } : {}) };
}
export class DiaryRepository {
  private pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async recentPlaces(limit: number, cursor: { at: string; id: string } | null = null) {
    const result = await this.pool.query<RecentPlace>(`
      WITH recent AS (
        SELECT place_id, max(created_at) AS latest_at, count(*)::int AS count
        FROM diaries WHERE hidden_at IS NULL GROUP BY place_id
      ) SELECT p.metadata AS place, r.count,
        to_char(r.latest_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "latestPublishedAt"
        FROM recent r JOIN places p ON p.id = r.place_id
        WHERE $2::timestamptz IS NULL OR r.latest_at < $2 OR (r.latest_at = $2 AND r.place_id > $3)
        ORDER BY r.latest_at DESC, r.place_id ASC LIMIT $1`, [limit + 1, cursor?.at ?? null, cursor?.id ?? null]);
    const places = result.rows.slice(0, limit), last = places.at(-1);
    return { places, nextCursor: result.rows.length > limit && last ? encodeCursor({ at: last.latestPublishedAt, id: last.place.id }) : null };
  }
  async summaries(limit: number, cursor: string | null = null) {
    // Select a bounded page of IDs before aggregating; never materialize all places
    // or bodies in the application just to slice them afterward.
    const result = await this.pool.query<PlaceSummary>(`
      WITH page AS MATERIALIZED (
        SELECT p.id, p.metadata FROM places p WHERE ($1::text IS NULL OR p.id > $1)
          AND EXISTS (SELECT 1 FROM diaries d WHERE d.place_id=p.id AND d.hidden_at IS NULL)
        ORDER BY p.id LIMIT $2
      ) SELECT p.metadata AS place, jsonb_build_object('count', t.count, 'minScore', t.min_score,
        'maxScore', t.max_score, 'costs', c.values) AS stats FROM page p
      CROSS JOIN LATERAL (SELECT count(*)::int AS count, min(score) AS min_score, max(score) AS max_score
        FROM diaries WHERE place_id=p.id AND hidden_at IS NULL) t
      CROSS JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('currency', a.currency, 'min', a.min, 'max', a.max) ORDER BY a.currency) AS values
        FROM (SELECT currency, min(cost) AS min, max(cost) AS max FROM diaries
          WHERE place_id=p.id AND hidden_at IS NULL GROUP BY currency) a) c ORDER BY p.id`, [cursor, limit + 1]);
    const places = result.rows.slice(0, limit);
    return { places, nextCursor: result.rows.length > limit ? places.at(-1)!.place.id : null };
  }
  async stream(limit: number): Promise<StreamDiary[]> {
    const result = await this.pool.query<StreamDiary>(`SELECT d.id, d.place_id AS "placeId", d.cost::double precision AS cost,
      d.currency, d.score, d.is_demo AS "isDemo", ${timestamp("d")} AS "createdAt", p.metadata AS place
      FROM (SELECT id, place_id, cost, currency, score, created_at, is_demo FROM diaries WHERE hidden_at IS NULL
        ORDER BY created_at DESC, id DESC LIMIT $1) d JOIN places p ON p.id=d.place_id ORDER BY d.created_at DESC, d.id DESC`, [limit]);
    return result.rows;
  }
  async one(id: string) {
    const result = await this.pool.query<DiaryRow>(`SELECT ${columns} FROM diaries d WHERE d.id=$1 AND d.hidden_at IS NULL LIMIT 1`, [id]);
    if (!result.rows[0]) throw new Error("NOT_FOUND");
    return diary(result.rows[0]);
  }
  async list(placeId: string, limit: number, cursor: DiaryCursor | null = null) {
    const result = await this.pool.query<DiaryRow>(`SELECT ${columns} FROM diaries d
      WHERE d.hidden_at IS NULL AND d.place_id = $1
        AND ($2::timestamptz IS NULL OR (d.created_at, d.id) < ($2::timestamptz, $3::uuid))
      ORDER BY d.created_at DESC, d.id DESC LIMIT $4`, [placeId, cursor?.at ?? null, cursor?.id ?? null, limit + 1]);
    const rows = result.rows.slice(0, limit), last = rows.at(-1);
    return { diaries: rows.map(diary), nextCursor: result.rows.length > limit && last ? encodeCursor({ at: last.created_at, id: last.id }) : null };
  }
  async comments(diaryId: string, limit: number, cursor: DiaryCursor | null = null) {
    const result = await this.pool.query<Comment & { createdAt: string }>(`SELECT c.id, c.nickname, c.body, ${timestamp("c")} AS "createdAt"
      FROM comments c JOIN diaries d ON d.id=c.diary_id WHERE c.diary_id=$1 AND c.hidden_at IS NULL AND d.hidden_at IS NULL
        AND ($2::timestamptz IS NULL OR (c.created_at,c.id) < ($2::timestamptz,$3::uuid))
      ORDER BY c.created_at DESC,c.id DESC LIMIT $4`, [diaryId, cursor?.at ?? null, cursor?.id ?? null, limit + 1]);
    const comments = result.rows.slice(0, limit), last = comments.at(-1);
    return { comments, nextCursor: result.rows.length > limit && last ? encodeCursor({ at: last.createdAt, id: last.id }) : null };
  }
  async existingComment(diaryId: string, input: CommentInput) {
    const result = await this.pool.query<Comment & { request_hash: string; hidden_at: Date | null }>(
      "SELECT id,nickname,body,request_hash,hidden_at FROM comments WHERE id=$1 LIMIT 1", [input.requestId]);
    const row = result.rows[0]; if (!row) return null;
    if (row.request_hash !== commentHash(diaryId, input) || row.hidden_at) throw new Error("REQUEST_CONFLICT");
    await this.one(diaryId);
    return { comment: { id: row.id, nickname: row.nickname, body: row.body }, created: false };
  }
  async existingDiary(input: PublishInput, place: Place) {
    const result = await this.pool.query<DiaryRow>(`SELECT ${columns},d.request_hash,d.hidden_at FROM diaries d WHERE d.id=$1 LIMIT 1`, [input.requestId]);
    const row = result.rows[0]; if (!row) return null;
    if (row.request_hash !== diaryHash(input, place) || row.hidden_at) throw new Error("REQUEST_CONFLICT");
    return { diary: diary(row), created: false };
  }
  async comment(diaryId: string, input: CommentInput, approval: Approval) {
    const hash = commentHash(diaryId, input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const parent = await client.query("SELECT id FROM diaries WHERE id=$1 AND hidden_at IS NULL FOR SHARE", [diaryId]);
      if (!parent.rows.length) throw new Error("NOT_FOUND");
      const inserted = await client.query(`INSERT INTO comments (id,diary_id,nickname,body,request_hash,moderated_at,moderation_model,moderation_policy) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING RETURNING id`, [input.requestId, diaryId, nickname(input.locale, input.requestId, "comment"), input.body, hash, approval.at, approval.model, approval.policy]);
      const result = await client.query<Comment & { request_hash: string; hidden_at: Date | null }>("SELECT id,nickname,body,request_hash,hidden_at FROM comments WHERE id=$1 LIMIT 1", [input.requestId]);
      const row = result.rows[0];
      if (row.request_hash !== hash || row.hidden_at) throw new Error("REQUEST_CONFLICT");
      await client.query("COMMIT");
      return { comment: { id: row.id, nickname: row.nickname, body: row.body }, created: inserted.rowCount === 1 };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async publish(input: PublishInput, place: Place, approval: Approval) {
    const hash = diaryHash(input, place);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO places (id, metadata) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING", [place.id, JSON.stringify(place)]);
      const inserted = await client.query(`INSERT INTO diaries (id, request_hash, place_id, nickname, day_date, time_zone, body, cost, currency, score,moderated_at,moderation_model,moderation_policy)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [input.requestId, hash, place.id, nickname(input.locale, input.requestId, "diary"), serverDay(input.timeZone), input.timeZone, input.body, input.cost, input.currency, input.score,approval.at,approval.model,approval.policy]);
      const result = await client.query<DiaryRow>(`SELECT ${columns}, d.request_hash, d.hidden_at FROM diaries d WHERE d.id = $1 LIMIT 1`, [input.requestId]);
      if (result.rows[0].request_hash !== hash || result.rows[0].hidden_at) throw new Error("REQUEST_CONFLICT");
      await client.query("COMMIT");
      return { diary: diary(result.rows[0]), created: inserted.rowCount === 1 };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
}
