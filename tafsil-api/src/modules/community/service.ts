import { query } from "../../db/client.js";
import { getRedis } from "../../db/redis.js";
import type {
  CommunitySessionDto,
  CommunityFilterQuery,
  LikeResponseDto,
  ForkSessionInput,
  CommunityConceptDto,
} from "./dto.js";

export async function listCommunitySessions(
  userId?: string | null,
  options: CommunityFilterQuery = {},
): Promise<CommunitySessionDto[]> {
  const { kavram, sort = "popular", limit = 20, offset = 0 } = options;
  const redis = getRedis();
  const effectiveUserId = userId || "anonymous";
  const cacheKey = `cache:community:sessions:${kavram || "all"}:${sort}:${limit}:${offset}:${effectiveUserId}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis hatası sorguyu engellemesin
  }

  let orderBy = "o.like_count DESC, o.created_at DESC";
  if (sort === "latest") {
    orderBy = "o.created_at DESC";
  } else if (sort === "forks") {
    orderBy = "o.fork_count DESC, o.like_count DESC";
  }

  const values: any[] = [];
  let filterClause = "o.is_public = true";

  if (kavram) {
    values.push(kavram.toLowerCase());
    filterClause += ` AND $${values.length} = ANY(o.odak_kavramlar)`;
  }

  values.push(limit);
  const limitIndex = values.length;
  values.push(offset);
  const offsetIndex = values.length;

  let likeJoin = "";
  let isLikedSelect = "false as is_liked_by_user";
  if (userId) {
    values.push(userId);
    const userIndex = values.length;
    likeJoin = `LEFT JOIN topluluk_begenileri b ON b.oturum_id = o.id AND b.user_id = $${userIndex}`;
    isLikedSelect = "CASE WHEN b.user_id IS NOT NULL THEN true ELSE false END as is_liked_by_user";
  }

  const sql = `
    SELECT 
      o.id,
      o.baslik,
      o.odak_kavramlar,
      o.sentez_ozeti,
      o.onerilen_okuma_sirasi,
      o.durum,
      o.created_at,
      o.is_public,
      COALESCE(o.like_count, 0) as like_count,
      COALESCE(o.fork_count, 0) as fork_count,
      o.source_session_id,
      ${isLikedSelect}
    FROM anlama_oturumlari o
    ${likeJoin}
    WHERE ${filterClause}
    ORDER BY ${orderBy}
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const res = await query(sql, values);
  const sessions: CommunitySessionDto[] = res.rows.map((r) => ({
    id: r.id,
    baslik: r.baslik,
    odak_kavramlar: r.odak_kavramlar || [],
    sentez_ozeti: r.sentez_ozeti,
    onerilen_okuma_sirasi: r.onerilen_okuma_sirasi || [],
    durum: r.durum,
    created_at: r.created_at?.toISOString?.() || r.created_at,
    is_public: r.is_public,
    like_count: Number(r.like_count),
    fork_count: Number(r.fork_count),
    is_liked_by_user: r.is_liked_by_user,
    source_session_id: r.source_session_id,
  }));

  try {
    await redis.set(cacheKey, JSON.stringify(sessions), "EX", 180);
  } catch {
    // Redis sessizce geç
  }

  return sessions;
}

