import sureSnapshot from "@/data/sureler.snapshot.json";
import ayetSnapshot from "@/data/ayetler.snapshot.json";
import { mockKavramlar } from "@/data/kavramlar.mock";
import type { Surah, Verse, Kavram, CommunitySession, CommunityConcept, Article } from "./types";

/**
 * Veri erişim katmanı (WEB-003, WEB-004).
 *
 * Fastify backend REST uçlarına (/api/v1/*) bağlanır; ağ hatası durumunda
 * src/data/*.snapshot.json (6236 ayet) verisine graceful fallback uygular.
 */
const USE_MOCK = false;
const API_BASE =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000/api/v1";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta?: { cached?: boolean };
}

interface BackendSurahRow {
  id: number;
  ad_tr?: string;
  nameTr?: string;
  ad_ar?: string;
  nameAr?: string;
  nuzul_sirasi?: number;
  revelationOrder?: number;
  donem?: "erken_mekke" | "orta_mekke" | "gec_mekke" | "medine";
  period?: "erken_mekke" | "orta_mekke" | "gec_mekke" | "medine";
  ayet_sayisi?: number;
  verseCount?: number;
  aciklama?: string;
  summary?: string;
}

interface BackendVerseRow {
  sure_id?: number;
  sureId?: number;
  ayet_no?: number;
  ayetNo?: number;
  metin_ar?: string;
  metinAr?: string;
  transliterasyon_tr?: string;
  transliterasyon?: string;
  meal_tr?: string;
  mealTr?: string;
}

async function fetchApi<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      next: { revalidate: 86400 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiResponse<T>;
    return body.success ? (body.data ?? null) : null;
  } catch (err) {
    console.warn(`[fetchApi] ${path} çağrısı başarısız, yerel anlık görüntüye dönülüyor:`, err);
    return null;
  }
}

const surahs = sureSnapshot as Surah[];
type RawAyet = { s: number; a: number; ar: string; tr: string; translit: string };
const ayetler = ayetSnapshot as RawAyet[];
const surahById = new Map(surahs.map((s) => [s.id, s]));

function mapSurahFromBackend(row: BackendSurahRow): Surah {
  return {
    id: row.id,
    nameTr: row.ad_tr ?? row.nameTr ?? `Sure ${row.id}`,
    nameAr: row.ad_ar ?? row.nameAr ?? "",
    revelationOrder: row.nuzul_sirasi ?? row.revelationOrder ?? row.id,
    period: row.donem ?? row.period ?? "erken_mekke",
    verseCount: row.ayet_sayisi ?? row.verseCount ?? 0,
    summary: row.aciklama ?? row.summary ?? "",
  };
}

function mapVerseFromBackend(row: BackendVerseRow, sureNameTr = "", sureNameAr = ""): Verse {
  const sureId = row.sure_id ?? row.sureId ?? 1;
  const ayetNo = row.ayet_no ?? row.ayetNo ?? 1;
  return {
    sureId,
    ayetNo,
    sureNameTr: sureNameTr || (surahById.get(sureId)?.nameTr ?? ""),
    sureNameAr: sureNameAr || (surahById.get(sureId)?.nameAr ?? ""),
    metinAr: row.metin_ar ?? row.metinAr ?? "",
    transliterasyon: row.transliterasyon_tr ?? row.transliterasyon ?? "",
    mealTr: row.meal_tr ?? row.mealTr ?? "",
  };
}

export async function listSureler(): Promise<Surah[]> {
  if (!USE_MOCK) {
    const data = await fetchApi<BackendSurahRow[]>("/sureler?siralama=mushaf");
    if (data && Array.isArray(data)) {
      return data.map(mapSurahFromBackend);
    }
  }
  return surahs;
}

export async function getSure(sureId: number): Promise<Surah | null> {
  if (!USE_MOCK) {
    const data = await fetchApi<BackendSurahRow>(`/sureler/${sureId}/detay`);
    if (data) {
      return mapSurahFromBackend(data);
    }
  }
  return surahById.get(sureId) ?? null;
}

