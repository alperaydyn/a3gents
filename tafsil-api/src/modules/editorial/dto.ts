import { z } from "zod";

export interface ArticleSummaryDto {
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
}

export interface ArticleDetailDto extends ArticleSummaryDto {
  content_md: string;
}

export const VerifyContentSchema = z.object({
  content_md: z.string().min(10, "İçerik en az 10 karakter olmalıdır"),
  title: z.string().optional(),
});

export type VerifyContentInput = z.infer<typeof VerifyContentSchema>;

export interface ReferenceVerificationResultDto {
  total_score: number;
  is_verified: boolean;
  badge: "verified" | "partial" | "pending";
  badge_title: string;
  citations: string[];
  breakdown: {
    direct_citations: {
      score: number;
      max: number;
      count: number;
      details: string;
    };
    contextual_integrity: {
      score: number;
      max: number;
      details: string;
    };
    morphological_alignment: {
      score: number;
      max: number;
      details: string;
    };
    historical_consistency: {
      score: number;
      max: number;
      details: string;
    };
  };
}