export async function toggleLike(
  userId: string,
  sessionId: string,
): Promise<LikeResponseDto> {
  const checkSession = await query(
    `SELECT id, is_public, like_count FROM anlama_oturumlari WHERE id = $1`,
    [sessionId],
  );
  if (checkSession.rows.length === 0) {
    throw new Error("NOT_FOUND: Oturum bulunamadı");
  }

  const existing = await query(
    `SELECT 1 FROM topluluk_begenileri WHERE user_id = $1 AND oturum_id = $2`,
    [userId, sessionId],
  );

  let liked: boolean;
  let newLikeCount: number;

  if (existing.rows.length > 0) {
    await query(
      `DELETE FROM topluluk_begenileri WHERE user_id = $1 AND oturum_id = $2`,
      [userId, sessionId],
    );
    const upd = await query(
      `UPDATE anlama_oturumlari SET like_count = GREATEST(0, COALESCE(like_count, 0) - 1) WHERE id = $1 RETURNING like_count`,
      [sessionId],
    );
    liked = false;
    newLikeCount = Number(upd.rows[0].like_count);
  } else {
    await query(
      `INSERT INTO topluluk_begenileri (user_id, oturum_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, sessionId],
    );
    const upd = await query(
      `UPDATE anlama_oturumlari SET like_count = COALESCE(like_count, 0) + 1 WHERE id = $1 RETURNING like_count`,
      [sessionId],
    );
    liked = true;
    newLikeCount = Number(upd.rows[0].like_count);
  }

  // Önbelleği temizle
  const redis = getRedis();
  try {
    const keys = await redis.keys("cache:community:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // sessiz geç
  }

  return { liked, like_count: newLikeCount };
}

export async function forkSession(
  userId: string,
  sessionId: string,
  input: ForkSessionInput = {},
): Promise<CommunitySessionDto> {
  const srcRes = await query(
    `SELECT id, baslik, odak_kavramlar, sentez_ozeti, onerilen_okuma_sirasi, is_public 
     FROM anlama_oturumlari WHERE id = $1`,
    [sessionId],
  );

  if (srcRes.rows.length === 0) {
    throw new Error("NOT_FOUND: Çatallanacak oturum bulunamadı");
  }

  const source = srcRes.rows[0];
  const newTitle = input.target_title || `${source.baslik} (Çatallandı)`;

  const newSessionRes = await query(
    `INSERT INTO anlama_oturumlari (
      kullanici_id, baslik, odak_kavramlar, sentez_ozeti, onerilen_okuma_sirasi, durum, is_public, source_session_id
    ) VALUES ($1, $2, $3, $4, $5, 'tamamlandi', false, $6)
    RETURNING id, baslik, odak_kavramlar, sentez_ozeti, onerilen_okuma_sirasi, durum, created_at, is_public, like_count, fork_count, source_session_id`,
    [
      userId,
      newTitle,
      source.odak_kavramlar,
      source.sentez_ozeti,
      source.onerilen_okuma_sirasi,
      source.id,
    ],
  );

  const newSession = newSessionRes.rows[0];

  // Kaynak oturumun fork_count değerini artır ve çatallama kaydı aç
  await query(
    `UPDATE anlama_oturumlari SET fork_count = COALESCE(fork_count, 0) + 1 WHERE id = $1`,
    [source.id],
  );

  await query(
    `INSERT INTO topluluk_catallamalari (kaynak_oturum_id, yeni_oturum_id, user_id) VALUES ($1, $2, $3)`,
    [source.id, newSession.id, userId],
  );

  // Önbelleği temizle
  const redis = getRedis();
  try {
    const keys = await redis.keys("cache:community:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // sessiz geç
  }

  return {
    id: newSession.id,
    baslik: newSession.baslik,
    odak_kavramlar: newSession.odak_kavramlar || [],
    sentez_ozeti: newSession.sentez_ozeti,
    onerilen_okuma_sirasi: newSession.onerilen_okuma_sirasi || [],
    durum: newSession.durum,
    created_at: newSession.created_at?.toISOString?.() || newSession.created_at,
    is_public: false,
    like_count: 0,
    fork_count: 0,
    is_liked_by_user: false,
    source_session_id: source.id,
  };
}

export async function getCommunityConcepts(): Promise<CommunityConceptDto[]> {
  const redis = getRedis();
  const cacheKey = "cache:community:concepts";

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis hatası sorguyu engellemesin
  }

  const sql = `
    SELECT 
      k.slug,
      k.baslik_tr,
      COUNT(o.id)::int as session_count
    FROM anlama_oturumlari o
    CROSS JOIN LATERAL unnest(o.odak_kavramlar) as concept_slug
    JOIN kavramlar k ON k.slug = concept_slug
    WHERE o.is_public = true
    GROUP BY k.slug, k.baslik_tr
    ORDER BY session_count DESC, k.baslik_tr ASC
    LIMIT 15
  `;

  const res = await query(sql);
  const items: CommunityConceptDto[] = res.rows.map((r) => ({
    slug: r.slug,
    baslik_tr: r.baslik_tr,
    session_count: Number(r.session_count),
  }));

  try {
    await redis.set(cacheKey, JSON.stringify(items), "EX", 300);
  } catch {
    // sessiz geç
  }

  return items;
}
