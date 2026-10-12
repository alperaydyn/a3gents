import { z } from "zod";

export const createSessionSchema = z.object({
  sureId: z.number().int().min(1).max(114),
  baslangicAyet: z.number().int().min(1),
  bitisAyet: z.number().int().min(1),
}).refine((data) => data.bitisAyet >= data.baslangicAyet, {
  message: "bitisAyet baslangicAyet değerinden küçük olamaz",
  path: ["bitisAyet"],
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const evaluateSessionSchema = z.object({
  quality: z.number().int().min(0).max(5),
});

export type EvaluateSessionInput = z.infer<typeof evaluateSessionSchema>;

export interface EzberSessionDto {
  id: string;
  kullaniciId: string;
  sureId: number;
  sureAdiTr?: string;
  baslangicAyet: number;
  bitisAyet: number;
  durum: "ogreniliyor" | "kor_okuma" | "tekrar_bekliyor" | "pekistirildi";
  repetitionNumber: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewAt: string;
  createdAt: string;
}
