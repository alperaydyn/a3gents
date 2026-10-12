import { query } from "../../db/client.js";
import { l1Get, l1Set } from "../../db/redis.js";

export interface GununKarti {
  tip: "gunun_ayeti" | "gunun_duasi" | "gunun_namaz_ayeti";
  baslik: string;
  sureId: number;
  sureAdiTr: string;
  ayetNo: number;
  metinAr: string;
  transliterasyonTr: string;
  mealTr: string;
  tefekkurNotu: string;
}

export interface UserStatsDto {
  kullaniciId: string;
  toplamEzberOturumu: number;
  bekleyenTekrarSayisi: number;
  pekistirilenEzberSayisi: number;
  streakDays: number;
  sonTekrarTarihi?: string;
}

// Günün Kartları Seçki Listesi (Sure ID & Ayet No eşleşmeleri)
const DAILY_VERSES_CURATION = [
  { sureId: 1, ayetNo: 5, tefekkur: "Kulluk ve tevhidin özü: Yalnızca Allah'a yönelmek ve yalnız O'ndan destek istemek." },
  { sureId: 2, ayetNo: 152, tefekkur: "Zikir ve hatırlama karşılıklıdır: Sen Rabbini anarsan, O da seni rahmetiyle anar." },
  { sureId: 3, ayetNo: 139, tefekkur: "Zorluklar karşısında metanet ve inanç en güçlü dayanaktır." },
  { sureId: 94, ayetNo: 5, tefekkur: "Her zorluğun içinde mutlaka bir kolaylık tohumu gizlidir." },
  { sureId: 39, ayetNo: 53, tefekkur: "Rahmet kapısı daima açıktır; ilahi merhametten ümit kesilmez." },
  { sureId: 13, ayetNo: 28, tefekkur: "Zihnin ve kalbin gerçek huzuru, yaratıcısını bilinçle anmasında saklıdır." },
];

const DAILY_DUA_CURATION = [
  { sureId: 2, ayetNo: 201, tefekkur: "Dünya ve ahiret dengesini gözeten, iyilik ve esenlik duası." },
  { sureId: 20, ayetNo: 114, tefekkur: "İlim ve hikmet talebi: 'Rabbim, ilmimi artır'." },
  { sureId: 3, ayetNo: 8, tefekkur: "Hidayetten sonra kalbin istikametini koruma duası." },
  { sureId: 25, ayetNo: 74, tefekkur: "Huzurlu aile, aydınlık nesil ve erdemli bir önderlik duası." },
  { sureId: 14, ayetNo: 40, tefekkur: "Namazı hayatın merkezinde tutma ve nesillere aktarma yakarışı." },
];

const DAILY_WORSHIP_CURATION = [
  { sureId: 2, ayetNo: 45, tefekkur: "Sabır ve namaz, insanın iç dünyasını güçlendiren iki temel dayanaktır." },
  { sureId: 29, ayetNo: 45, tefekkur: "Namaz insanı kötülükten ve çirkin davranışlardan arındıran canlı bir kalkandır." },
  { sureId: 17, ayetNo: 78, tefekkur: "Günün farklı vakitlerinde zihni durultup ilahi huzurda toplanma çağrısı." },
  { sureId: 73, ayetNo: 8, tefekkur: "Bütün benliğinle yalnızca O'na yönelmek ve dünyevi telaşlardan arınmak." },
];

async function fetchVerseDetails(sureId: number, ayetNo: number) {
  const res = await query<{
    sure_id: number;
    ayet_no: number;
    metin_ar: string;
    transliterasyon_tr: string;
    meal_tr: string;
    sure_adi_tr: string;
  }>(
    `SELECT a.sure_id, a.ayet_no, a.metin_ar, a.transliterasyon_tr, a.meal_tr, s.ad_tr as sure_adi_tr
     FROM ayetler a
     JOIN sureler s ON s.id = a.sure_id
     WHERE a.sure_id = $1 AND a.ayet_no = $2`,
    [sureId, ayetNo],
  );
  return res.rows[0];
}

export async function getDailyCards(): Promise<GununKarti[]> {
  const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const cacheKey = `dashboard:cards:${todayStr}`;
  const cached = await l1Get<GununKarti[]>(cacheKey);
  if (cached) return cached;

  // Günün tarihine göre deterministik indeks seçimi
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24),
  );

  const versePick = DAILY_VERSES_CURATION[dayOfYear % DAILY_VERSES_CURATION.length];
  const duaPick = DAILY_DUA_CURATION[dayOfYear % DAILY_DUA_CURATION.length];
  const worshipPick = DAILY_WORSHIP_CURATION[dayOfYear % DAILY_WORSHIP_CURATION.length];

  const [vRow, dRow, wRow] = await Promise.all([
    fetchVerseDetails(versePick.sureId, versePick.ayetNo),
    fetchVerseDetails(duaPick.sureId, duaPick.ayetNo),
    fetchVerseDetails(worshipPick.sureId, worshipPick.ayetNo),
  ]);

  const cards: GununKarti[] = [];

  if (vRow) {
    cards.push({
      tip: "gunun_ayeti",
      baslik: "Günün Ayeti",
      sureId: vRow.sure_id,
      sureAdiTr: vRow.sure_adi_tr,
      ayetNo: vRow.ayet_no,
      metinAr: vRow.metin_ar,
      transliterasyonTr: vRow.transliterasyon_tr,
      mealTr: vRow.meal_tr,
      tefekkurNotu: versePick.tefekkur,
    });
  }

  if (dRow) {
    cards.push({
      tip: "gunun_duasi",
      baslik: "Günün Kur'an Duası",
      sureId: dRow.sure_id,
      sureAdiTr: dRow.sure_adi_tr,
      ayetNo: dRow.ayet_no,
      metinAr: dRow.metin_ar,
      transliterasyonTr: dRow.transliterasyon_tr,
      mealTr: dRow.meal_tr,
      tefekkurNotu: duaPick.tefekkur,
    });
  }

  if (wRow) {
    cards.push({
      tip: "gunun_namaz_ayeti",
      baslik: "Günün İbadet & Tefekkür Ayeti",
      sureId: wRow.sure_id,
      sureAdiTr: wRow.sure_adi_tr,
      ayetNo: wRow.ayet_no,
      metinAr: wRow.metin_ar,
      transliterasyonTr: wRow.transliterasyon_tr,
      mealTr: wRow.meal_tr,
      tefekkurNotu: worshipPick.tefekkur,
    });
  }

  // 1 gün TTL ile Redis'e yaz
  await l1Set(cacheKey, cards);
  return cards;
}

export async function getUserDashboardStats(kullaniciId: string): Promise<UserStatsDto> {
  const res = await query<{
    toplam: string | number;
    bekleyen: string | number;
    pekistirilen: string | number;
  }>(
    `SELECT
       COUNT(*) as toplam,
       COUNT(*) FILTER (WHERE next_review_at <= NOW()) as bekleyen,
       COUNT(*) FILTER (WHERE durum = 'pekistirildi') as pekistirilen
     FROM ezber_oturumlari
     WHERE kullanici_id = $1`,
    [kullaniciId],
  );

  const row = res.rows[0];
  const toplam = Number(row?.toplam ?? 0);
  const bekleyen = Number(row?.bekleyen ?? 0);
  const pekistirilen = Number(row?.pekistirilen ?? 0);

  return {
    kullaniciId,
    toplamEzberOturumu: toplam,
    bekleyenTekrarSayisi: bekleyen,
    pekistirilenEzberSayisi: pekistirilen,
    streakDays: toplam > 0 ? 3 : 0, // Örnek okuma serisi
  };
}
