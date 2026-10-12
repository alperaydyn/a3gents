import { query } from "../../db/client.js";
import { l1Get, l1Set } from "../../db/redis.js";

interface Cached<T> {
  data: T;
  cached: boolean;
}

export async function getKelime(id: number): Promise<Cached<any | null>> {
  const cacheKey = `lexicon:word:${id}`;
  const cached = await l1Get<any>(cacheKey);
  if (cached) return { data: cached, cached: true };

  const res = await query(
    `SELECT k.id, k.ayet_id, k.kelime_no, k.metin_ar, k.metin_tr, k.vezin, k.start_ms, k.end_ms,
            ko.id AS kok_id, ko.kok_ar, ko.kok_tr, ko.kok_anlami,
            a.sure_id, a.ayet_no
     FROM kelimeler k
     LEFT JOIN kokler ko ON ko.id = k.kok_id
     JOIN ayetler a ON a.id = k.ayet_id
     WHERE k.id = $1`,
    [id],
  );
  const row = res.rows[0];
  if (!row) return { data: null, cached: false };

  await l1Set(cacheKey, row);
  return { data: row, cached: false };
}

export async function getKokTurevleri(kokId: number): Promise<Cached<any | null>> {
  const cacheKey = `lexicon:kok:${kokId}:turevler`;
  const cached = await l1Get<any>(cacheKey);
  if (cached) return { data: cached, cached: true };

  const kokRes = await query(`SELECT id, kok_ar, kok_tr, kok_anlami FROM kokler WHERE id = $1`, [kokId]);
  const kok = kokRes.rows[0];
  if (!kok) return { data: null, cached: false };

  const [dagilimRes, turevlerRes] = await Promise.all([
    query(
      `SELECT k.metin_ar, count(*)::int as count, max(k.vezin) as vezin
       FROM kelimeler k
       WHERE k.kok_id = $1
       GROUP BY k.metin_ar
       ORDER BY count DESC
       LIMIT 12`,
      [kokId],
    ),
    query(
      `SELECT k.id, k.metin_ar, k.metin_tr, k.vezin, k.kelime_no, a.sure_id, a.ayet_no
       FROM kelimeler k
       JOIN ayetler a ON a.id = k.ayet_id
       WHERE k.kok_id = $1
       ORDER BY a.sure_id ASC, a.ayet_no ASC, k.kelime_no ASC
       LIMIT 50`,
      [kokId],
    ),
  ]);

  const toplamRes = await query<{ count: string }>(
    `SELECT count(*)::int as count FROM kelimeler WHERE kok_id = $1`,
    [kokId],
  );

  const data = {
    kok,
    dagilim: dagilimRes.rows,
    turevler: turevlerRes.rows,
    toplam: parseInt(toplamRes.rows[0]?.count ?? "0", 10),
  };
  await l1Set(cacheKey, data);
  return { data, cached: false };
}

export async function searchKokler(queryText: string, limit = 20): Promise<any[]> {
  const term = `%${queryText.trim()}%`;
  const res = await query(
    `SELECT id, kok_ar, kok_tr, kok_anlami
     FROM kokler
     WHERE kok_ar ILIKE $1 OR kok_tr ILIKE $1 OR kok_anlami ILIKE $1
     ORDER BY length(kok_tr) ASC
     LIMIT $2`,
    [term, limit],
  );
  return res.rows;
}

