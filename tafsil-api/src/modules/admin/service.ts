import { query } from "../../db/client.js";
import { getRedis } from "../../db/redis.js";
import { verifyQuranReferences } from "../editorial/service.js";
import type {
  AdminDashboardStatsDto,
  ModerateCommunityStudyDto,
  CreateArticleDto,
  UpdateArticleDto,
  CreateConceptDto,
  CreateConceptRelationDto,
} from "./dto.js";

export async function getAdminDashboardMetrics(): Promise<AdminDashboardStatsDto> {
  const redis = getRedis();

  // 1. Kullanıcı sayıları ve mod tercihleri
  const userStatsRes = await query(`
    SELECT 
      COUNT(*) AS total_users,
      COUNT(*) FILTER (WHERE tercih_modu = 'kesif') AS kesif_count,
      COUNT(*) FILTER (WHERE tercih_modu = 'ogrenme') AS ogrenme_count,
      COUNT(*) FILTER (WHERE tercih_modu = 'odak') AS odak_count
    FROM kullanicilar
  `);

  // 2. Topluluk oturumları
  const sessionsRes = await query(`
    SELECT 
      COUNT(*) AS total_sessions,
      COUNT(*) FILTER (WHERE is_public = true) AS public_sessions,
      COUNT(*) FILTER (WHERE is_featured = true) AS featured_sessions
    FROM anlama_oturumlari
  `);

  // 3. Makaleler
  const articlesRes = await query(`
    SELECT 
      COUNT(*) AS total_articles,
      COUNT(*) FILTER (WHERE is_verified = true) AS verified_articles
    FROM makaleler
  `);

  // 4. Ezber turları
  const memorizationRes = await query(`
    SELECT COALESCE(SUM(repetition_number), 0) AS total_rounds FROM ezber_oturumlari
  `);

  // 5. Redis ve DB Durumu
  let redisConnected = false;
  try {
    const pong = await redis.ping();
    redisConnected = pong === "PONG";
  } catch {
    redisConnected = false;
  }

  const uRow = userStatsRes.rows[0] || {};
  const sRow = sessionsRes.rows[0] || {};
  const aRow = articlesRes.rows[0] || {};
  const mRow = memorizationRes.rows[0] || {};

  const memoryUsage = process.memoryUsage();

  return {
    metrics: {
      totalUsers: parseInt(uRow.total_users || "0", 10),
      totalPublicSessions: parseInt(sRow.public_sessions || "0", 10),
      totalArticles: parseInt(aRow.total_articles || "0", 10),
      verifiedArticles: parseInt(aRow.verified_articles || "0", 10),
      totalMemorizationRounds: parseInt(mRow.total_rounds || "0", 10),
      modeDistribution: {
        kesif: parseInt(uRow.kesif_count || "0", 10),
        ogrenme: parseInt(uRow.ogrenme_count || "0", 10),
        odak: parseInt(uRow.odak_count || "0", 10),
      },
    },
    system: {
      nodeEnv: process.env.NODE_ENV || "development",
      uptimeSeconds: Math.floor(process.uptime()),
      redisConnected,
      dbConnected: true,
      memoryUsageMb: Math.round(memoryUsage.rss / 1024 / 1024),
    },
  };
}

export async function listCommunityModeration(status?: string, limit = 50, offset = 0) {
  let queryText = `
    SELECT id, baslik, durum, is_public, is_featured, moderation_status,
           like_count, fork_count, created_at
    FROM anlama_oturumlari
    WHERE is_public = true
  `;
  const params: any[] = [];

  if (status) {
    params.push(status);
    queryText += ` AND moderation_status = $${params.length}`;
  }

  queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const res = await query(queryText, params);
  return res.rows;
}

export async function moderateCommunitySession(
  adminId: string,
  sessionId: string,
  data: ModerateCommunityStudyDto,
) {
  const updates: string[] = [];
  const params: any[] = [sessionId];

  if (typeof data.is_featured === "boolean") {
    params.push(data.is_featured);
    updates.push(`is_featured = $${params.length}`);
  }

  if (data.moderation_status) {
    params.push(data.moderation_status);
    updates.push(`moderation_status = $${params.length}`);
  }

  if (updates.length === 0) {
    throw new Error("Güncellenecek alan belirtilmedi");
  }

  const sql = `UPDATE anlama_oturumlari SET ${updates.join(", ")} WHERE id = $1 RETURNING id, baslik, is_featured, moderation_status`;
  const res = await query(sql, params);

  if (res.rows.length === 0) {
    throw new Error("Oturum bulunamadı");
  }

  // Audit log
  await query(
    `INSERT INTO admin_denetim_kayitlari (admin_id, islem_tipi, hedef_varlik, hedef_id, detaylar)
     VALUES ($1, 'moderate_community_session', 'anlama_oturumlari', $2, $3)`,
    [adminId, sessionId, JSON.stringify(data)],
  );

  return res.rows[0];
}

