"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSureler = listSureler;
exports.getSureDetay = getSureDetay;
exports.getAyet = getAyet;
exports.listAyetler = listAyetler;
exports.getAyetAudio = getAyetAudio;
exports.warmL1Cache = warmL1Cache;
const client_js_1 = require("../../db/client.js");
const redis_js_1 = require("../../db/redis.js");
async function listSureler(siralama) {
    const cacheKey = `quran:sureler:${siralama}`;
    const cached = await (0, redis_js_1.l1Get)(cacheKey);
    if (cached)
        return { data: cached, cached: true };
    const orderCol = siralama === "nuzul" ? "nuzul_sirasi" : "id";
    const res = await (0, client_js_1.query)(`SELECT id, ad_tr, ad_ar, nuzul_sirasi, donem, ayet_sayisi, aciklama FROM sureler ORDER BY ${orderCol} ASC`);
    await (0, redis_js_1.l1Set)(cacheKey, res.rows);
    return { data: res.rows, cached: false };
}
async function getSureDetay(sureId) {
    const cacheKey = `quran:sure:${sureId}:detay`;
    const cached = await (0, redis_js_1.l1Get)(cacheKey);
    if (cached)
        return { data: cached, cached: true };
    const sureRes = await (0, client_js_1.query)(`SELECT id, ad_tr, ad_ar, nuzul_sirasi, donem, ayet_sayisi, aciklama FROM sureler WHERE id = $1`, [sureId]);
    const sure = sureRes.rows[0];
    if (!sure)
        return { data: null, cached: false };
    const bloklarRes = await (0, client_js_1.query)(`SELECT id, baslangic_ayet, bitis_ayet, baslik_tr, aciklama
     FROM ayet_bloklari WHERE sure_id = $1 ORDER BY baslangic_ayet ASC`, [sureId]);
    const data = { ...sure, ayet_bloklari: bloklarRes.rows };
    await (0, redis_js_1.l1Set)(cacheKey, data);
    return { data, cached: false };
}
async function getAyet(sureId, ayetNo, lang = "tr") {
    const cacheKey = `quran:ayet:${sureId}:${ayetNo}:${lang}`;
    const cached = await (0, redis_js_1.l1Get)(cacheKey);
    if (cached)
        return { data: cached, cached: true };
    const ayetRes = await (0, client_js_1.query)(`SELECT id, sure_id, ayet_no, cuz_no, sayfa_no, metin_ar, transliterasyon_tr, meal_tr, meal_en, baglam_en, ses_dosyasi_url
     FROM ayetler WHERE sure_id = $1 AND ayet_no = $2`, [sureId, ayetNo]);
    const ayet = ayetRes.rows[0];
    if (!ayet)
        return { data: null, cached: false };
    const kelimelerRes = await (0, client_js_1.query)(`SELECT k.id, k.kelime_no, k.metin_ar, k.metin_tr, k.metin_en, k.vezin, k.start_ms, k.end_ms,
            ko.id AS kok_id, ko.kok_ar, ko.kok_tr
     FROM kelimeler k
     LEFT JOIN kokler ko ON ko.id = k.kok_id
     WHERE k.ayet_id = $1
     ORDER BY k.kelime_no ASC`, [ayet.id]);
    const activeMeal = lang === "en" ? (ayet.meal_en || ayet.meal_tr) : ayet.meal_tr;
    const data = {
        ...ayet,
        meal: activeMeal,
        kelimeler: kelimelerRes.rows.map((k) => ({
            ...k,
            metin_selected: lang === "en" ? (k.metin_en || k.metin_tr) : k.metin_tr,
        })),
    };
    await (0, redis_js_1.l1Set)(cacheKey, data);
    return { data, cached: false };
}
async function listAyetler(sureId, page, limit, lang = "tr") {
    const offset = (page - 1) * limit;
    const [rowsRes, countRes] = await Promise.all([
        (0, client_js_1.query)(`SELECT id, sure_id, ayet_no, cuz_no, sayfa_no, metin_ar, transliterasyon_tr, meal_tr, meal_en, baglam_en, ses_dosyasi_url
       FROM ayetler WHERE sure_id = $1 ORDER BY ayet_no ASC LIMIT $2 OFFSET $3`, [sureId, limit, offset]),
        (0, client_js_1.query)(`SELECT COUNT(*) FROM ayetler WHERE sure_id = $1`, [sureId]),
    ]);
    const ayetIds = rowsRes.rows.map((r) => r.id);
    const kelimelerMap = {};
    if (ayetIds.length > 0) {
        const kelimelerRes = await (0, client_js_1.query)(`SELECT k.id, k.ayet_id, k.kelime_no, k.metin_ar, k.metin_tr, k.metin_en, k.vezin, k.start_ms, k.end_ms,
              ko.id AS kok_id, ko.kok_ar, ko.kok_tr, ko.kok_anlami
       FROM kelimeler k
       LEFT JOIN kokler ko ON ko.id = k.kok_id
       WHERE k.ayet_id = ANY($1)
       ORDER BY k.ayet_id ASC, k.kelime_no ASC`, [ayetIds]);
        for (const kRow of kelimelerRes.rows) {
            if (!kelimelerMap[kRow.ayet_id])
                kelimelerMap[kRow.ayet_id] = [];
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
async function getAyetAudio(ayetId) {
    const cacheKey = `quran:ayet:${ayetId}:audio`;
    const cached = await (0, redis_js_1.l1Get)(cacheKey);
    if (cached)
        return { data: cached, cached: true };
    const res = await (0, client_js_1.query)(`SELECT id, sure_id, ayet_no, ses_dosyasi_url FROM ayetler WHERE id = $1`, [ayetId]);
    const row = res.rows[0];
    if (!row)
        return { data: null, cached: false };
    await (0, redis_js_1.l1Set)(cacheKey, row);
    return { data: row, cached: false };
}
// BE-009: L1 immutable önbelleğin uygulama açılışında ısıtılması.
// 114 sure + detayları ucuz olduğu için tamamı önceden yüklenir; ayet/kelime
// seviyesindeki önbellek ilk istekte doldurulur (lazy warm), bkz. getAyet().
async function warmL1Cache() {
    const [mushaf, nuzul] = await Promise.all([listSureler("mushaf"), listSureler("nuzul")]);
    const detaylar = await Promise.all(mushaf.data.map((sure) => getSureDetay(sure.id)));
    return { sureler: mushaf.data.length + nuzul.data.length, detaylar: detaylar.length };
}
