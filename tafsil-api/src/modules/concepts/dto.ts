import { z } from "zod";

export const listConceptsQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export type ListConceptsQuery = z.infer<typeof listConceptsQuerySchema>;

export interface ConceptDto {
  id: number;
  slug: string;
  baslik_tr: string;
  baslik_ar: string | null;
  tanim: string;
  onaylandi: boolean;
  iliski_sayisi?: number;
}

export interface DagNodeDto {
  id: number;
  slug: string;
  baslik_tr: string;
  baslik_ar: string | null;
  derinlik: number;
}

export interface DagEdgeDto {
  kaynak_kavram_id: number;
  hedef_kavram_id: number;
  iliski_tipi: "es_anlam" | "zit_anlam" | "kapsama" | "sebep_sonuc" | "iliskili";
  agirlik: number;
  derinlik: number;
}

export interface DagResponseDto {
  root: ConceptDto;
  nodes: DagNodeDto[];
  edges: DagEdgeDto[];
  toplam_komsu: number;
}

export interface NuzulPeriodDistributionDto {
  donem: "erken_mekke" | "orta_mekke" | "gec_mekke" | "medine";
  etiket: string;
  oran: number;
  sureler: { id: number; ad_tr: string; nuzul_sirasi: number }[];
}

export interface ConceptNuzulAnalysisDto {
  slug: string;
  baslik_tr: string;
  dagilim: NuzulPeriodDistributionDto[];
}