export async function getAyet(sureId: number, ayetNo: number): Promise<Verse | null> {
  if (!USE_MOCK) {
    const data = await fetchApi<BackendVerseRow>(`/ayetler/${sureId}/${ayetNo}`);
    if (data) {
      const sure = await getSure(sureId);
      return mapVerseFromBackend(data, sure?.nameTr, sure?.nameAr);
    }
  }

  const raw = ayetler.find((a) => a.s === sureId && a.a === ayetNo);
  const sure = surahById.get(sureId);
  if (!raw || !sure) return null;
  return {
    sureId,
    ayetNo,
    sureNameTr: sure.nameTr,
    sureNameAr: sure.nameAr,
    metinAr: raw.ar,
    transliterasyon: raw.translit,
    mealTr: raw.tr,
  };
}

/** WEB-004: kavram/[slug] için. Gerçek kavram uçları bağlandığında getKavram güncellenecektir. */
export async function getKavram(slug: string): Promise<Kavram | null> {
  const data = await fetchApi<Kavram>(`/kavramlar/${slug}`);
  if (data) return data;
  return mockKavramlar.find((k) => k.slug === slug) ?? null;
}

export async function listCommunitySessions(kavram?: string, sort = "popular"): Promise<CommunitySession[]> {
  const query = new URLSearchParams();
  if (kavram) query.set("kavram", kavram);
  if (sort) query.set("sort", sort);
  const data = await fetchApi<CommunitySession[]>(`/topluluk/oturumlari?${query.toString()}`);
  return data ?? [];
}

export async function getCommunityConcepts(): Promise<CommunityConcept[]> {
  const data = await fetchApi<CommunityConcept[]>("/topluluk/kavramlar");
  return data ?? [];
}

export async function getUnderstandingSession(id: string): Promise<CommunitySession | null> {
  const data = await fetchApi<CommunitySession>(`/anlama-oturumlari/${id}`);
  return data;
}

export async function listArticles(): Promise<Article[]> {
  const data = await fetchApi<Article[]>("/makaleler");
  return data ?? [];
}

export async function getArticle(slug: string): Promise<Article | null> {
  const data = await fetchApi<Article>(`/makaleler/${slug}`);
  return data;
}

export async function getAdminDashboard(): Promise<import("./types").AdminStats | null> {
  const data = await fetchApi<import("./types").AdminStats>("/admin/dashboard");
  return data;
}

export async function listCommunityModeration(status?: string): Promise<import("./types").AdminCommunityItem[]> {
  const query = status ? `?status=${status}` : "";
  const data = await fetchApi<import("./types").AdminCommunityItem[]>(`/admin/topluluk${query}`);
  return data ?? [];
}

export async function moderateCommunitySession(
  id: string,
  update: { is_featured?: boolean; moderation_status?: "onaylandi" | "beklemede" | "reddedildi" }
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/admin/topluluk/${id}/moderasyon`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function createAdminArticle(article: {
  title: string;
  slug: string;
  author: string;
  summary: string;
  content_md: string;
  primary_concepts?: string[];
  related_surahs?: number[];
  reading_time_minutes?: number;
}): Promise<Article | null> {
  try {
    const res = await fetch(`${API_BASE}/admin/makaleler`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(article),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 6: Audio & Recitation API
// ---------------------------------------------------------------------------

export async function fetchReciters(): Promise<import("./types").Reciter[]> {
  try {
    const res = await fetch(`${API_BASE}/audio/reciters`);
    if (!res.ok) return [];
    const body = await res.json();
    return body.data ?? [];
  } catch {
    return [];
  }
}

export async function fetchSurahAudioPlaylist(
  sureId: number,
  reciterId: string = "mishary_alafasy"
): Promise<import("./types").SurahAudioPlaylist | null> {
  try {
    const res = await fetch(`${API_BASE}/audio/sure/${sureId}?reciter=${reciterId}`);
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 6: Sync & Offline API
// ---------------------------------------------------------------------------

export async function pushSyncData(data: {
  user_id?: string;
  bookmarks?: any[];
  reading_history?: any[];
  memorization_sessions?: any[];
}): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/sync/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function pullSyncData(lastSyncedAt?: string): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/sync/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_synced_at: lastSyncedAt }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
  } catch {
    return null;
  }
}

export async function getSyncStatus(): Promise<import("./types").SyncStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/sync/status`);
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
  } catch {
    return null;
  }
}


