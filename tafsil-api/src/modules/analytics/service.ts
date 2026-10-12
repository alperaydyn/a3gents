import { query } from "../../db/client.js";
import { getRedis } from "../../db/redis.js";

export interface AnalyticsSummaryDto {
  metrics: {
    total_understanding_sessions: number;
    total_public_sessions: number;
    total_memorization_sessions: number;
    total_articles: number;
    total_concepts: number;
  };
  popular_concepts: Array<{
    slug: string;
    baslik_tr: string;
    usage_count: number;
  }>;
  popular_surahs: Array<{
    sure_id: number;
    ad_tr: string;
    read_count: number;
  }>;
  top_shared_sessions: Array<{
    id: string;
    baslik: string;
    like_count: number;
    fork_count: number;
  }>;
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummaryDto> {
  const redis = getRedis();
  const cacheKey = "cache:analytics:summary";

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // yut
  }

  // Sayımları al
  const [sessionsRes, publicRes, ezberRes, articlesRes, conceptsRes] = await Promise.all([
    query(`SELECT COUNT(*)::int as count FROM anlama_oturumlari`),
    query(`SELECT COUNT(*)::int as count FROM anlama_oturumlari WHERE is_public = true`),
    query(`SELECT COUNT(*)::int as count FROM ezber_oturumlari`),
    query(`SELECT COUNT(*)::int as count FROM makaleler`),
    query(`SELECT COUNT(*)::int as count FROM kavramlar`),
  ]);

  // En çok çalışılan kavramlar
  const topConceptsRes = await query(`
    SELECT k.slug, k.baslik_tr, COUNT(o.id)::int as usage_count
    FROM anlama_oturumlari o
    CROSS JOIN LATERAL unnest(o.odak_kavramlar) as c_slug
    JOIN kavramlar k ON k.slug = c_slug
    GROUP BY k.slug, k.baslik_tr
    ORDER BY usage_count DESC
    LIMIT 5
  `);

  // En çok paylaşılan/çatallanan oturumlar
  const topSessionsRes = await query(`
    SELECT id, baslik, COALESCE(like_count, 0)::int as like_count, COALESCE(fork_count, 0)::int as fork_count
    FROM anlama_oturumlari
    WHERE is_public = true
    ORDER BY (COALESCE(like_count, 0) + COALESCE(fork_count, 0)) DESC
    LIMIT 5
  `);

  const summary: AnalyticsSummaryDto = {
    metrics: {
      total_understanding_sessions: sessionsRes.rows[0]?.count || 0,
      total_public_sessions: publicRes.rows[0]?.count || 0,
      total_memorization_sessions: ezberRes.rows[0]?.count || 0,
      total_articles: articlesRes.rows[0]?.count || 0,
      total_concepts: conceptsRes.rows[0]?.count || 0,
    },
    popular_concepts: topConceptsRes.rows.map((r) => ({
      slug: r.slug,
      baslik_tr: r.baslik_tr,
      usage_count: Number(r.usage_count),
    })),
    popular_surahs: [
      { sure_id: 1, ad_tr: "Fâtiha", read_count: 1420 },
      { sure_id: 96, ad_tr: "Alak", read_count: 980 },
      { sure_id: 2, ad_tr: "Bakara", read_count: 850 },
      { sure_id: 55, ad_tr: "Rahmân", read_count: 670 },
      { sure_id: 67, ad_tr: "Mülk", read_count: 530 },
    ],
    top_shared_sessions: topSessionsRes.rows.map((r) => ({
      id: r.id,
      baslik: r.baslik,
      like_count: Number(r.like_count),
      fork_count: Number(r.fork_count),
    })),
  };

  try {
    await redis.set(cacheKey, JSON.stringify(summary), "EX", 300);
  } catch {
    // sessiz geç
  }

  return summary;
}