export async function createArticle(adminId: string, data: CreateArticleDto) {
  // Canlı referans puanı hesapla
  const verification = verifyQuranReferences(data.content_md);
  const score = verification.total_score;
  const isVerified = score >= 85;

  const res = await query(
    `INSERT INTO makaleler (slug, title, author, date, summary, content_md, primary_concepts, related_surahs, reading_time_minutes, reference_score, is_verified)
     VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      data.slug,
      data.title,
      data.author,
      data.summary,
      data.content_md,
      data.primary_concepts || [],
      data.related_surahs || [],
      data.reading_time_minutes || 5,
      score,
      isVerified,
    ],
  );

  // Önbelleği temizle
  try {
    const redis = getRedis();
    await redis.del("cache:editorial:articles:list");
  } catch {
    // ignore
  }

  await query(
    `INSERT INTO admin_denetim_kayitlari (admin_id, islem_tipi, hedef_varlik, hedef_id, detaylar)
     VALUES ($1, 'create_article', 'makaleler', $2, $3)`,
    [adminId, data.slug, JSON.stringify({ title: data.title, score })],
  );

  return res.rows[0];
}

export async function updateArticle(adminId: string, slug: string, data: UpdateArticleDto) {
  const updates: string[] = [];
  const params: any[] = [slug];

  if (data.title) {
    params.push(data.title);
    updates.push(`title = $${params.length}`);
  }
  if (data.summary) {
    params.push(data.summary);
    updates.push(`summary = $${params.length}`);
  }
  if (data.content_md) {
    params.push(data.content_md);
    updates.push(`content_md = $${params.length}`);
    const verification = verifyQuranReferences(data.content_md);
    params.push(verification.total_score);
    updates.push(`reference_score = $${params.length}`);
    params.push(verification.total_score >= 85);
    updates.push(`is_verified = $${params.length}`);
  }
  if (data.primary_concepts) {
    params.push(data.primary_concepts);
    updates.push(`primary_concepts = $${params.length}`);
  }
  if (data.related_surahs) {
    params.push(data.related_surahs);
    updates.push(`related_surahs = $${params.length}`);
  }
  if (data.reading_time_minutes) {
    params.push(data.reading_time_minutes);
    updates.push(`reading_time_minutes = $${params.length}`);
  }
  if (typeof data.is_verified === "boolean") {
    params.push(data.is_verified);
    updates.push(`is_verified = $${params.length}`);
  }

  if (updates.length === 0) {
    throw new Error("Güncellenecek alan belirtilmedi");
  }

  const sql = `UPDATE makaleler SET ${updates.join(", ")} WHERE slug = $1 RETURNING *`;
  const res = await query(sql, params);

  if (res.rows.length === 0) {
    throw new Error("Makale bulunamadı");
  }

  try {
    const redis = getRedis();
    await redis.del("cache:editorial:articles:list");
    await redis.del(`cache:editorial:article:${slug}`);
  } catch {
    // ignore
  }

  await query(
    `INSERT INTO admin_denetim_kayitlari (admin_id, islem_tipi, hedef_varlik, hedef_id, detaylar)
     VALUES ($1, 'update_article', 'makaleler', $2, $3)`,
    [adminId, slug, JSON.stringify(data)],
  );

  return res.rows[0];
}

export async function createConcept(adminId: string, data: CreateConceptDto) {
  const res = await query(
    `INSERT INTO kavramlar (slug, baslik_tr, baslik_ar, tanim, onaylandi)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (slug) DO UPDATE
     SET baslik_tr = $2, baslik_ar = $3, tanim = $4, onaylandi = $5
     RETURNING *`,
    [data.slug, data.baslik_tr, data.baslik_ar || null, data.tanim, data.onaylandi ?? true],
  );

  await query(
    `INSERT INTO admin_denetim_kayitlari (admin_id, islem_tipi, hedef_varlik, hedef_id, detaylar)
     VALUES ($1, 'create_concept', 'kavramlar', $2, $3)`,
    [adminId, data.slug, JSON.stringify(data)],
  );

  return res.rows[0];
}

export async function createConceptRelation(adminId: string, data: CreateConceptRelationDto) {
  const res = await query(
    `INSERT INTO kavram_iliskileri (kaynak_kavram_id, hedef_kavram_id, iliski_tipi, agirlik)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (kaynak_kavram_id, hedef_kavram_id, iliski_tipi) DO UPDATE
     SET agirlik = $4
     RETURNING *`,
    [data.kaynak_kavram_id, data.hedef_kavram_id, data.iliski_tipi, data.agirlik || 1.0],
  );

  await query(
    `INSERT INTO admin_denetim_kayitlari (admin_id, islem_tipi, hedef_varlik, hedef_id, detaylar)
     VALUES ($1, 'create_concept_relation', 'kavram_iliskileri', $2, $3)`,
    [adminId, `${data.kaynak_kavram_id}->${data.hedef_kavram_id}`, JSON.stringify(data)],
  );

  return res.rows[0];
}
