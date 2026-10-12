export interface Surah {
  id: number;
  nameTr: string;
  nameAr: string;
  revelationOrder: number;
  period: "erken_mekke" | "orta_mekke" | "gec_mekke" | "medine";
  verseCount: number;
  summary: string;
}

export interface Verse {
  sureId: number;
  ayetNo: number;
  sureNameTr: string;
  sureNameAr: string;
  metinAr: string;
  transliterasyon: string;
  mealTr: string;
}

export interface KavramRef {
  slug: string;
  baslikTr: string;
  tip: "es_anlam" | "zit_anlam" | "kapsama" | "sebep_sonuc" | "iliskili";
}

export interface Kavram {
  slug: string;
  baslikTr: string;
  baslikAr: string;
  tanim: string;
  kategori: string;
  ilkGectigiYer: { sureId: number; ayetNo: number; sureNameTr: string };
  iliskiler: KavramRef[];
}

export interface CommunitySession {
  id: string;
  baslik: string;
  odak_kavramlar: string[];
  sentez_ozeti: string | null;
  onerilen_okuma_sirasi: number[];
  durum: string;
  created_at: string;
  is_public: boolean;
  like_count: number;
  fork_count: number;
  is_liked_by_user?: boolean;
  source_session_id?: string | null;
}

export interface CommunityConcept {
  slug: string;
  baslik_tr: string;
  session_count: number;
}

export interface Article {
  slug: string;
  title: string;
  author: string;
  date: string;
  summary: string;
  primary_concepts: string[];
  related_surahs: number[];
  reading_time_minutes: number;
  reference_score: number;
  is_verified: boolean;
  content_md?: string;
}

export interface AdminStats {
  metrics: {
    totalUsers: number;
    totalPublicSessions: number;
    totalArticles: number;
    verifiedArticles: number;
    totalMemorizationRounds: number;
    modeDistribution: {
      kesif: number;
      ogrenme: number;
      odak: number;
    };
  };
  system: {
    nodeEnv: string;
    uptimeSeconds: number;
    redisConnected: boolean;
    dbConnected: boolean;
    memoryUsageMb: number;
  };
}

export interface AdminCommunityItem {
  id: string;
  baslik: string;
  durum: string;
  is_public: boolean;
  is_featured: boolean;
  moderation_status: "onaylandi" | "beklemede" | "reddedildi";
  like_count: number;
  fork_count: number;
  created_at: string;
}

export interface Reciter {
  id: string;
  name: string;
  language: string;
  description?: string;
  has_word_timestamps: boolean;
}

export interface WordTimestamp {
  kelime_no: number;
  metin_ar: string;
  metin_tr?: string;
  start_ms: number;
  end_ms: number;
}

export interface VerseAudioItem {
  ayet_no: number;
  ses_url: string;
  format: string;
  duration_ms?: number;
  words: WordTimestamp[];
}

export interface SurahAudioPlaylist {
  sure_id: number;
  sure_adi: string;
  reciter: Reciter;
  verses: VerseAudioItem[];
}

export interface BookmarkItem {
  id?: string;
  sure_id: number;
  ayet_no: number;
  etiket?: string;
  notlar?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SyncStatus {
  user_id: string;
  status: string;
  bookmarks: { count: number; last_updated: string | null };
  reading_history: { count: number; last_read: string | null };
  memorization: { count: number; last_created: string | null };
}


