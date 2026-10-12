import { z } from "zod";

export const createSessionSchema = z.object({
  soru: z.string().min(3).max(500),
  baslik: z.string().max(128).optional(),
  odak_kavramlar: z.array(z.string()).optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const askQuestionSchema = z.object({
  soru: z.string().min(3).max(500),
});

export type AskQuestionInput = z.infer<typeof askQuestionSchema>;

export interface TimelineStepDto {
  step: number;
  title: string;
  subtitle: string;
  status: "completed" | "in_progress" | "pending";
}

export interface ReadingQueueItemDto {
  index: number;
  sure_id: number;
  ayet_no: number;
  ref: string;
  nuzul_sirasi: number;
  donem: string;
  neden: string;
  okundu: boolean;
}

export interface UnderstandingSessionDto {
  id: string;
  kullanici_id: string;
  baslik: string;
  soru: string;
  odak_kavramlar: string[];
  sentez_ozeti: string;
  onerilen_okuma_sirasi: number[];
  okuma_kuyrugu: ReadingQueueItemDto[];
  timeline_adimlari: TimelineStepDto[];
  durum: "tamamlandi" | "toplaniyor";
  sabitlendi?: boolean;
  created_at: string;
}

export interface AskQuestionResponseDto {
  oturum_id: string;
  soru: string;
  cevap: string;
  is_branch_suggested: boolean;
  branch_title?: string;
  branch_reason?: string;
  eklenen_ayetler?: ReadingQueueItemDto[];
}
