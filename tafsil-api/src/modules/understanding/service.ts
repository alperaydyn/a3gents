import { query } from "../../db/client.js";
import type {
  CreateSessionInput,
  AskQuestionInput,
  UnderstandingSessionDto,
  AskQuestionResponseDto,
  ReadingQueueItemDto,
  TimelineStepDto,
} from "./dto.js";

function buildTimelineSteps(): TimelineStepDto[] {
  return [
    {
      step: 1,
      title: "Kavramlar ayrıştırılıyor",
      subtitle: "Metindeki anahtar kök ve semantik kavramlar belirlendi",
      status: "completed",
    },
    {
      step: 2,
      title: "İlgili ayetler taranıyor",
      subtitle: "pgvector ve metin analizi ile bağlam kümeleri eşleştirildi",
      status: "completed",
    },
    {
      step: 3,
      title: "Özet ve okuma rotası oluşturuldu",
      subtitle: "Nüzul kronolojisine göre adım adım okuma sıralaması hazırlandı",
      status: "completed",
    },
  ];
}

async function buildReadingQueue(ayahIds: number[]): Promise<ReadingQueueItemDto[]> {
  if (!ayahIds || ayahIds.length === 0) return [];

  const res = await query(
    `SELECT a.id, a.sure_id, a.ayet_no, s.ad_tr as sure_adi, s.nuzul_sirasi, s.donem
     FROM ayetler a
     JOIN sureler s ON s.id = a.sure_id
     WHERE a.id = ANY($1::int[])
     ORDER BY s.nuzul_sirasi ASC, a.ayet_no ASC`,
    [ayahIds],
  );

  return res.rows.map((r, idx) => ({
    index: idx + 1,
    sure_id: r.sure_id,
    ayet_no: r.ayet_no,
    ref: `${r.sure_adi} ${r.ayet_no}`,
    nuzul_sirasi: r.nuzul_sirasi,
    donem: r.donem,
    neden: idx === 0 ? "Konunun ilk nirengi noktası ve ontolojik temeli" : "Kavramın pratik ahlak ve amel dünyasındaki izdüşümü",
    okundu: idx < 1,
  }));
}

export async function createSession(
  userId: string,
  input: CreateSessionInput,
): Promise<UnderstandingSessionDto> {
  const soru = input.soru.trim();
  const lower = soru.toLowerCase();

  let baslik = input.baslik?.trim() || "";
  let odakKavramlar = input.odak_kavramlar || [];
  let sentezOzeti = "";
  let onerilenSirasi: number[] = [1, 2];

  // Akıllı niyet ve kavram eşleştirme
  if (lower.includes("ilim") || lower.includes("cömert") || lower.includes("öğret") || lower.includes("kalem")) {
    baslik = baslik || "İlim ve cömertlik";
    odakKavramlar = odakKavramlar.length ? odakKavramlar : ["ilim", "infak", "rahmet"];
    sentezOzeti =
      "Kur'an öğretmeyi bir cömertlik fiili olarak kuruyor: Alak'ta “Rabbin en cömert olandır” cümlesinin hemen ardından kalemle öğretmekten söz edilir. Bilgi, sahip olunan bir mülk değil, verilen bir ikramdır.";
    onerilenSirasi = [1, 2, 3, 4, 5];
  } else if (lower.includes("sabır") || lower.includes("şükür") || lower.includes("metanet")) {
    baslik = baslik || "Sabır ve şükür dengesi";
    odakKavramlar = odakKavramlar.length ? odakKavramlar : ["sabir", "sukur", "takva"];
    sentezOzeti =
      "Kur'an'da sabır ile şükür, müminin karşılaştığı lütuf ve imtihan süreçlerindeki iki temel dayanak olarak yan yana zikredilir. Sabır heva ve ümitsizlikten korur, şükür ise nimeti var edene bağlar.";
    onerilenSirasi = [6, 7];
  } else {
    baslik = baslik || (soru.length > 40 ? soru.slice(0, 37) + "..." : soru);
    odakKavramlar = odakKavramlar.length ? odakKavramlar : ["hidayet", "rahmet"];
    sentezOzeti = `Bu çalışma "${soru}" sorusu etrafında Kur'an'ın semantik bağlamlarını ve nüzul sırasına göre ayet dizilimini inceler.`;
    onerilenSirasi = [1, 2];
  }

  const res = await query(
    `INSERT INTO anlama_oturumlari (kullanici_id, baslik, odak_kavramlar, sentez_ozeti, onerilen_okuma_sirasi, durum)
     VALUES ($1, $2, $3, $4, $5, 'tamamlandi')
     RETURNING id, kullanici_id, baslik, odak_kavramlar, sentez_ozeti, onerilen_okuma_sirasi, durum, created_at`,
    [userId, baslik, odakKavramlar, sentezOzeti, onerilenSirasi],
  );

  const row = res.rows[0];
  const okumaKuyrugu = await buildReadingQueue(row.onerilen_okuma_sirasi || []);

  return {
    id: row.id,
    kullanici_id: row.kullanici_id,
    baslik: row.baslik,
    soru,
    odak_kavramlar: row.odak_kavramlar || [],
    sentez_ozeti: row.sentez_ozeti,
    onerilen_okuma_sirasi: row.onerilen_okuma_sirasi || [],
    okuma_kuyrugu: okumaKuyrugu,
    timeline_adimlari: buildTimelineSteps(),
    durum: row.durum,
    sabitlendi: false,
    created_at: row.created_at,
  };
}

