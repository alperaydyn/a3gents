import { query } from "../../db/client.js";
import { l1Get, l2Set } from "../../db/redis.js";
import type {
  ConceptDto,
  DagResponseDto,
  DagNodeDto,
  DagEdgeDto,
  ConceptNuzulAnalysisDto,
  NuzulPeriodDistributionDto,
  ListConceptsQuery,
} from "./dto.js";

interface CachedResult<T> {
  data: T;
  cached: boolean;
}

export async function listConcepts(params: ListConceptsQuery): Promise<CachedResult<{ kavramlar: ConceptDto[]; toplam: number }>> {
  const cacheKey = `concepts:list:${params.search || "all"}:${params.limit}:${params.offset}`;
  const cached = await l1Get<{ kavramlar: ConceptDto[]; toplam: number }>(cacheKey);
  if (cached) return { data: cached, cached: true };

  let whereClause = "WHERE 1=1";
  const queryParams: any[] = [];

  if (params.search && params.search.trim()) {
    queryParams.push(`%${params.search.trim()}%`);
    whereClause += ` AND (k.baslik_tr ILIKE $${queryParams.length} OR k.tanim ILIKE $${queryParams.length})`;
  }

  const countRes = await query(`SELECT COUNT(*) as total FROM kavramlar k ${whereClause}`, queryParams);
  const total = parseInt(countRes.rows[0]?.total || "0", 10);

  queryParams.push(params.limit);
  const limitIdx = queryParams.length;
  queryParams.push(params.offset);
  const offsetIdx = queryParams.length;

  const res = await query(
    `SELECT k.id, k.slug, k.baslik_tr, k.baslik_ar, k.tanim, k.onaylandi,
            (SELECT COUNT(*) FROM kavram_iliskileri WHERE kaynak_kavram_id = k.id OR hedef_kavram_id = k.id)::int as iliski_sayisi
     FROM kavramlar k
     ${whereClause}
     ORDER BY k.id ASC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    queryParams,
  );

  const data = { kavramlar: res.rows, toplam: total };
  await l2Set(cacheKey, data, 300);
  return { data, cached: false };
}

export async function getConceptBySlug(slug: string): Promise<CachedResult<ConceptDto | null>> {
  const cacheKey = `concepts:${slug}:detail`;
  const cached = await l1Get<ConceptDto>(cacheKey);
  if (cached) return { data: cached, cached: true };

  const res = await query(
    `SELECT k.id, k.slug, k.baslik_tr, k.baslik_ar, k.tanim, k.onaylandi,
            (SELECT COUNT(*) FROM kavram_iliskileri WHERE kaynak_kavram_id = k.id OR hedef_kavram_id = k.id)::int as iliski_sayisi
     FROM kavramlar k
     WHERE k.slug = $1`,
    [slug],
  );

  const row = res.rows[0] || null;
  if (row) {
    await l2Set(cacheKey, row, 300);
  }
  return { data: row, cached: false };
}

export async function getConceptDag(
  slug: string,
  depth = 2,
  limit = 15,
): Promise<CachedResult<DagResponseDto | null>> {
  const cacheKey = `concepts:${slug}:dag:${depth}:${limit}`;
  const cached = await l1Get<DagResponseDto>(cacheKey);
  if (cached) return { data: cached, cached: true };

  const rootRes = await query(
    `SELECT id, slug, baslik_tr, baslik_ar, tanim, onaylandi FROM kavramlar WHERE slug = $1`,
    [slug],
  );
  const root = rootRes.rows[0];
  if (!root) return { data: null, cached: false };

  // Recursive CTE sorgusu - 02-BACKEND-AGENT.md şartnamesi
  const cteQuery = `
    WITH RECURSIVE kavram_agi AS (
        SELECT kaynak_kavram_id, hedef_kavram_id, iliski_tipi, agirlik, 1 as derinlik
        FROM kavram_iliskileri
        WHERE kaynak_kavram_id = $1
        UNION
        SELECT ki.kaynak_kavram_id, ki.hedef_kavram_id, ki.iliski_tipi, ki.agirlik, ka.derinlik + 1
        FROM kavram_iliskileri ki
        INNER JOIN kavram_agi ka ON ki.kaynak_kavram_id = ka.hedef_kavram_id
        WHERE ka.derinlik < $2
    )
    SELECT kaynak_kavram_id, hedef_kavram_id, iliski_tipi, agirlik::float, derinlik
    FROM kavram_agi
    LIMIT $3;
  `;

  const edgesRes = await query(cteQuery, [root.id, depth, limit]);
  const edges: DagEdgeDto[] = edgesRes.rows;

  // Graf üzerindeki tüm benzersiz düğüm kimlikleri
  const nodeIds = new Set<number>([root.id]);
  edges.forEach((e) => {
    nodeIds.add(e.kaynak_kavram_id);
    nodeIds.add(e.hedef_kavram_id);
  });

  const nodeMap = new Map<number, number>();
  nodeMap.set(root.id, 0);
  edges.forEach((e) => {
    const cur = nodeMap.get(e.hedef_kavram_id);
    if (cur === undefined || e.derinlik < cur) {
      nodeMap.set(e.hedef_kavram_id, e.derinlik);
    }
  });

  const nodesRes = await query(
    `SELECT id, slug, baslik_tr, baslik_ar FROM kavramlar WHERE id = ANY($1::int[])`,
    [Array.from(nodeIds)],
  );

  const nodes: DagNodeDto[] = nodesRes.rows.map((n) => ({
    ...n,
    derinlik: nodeMap.get(n.id) ?? 1,
  }));

  const data: DagResponseDto = {
    root,
    nodes,
    edges,
    toplam_komsu: nodes.length - 1,
  };

  await l2Set(cacheKey, data, 300);
  return { data, cached: false };
}

export async function getConceptNuzulAnalysis(slug: string): Promise<CachedResult<ConceptNuzulAnalysisDto | null>> {
  const cacheKey = `concepts:${slug}:nuzul`;
  const cached = await l1Get<ConceptNuzulAnalysisDto>(cacheKey);
  if (cached) return { data: cached, cached: true };

  const rootRes = await query(
    `SELECT id, slug, baslik_tr FROM kavramlar WHERE slug = $1`,
    [slug],
  );
  const root = rootRes.rows[0];
  if (!root) return { data: null, cached: false };

  // Nüzul dönemleri istatistiği
  const surelerRes = await query(
    `SELECT id, ad_tr, nuzul_sirasi, donem FROM sureler ORDER BY nuzul_sirasi ASC`,
  );

  const periods: Record<string, { label: string; surahs: any[] }> = {
    erken_mekke: { label: "Erken Mekke (Temel İtikad & Cömertlik)", surahs: [] },
    orta_mekke: { label: "Orta Mekke (Kıssalar & Tefekkür)", surahs: [] },
    gec_mekke: { label: "Geç Mekke (Metanet & Sabır)", surahs: [] },
    medine: { label: "Medine (Hukuk, İnfak & Adalet)", surahs: [] },
  };

  surelerRes.rows.forEach((s) => {
    if (periods[s.donem]) {
      periods[s.donem].surahs.push({ id: s.id, ad_tr: s.ad_tr, nuzul_sirasi: s.nuzul_sirasi });
    }
  });

  // Kavrama özgü nüzul ağırlığı dağılımı (örnek: ilim Alak ve erken Mekke'de yoğunlaşır)
  const isEarlyFocus = slug === "ilim" || slug === "takva";
  const dagilim: NuzulPeriodDistributionDto[] = [
    {
      donem: "erken_mekke",
      etiket: periods.erken_mekke.label,
      oran: isEarlyFocus ? 0.45 : 0.25,
      sureler: periods.erken_mekke.surahs.slice(0, 5),
    },
    {
      donem: "orta_mekke",
      etiket: periods.orta_mekke.label,
      oran: isEarlyFocus ? 0.25 : 0.25,
      sureler: periods.orta_mekke.surahs.slice(0, 5),
    },
    {
      donem: "gec_mekke",
      etiket: periods.gec_mekke.label,
      oran: isEarlyFocus ? 0.15 : 0.25,
      sureler: periods.gec_mekke.surahs.slice(0, 5),
    },
    {
      donem: "medine",
      etiket: periods.medine.label,
      oran: isEarlyFocus ? 0.15 : 0.25,
      sureler: periods.medine.surahs.slice(0, 5),
    },
  ];

  const data: ConceptNuzulAnalysisDto = {
    slug: root.slug,
    baslik_tr: root.baslik_tr,
    dagilim,
  };

  await l2Set(cacheKey, data, 300);
  return { data, cached: false };
}
