import { query } from "../../db/client.js";
import { l1Get, l1Set } from "../../db/redis.js";

export interface Sure {
  id: number;
  ad_tr: string;
  ad_ar: string;
  nuzul_sirasi: number;
  donem: string;
  ayet_sayisi: number;
  aciklama: string | null;
}

export interface Ayet {
  id: number;
  sure_id: number;
  ayet_no: number;
  cuz_no: number;
  sayfa_no: number;
  metin_ar: string;
  transliterasyon_tr: string;
  meal_tr: string;
  ses_dosyasi_url: string | null;
}

interface Cached<T> {
  data: T;
  cached: boolean;
}

export async function listSureler(siralama: "mushaf" | "nuzul"): Promise<Cached<Sure[]>> {
  const cacheKey = `quran:sureler:${siralama}`;
  const cached = await l1Get<Sure[]>(cacheKey);
  if (cached) return { data: cached, cached: true };

  const orderCol = siralama === "nuzul" ? "nuzul_sirasi" : "id";
  const res = await query<Sure>(
    `SELECT id, ad_tr, ad_ar, nuzul_sirasi, donem, ayet_sayisi, aciklama FROM sureler ORDER BY ${orderCol} ASC`,
  );
  await l1Set(cacheKey, res.rows);
  return { data: res.rows, cached: false };
}

export async function getSureDetay(sureId: number): Promise<Cached<any | null>> {
  const cacheKey = `quran:sure:${sureId}:detay`;
  const cached = await l1Get<any>(cacheKey);
  if (cached) return { data: cached, cached: true };

  const sureRes = await query<Sure>(
    `SELECT id, ad_tr, ad_ar, nuzul_sirasi, donem, ayet_sayisi, aciklama FROM sureler WHERE id = $1`,
    [sureId],
  );
  const sure = sureRes.rows[0];
  if (!sure) return { data: null, cached: false };

  const bloklarRes = await query(
    `SELECT id, baslangic_ayet, bitis_ayet, baslik_tr, aciklama
     FROM ayet_bloklari WHERE sure_id = $1 ORDER BY baslangic_ayet ASC`,
    [sureId],
  );

  const data = { ...sure, ayet_bloklari: bloklarRes.rows };
  await l1Set(cacheKey, data);
  return { data, cached: false };
}

export async function getAyet(sureId: number, ayetNo: number, lang: "tr" | "en" = "tr"): Promise<Cached<any | null>> {
  const cacheKey = `quran:ayet:${sureId}:${ayetNo}:${lang}`;
  const cached = await l1Get<any>(cacheKey);
  if (cached) return { data: cached, cached: true };

  const ayetRes = await query<Ayet & { meal_en?: string; baglam_en?: string }>(
    `SELECT id, sure_id, ayet_no, cuz_no, sayfa_no, metin_ar, transliterasyon_tr, meal_tr, meal_en, baglam_en, ses_dosyasi_url
     FROM ayetler WHERE sure_id = $1 AND ayet_no = $2`,
    [sureId, ayetNo],
  );
  const ayet = ayetRes.rows[0];
  if (!ayet) return { data: null, cached: false };

  const kelimelerRes = await query(
    `SELECT k.id, k.kelime_no, k.metin_ar, k.metin_tr, k.metin_en, k.vezin, k.start_ms, k.end_ms,
            ko.id AS kok_id, ko.kok_ar, ko.kok_tr
     FROM kelimeler k
     LEFT JOIN kokler ko ON ko.id = k.kok_id
     WHERE k.ayet_id = $1
     ORDER BY k.kelime_no ASC`,
    [ayet.id],
  );

  const activeMeal = lang === "en" ? (ayet.meal_en || ayet.meal_tr) : ayet.meal_tr;
  const data = {
    ...ayet,
    meal: activeMeal,
    kelimeler: kelimelerRes.rows.map((k: any) => ({
      ...k,
      metin_selected: lang === "en" ? (k.metin_en || k.metin_tr) : k.metin_tr,
    })),
  };
  await l1Set(cacheKey, data);
  return { data, cached: false };
}

export async function listAyetler(
  sureId: number,
  page: number,
  limit: number,
  lang: "tr" | "en" = "tr",
): Promise<{ rows: any[]; total: number }> {
  const offset = (page - 1) * limit;
  const [rowsRes, countRes] = await Promise.all([
    query<Ayet & { meal_en?: string; baglam_en?: string }>(
      `SELECT id, sure_id, ayet_no, cuz_no, sayfa_no, metin_ar, transliterasyon_tr, meal_tr, meal_en, baglam_en, ses_dosyasi_url
       FROM ayetler WHERE sure_id = $1 ORDER BY ayet_no ASC LIMIT $2 OFFSET $3`,
      [sureId, limit, offset],
    ),
    query<{ count: string }>(`SELECT COUNT(*) FROM ayetler WHERE sure_id = $1`, [sureId]),
  ]);

  const ayetIds = rowsRes.rows.map((r) => r.id);
  const kelimelerMap: Record<number, any[]> = {};
  if (ayetIds.length > 0) {
    const kelimelerRes = await query(
      `SELECT k.id, k.ayet_id, k.kelime_no, k.metin_ar, k.metin_tr, k.metin_en, k.vezin, k.start_ms, k.end_ms,
              ko.id AS kok_id, ko.kok_ar, ko.kok_tr, ko.kok_anlami
       FROM kelimeler k
       LEFT JOIN kokler ko ON ko.id = k.kok_id
       WHERE k.ayet_id = ANY($1)
       ORDER BY k.ayet_id ASC, k.kelime_no ASC`,
      [ayetIds],
    );
    for (const kRow of kelimelerRes.rows) {
      if (!kelimelerMap[kRow.ayet_id]) kelimelerMap[kRow.ayet_id] = [];
      kelimelerMap[kRow.ayet_id].push({
        ...kRow,
        metin_selected: lang === "en" ? (kRow.metin_en || kRow.metin_tr) : kRow.metin_tr,
      });
    }
  }

  const rows = rowsRes.rows.map((r) => ({
    ...r,
    meal: lang === "en" ? (r.meal_en || r.meal_tr) : r.meal_tr,
    kelimeler: kelimelerMap[r.id] ?? [],
  }));

  return { rows, total: parseInt(countRes.rows[0]?.count ?? "0", 10) };
}

export async function getAyetAudio(ayetId: number): Promise<Cached<any | null>> {
  const cacheKey = `quran:ayet:${ayetId}:audio`;
  const cached = await l1Get<any>(cacheKey);
  if (cached) return { data: cached, cached: true };

  const res = await query(
    `SELECT id, sure_id, ayet_no, ses_dosyasi_url FROM ayetler WHERE id = $1`,
    [ayetId],
  );
  const row = res.rows[0];
  if (!row) return { data: null, cached: false };

  await l1Set(cacheKey, row);
  return { data: row, cached: false };
}

// BE-009: L1 immutable önbelleğin uygulama açılışında ısıtılması.
// 114 sure + detayları ucuz olduğu için tamamı önceden yüklenir; ayet/kelime
// seviyesindeki önbellek ilk istekte doldurulur (lazy warm), bkz. getAyet().
export async function warmL1Cache(): Promise<{ sureler: number; detaylar: number }> {
  const [mushaf, nuzul] = await Promise.all([listSureler("mushaf"), listSureler("nuzul")]);

  const detaylar = await Promise.all(mushaf.data.map((sure) => getSureDetay(sure.id)));

  return { sureler: mushaf.data.length + nuzul.data.length, detaylar: detaylar.length };
}