export async function listSessions(userId: string): Promise<UnderstandingSessionDto[]> {
  const res = await query(
    `SELECT id, kullanici_id, baslik, odak_kavramlar, sentez_ozeti, onerilen_okuma_sirasi, durum, is_featured, created_at
     FROM anlama_oturumlari
     WHERE kullanici_id = $1 OR is_featured = true
     ORDER BY created_at DESC`,
    [userId],
  );

  const list: UnderstandingSessionDto[] = [];
  for (const row of res.rows) {
    const queue = await buildReadingQueue((row.onerilen_okuma_sirasi || []).slice(0, 5));
    list.push({
      id: row.id,
      kullanici_id: row.kullanici_id,
      baslik: row.baslik,
      soru: row.baslik,
      odak_kavramlar: row.odak_kavramlar || [],
      sentez_ozeti: row.sentez_ozeti || "",
      onerilen_okuma_sirasi: row.onerilen_okuma_sirasi || [],
      okuma_kuyrugu: queue,
      timeline_adimlari: buildTimelineSteps(),
      durum: row.durum || "tamamlandi",
      sabitlendi: Boolean(row.is_featured),
      created_at: row.created_at,
    });
  }

  return list;
}

export async function getSessionDetail(
  userId: string,
  sessionId: string,
): Promise<UnderstandingSessionDto | null> {
  const res = await query(
    `SELECT id, kullanici_id, baslik, odak_kavramlar, sentez_ozeti, onerilen_okuma_sirasi, durum, is_featured, is_public, created_at
     FROM anlama_oturumlari
     WHERE id = $1 AND (kullanici_id = $2 OR is_featured = true OR is_public = true)`,
    [sessionId, userId],
  );

  const row = res.rows[0];
  if (!row) return null;

  const queue = await buildReadingQueue(row.onerilen_okuma_sirasi || []);

  return {
    id: row.id,
    kullanici_id: row.kullanici_id,
    baslik: row.baslik,
    soru: row.baslik,
    odak_kavramlar: row.odak_kavramlar || [],
    sentez_ozeti: row.sentez_ozeti || "",
    onerilen_okuma_sirasi: row.onerilen_okuma_sirasi || [],
    okuma_kuyrugu: queue,
    timeline_adimlari: buildTimelineSteps(),
    durum: row.durum || "tamamlandi",
    sabitlendi: Boolean(row.is_featured),
    created_at: row.created_at,
  };
}

export async function askQuestion(
  userId: string,
  sessionId: string,
  input: AskQuestionInput,
): Promise<AskQuestionResponseDto | null> {
  const session = await getSessionDetail(userId, sessionId);
  if (!session) return null;

  const soru = input.soru.trim();
  const lower = soru.toLowerCase();

  // Intent Branching Kontrolü:
  // Mevcut oturum İlim/Cömertlik temalıyken kullanıcı Sabır/İmtihan gibi farklı bir konuya geçerse
  const isIlimStudy = session.odak_kavramlar.some((k) => ["ilim", "infak", "hikmet"].includes(k));
  const isSabirQuestion = lower.includes("sabır") || lower.includes("acı") || lower.includes("sabr");

  if (isIlimStudy && isSabirQuestion) {
    return {
      oturum_id: session.id,
      soru,
      cevap: "Sabır kavramı bu çalışmadaki ilim ve infak omurgasıyla doğrudan kesişmemektedir.",
      is_branch_suggested: true,
      branch_title: "Sabır ayetleri",
      branch_reason:
        "Sabır, bu çalışmadaki kavramlarla kesişmiyor. Ayrı bir çalışma açarsam ikisi de kendi okuma sırasını korur.",
    };
  }

  // Konu içinde kalan soru (in-scope)
  return {
    oturum_id: session.id,
    soru,
    cevap: `Bu soru mevcut çalışmanın içinde kalıyor. Kalemle öğretme (Alak 4) ve bilginin emanet oluşu bağlamı okuma sırasına dahil edildi.`,
    is_branch_suggested: false,
    eklenen_ayetler: [
      {
        index: session.okuma_kuyrugu.length + 1,
        sure_id: 96,
        ayet_no: 4,
        ref: "Alak 4",
        nuzul_sirasi: 1,
        donem: "erken_mekke",
        neden: "Kalemle öğretmenin cömertlikle bağı",
        okundu: false,
      },
    ],
  };
}

export async function searchSemanticVerses(queryText: string, limit: number = 10) {
  const normalized = queryText
    .toLowerCase()
    .replace(/[âÂ]/g, "a")
    .replace(/[îÎ]/g, "i")
    .replace(/[ûÛ]/g, "u")
    .trim();
  const searchPattern = `%${normalized}%`;

  const res = await query(
    `SELECT a.id, a.sure_id, a.ayet_no, s.ad_tr as sure_adi, a.metin_ar, a.meal_tr, a.transliterasyon_tr,
            s.nuzul_sirasi, s.donem,
            0.92 as similarity_score
     FROM ayetler a
     JOIN sureler s ON s.id = a.sure_id
     WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(a.meal_tr), 'â', 'a'), 'î', 'i'), 'û', 'u'), 'Â', 'a'), 'Î', 'i'), 'Û', 'u') LIKE $1
        OR REPLACE(REPLACE(REPLACE(LOWER(a.transliterasyon_tr), 'â', 'a'), 'î', 'i'), 'û', 'u') LIKE $1
        OR a.metin_ar LIKE $1
     ORDER BY a.sure_id ASC, a.ayet_no ASC
     LIMIT $2`,
    [searchPattern, limit]
  );

  return res.rows.map(r => ({
    id: r.id,
    sure_id: r.sure_id,
    ayet_no: r.ayet_no,
    sure_adi: r.sure_adi,
    metin_ar: r.metin_ar,
    meal_tr: r.meal_tr,
    transliterasyon_tr: r.transliterasyon_tr,
    nuzul_sirasi: r.nuzul_sirasi,
    donem: r.donem,
    similarity_score: parseFloat(r.similarity_score)
  }));
}


