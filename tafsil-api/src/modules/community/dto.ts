import { z } from "zod";

export interface CommunitySessionDto {
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

export interface CommunityFilterQuery {
  kavram?: string;
  sort?: "popular" | "latest" | "forks";
  limit?: number;
  offset?: number;
}

export const ForkSessionSchema = z.object({
  target_title: z.string().min(2).max(255).optional(),
});

export type ForkSessionInput = z.infer<typeof ForkSessionSchema>;

export interface LikeResponseDto {
  liked: boolean;
  like_count: number;
}

export interface CommunityConceptDto {
  slug: string;
  baslik_tr: string;
  session_count: number;
}
