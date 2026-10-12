export interface AdminDashboardStatsDto {
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

export interface ModerateCommunityStudyDto {
  is_featured?: boolean;
  moderation_status?: "onaylandi" | "beklemede" | "reddedildi";
}

export interface CreateArticleDto {
  title: string;
  slug: string;
  author: string;
  summary: string;
  content_md: string;
  primary_concepts?: string[];
  related_surahs?: number[];
  reading_time_minutes?: number;
}

export interface UpdateArticleDto {
  title?: string;
  summary?: string;
  content_md?: string;
  primary_concepts?: string[];
  related_surahs?: number[];
  reading_time_minutes?: number;
  is_verified?: boolean;
}

export interface CreateConceptDto {
  slug: string;
  baslik_tr: string;
  baslik_ar?: string;
  tanim: string;
  onaylandi?: boolean;
}

export interface CreateConceptRelationDto {
  kaynak_kavram_id: number;
  hedef_kavram_id: number;
  iliski_tipi: "es_anlam" | "zit_anlam" | "kapsama" | "sebep_sonuc" | "iliskili";
  agirlik?: number;
}
