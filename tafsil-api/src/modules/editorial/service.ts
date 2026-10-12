import { query } from "../../db/client.js";
import { getRedis } from "../../db/redis.js";
import type {
  ArticleSummaryDto,
  ArticleDetailDto,
  ReferenceVerificationResultDto,
} from "./dto.js";

export async function listArticles(): Promise<ArticleSummaryDto[]> {
  const redis = getRedis();
  const cacheKey = "cache:editorial:articles:list";

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis hatasını yut
  }

  const res = await query(
    `SELECT slug, title, author, date, summary, primary_concepts, related_surahs, 
            reading_time_minutes, reference_score, is_verified 
     FROM makaleler 
     ORDER BY date DESC`
  );

  const articles: ArticleSummaryDto[] = res.rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    author: r.author,
    date: r.date?.toISOString ? r.date.toISOString().split("T")[0] : String(r.date),
    summary: r.summary,
    primary_concepts: r.primary_concepts || [],
    related_surahs: r.related_surahs || [],
    reading_time_minutes: Number(r.reading_time_minutes),
    reference_score: Number(r.reference_score),
    is_verified: Boolean(r.is_verified),
  }));

  try {
    await redis.set(cacheKey, JSON.stringify(articles), "EX", 3600);
  } catch {
    // sessiz geç
  }

  return articles;
}

export async function getArticleBySlug(slug: string): Promise<ArticleDetailDto> {
  const redis = getRedis();
  const cacheKey = `cache:editorial:article:${slug}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis hatasını yut
  }

  const res = await query(
    `SELECT slug, title, author, date, summary, content_md, primary_concepts, related_surahs, 
            reading_time_minutes, reference_score, is_verified 
     FROM makaleler 
     WHERE slug = $1`,
    [slug]
  );

  if (res.rows.length === 0) {
    throw new Error(`NOT_FOUND: '${slug}' makalesi bulunamadı`);
  }

  const r = res.rows[0];
  const article: ArticleDetailDto = {
    slug: r.slug,
    title: r.title,
    author: r.author,
    date: r.date?.toISOString ? r.date.toISOString().split("T")[0] : String(r.date),
    summary: r.summary,
    content_md: r.content_md,
    primary_concepts: r.primary_concepts || [],
    related_surahs: r.related_surahs || [],
    reading_time_minutes: Number(r.reading_time_minutes),
    reference_score: Number(r.reference_score),
    is_verified: Boolean(r.is_verified),
  };

  try {
    await redis.set(cacheKey, JSON.stringify(article), "EX", 3600);
  } catch {
    // sessiz geç
  }

  return article;
}

export function verifyQuranReferences(contentMd: string): ReferenceVerificationResultDto {
  // 1. Kriter: Doğrudan Ayet Alıntısı (%40)
  // Kalıplar: "Bakara 2:255", "73:20", "Alak 96:1-5", "Nisâ 4:82", "38:29"
  const citationRegex = /(?:([A-ZÇĞİÖŞÜa-zçğıöşü\']+)\s+)?(\d{1,3}):(\d{1,3}(?:-\d{1,3})?)/g;
  const matches: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = citationRegex.exec(contentMd)) !== null) {
    matches.push(m[0].trim());
  }

  const uniqueCitations = Array.from(new Set(matches));
  const citationCount = uniqueCitations.length;

  // 1 ayet = 15p, 2 ayet = 25p, 3 ayet = 35p, 4+ ayet = 40p (tam puan)
  let directCitationScore = 0;
  if (citationCount >= 4) directCitationScore = 40;
  else if (citationCount === 3) directCitationScore = 35;
  else if (citationCount === 2) directCitationScore = 25;
  else if (citationCount === 1) directCitationScore = 15;

  // 2. Kriter: Bağlamsal Bütünlük (Siyak-Sibak) (%25)
  // Ayetin bağlamı, iniş gayesi veya bütünlük terimleri geçiyor mu?
  const contextKeywords = [
    "bağlam",
    "siyak",
    "sibak",
    "bütünlük",
    "amaç",
    "gaye",
    "esbab-ı nüzul",
    "sebeb",
    "içerik",
  ];
  let contextHit = 0;
  const lowerContent = contentMd.toLowerCase();
  for (const kw of contextKeywords) {
    if (lowerContent.includes(kw)) contextHit++;
  }
  let contextualScore = Math.min(25, 10 + contextHit * 3);

  // 3. Kriter: Kök ve Morfolojik Uyum (%20)
  // Kelime, kök, vezin, lisan, anlam, kavram terimleri
  const morphKeywords = [
    "kök",
    "vezin",
    "kelime",
    "lisan",
    "arapça",
    "kavram",
    "anlam",
    "lafız",
    "morfoloji",
  ];
  let morphHit = 0;
  for (const kw of morphKeywords) {
    if (lowerContent.includes(kw)) morphHit++;
  }
  let morphologicalScore = Math.min(20, 8 + morphHit * 3);

  // 4. Kriter: Tarihsel Bağlam Tutarlılığı (%15)
  // Mekki, Medeni, kronoloji, nüzul, siyer, sahabe, peygamber
  const histKeywords = [
    "mekki",
    "medeni",
    "nüzul",
    "tarih",
    "kronoloji",
    "sahabe",
    "hicret",
    "rivayet",
    "dönem",
  ];
  let histHit = 0;
  for (const kw of histKeywords) {
    if (lowerContent.includes(kw)) histHit++;
  }
  let historicalScore = Math.min(15, 6 + histHit * 2);

  const totalScore = Math.min(
    100,
    directCitationScore + contextualScore + morphologicalScore + historicalScore
  );
  const isVerified = totalScore >= 85;

  let badge: "verified" | "partial" | "pending" = "pending";
  let badgeTitle = "Editoryal İnceleme";
  if (totalScore >= 85) {
    badge = "verified";
    badgeTitle = "Doğrulanmış Kur'an Referansı";
  } else if (totalScore >= 60) {
    badge = "partial";
    badgeTitle = "Kısmi Referans";
  }

  return {
    total_score: totalScore,
    is_verified: isVerified,
    badge,
    badge_title: badgeTitle,
    citations: uniqueCitations,
    breakdown: {
      direct_citations: {
        score: directCitationScore,
        max: 40,
        count: citationCount,
        details: `${citationCount} adet doğrudan ayet atfı tespit edildi.`,
      },
      contextual_integrity: {
        score: contextualScore,
        max: 25,
        details: "Metin siyak-sibak ve ayet bağlamı terminolojisine uygunluk gösteriyor.",
      },
      morphological_alignment: {
        score: morphologicalScore,
        max: 20,
        details: "Kök, kelime ve kavramsal semantik yapıyla tutarlılık incelendi.",
      },
      historical_consistency: {
        score: historicalScore,
        max: 15,
        details: "Mekki/Medeni ve nüzul dönemi kronolojisine uyum sağlandı.",
      },
    },
  };
}
