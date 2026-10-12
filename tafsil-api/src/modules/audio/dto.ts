export interface Reciter {
  id: string;
  name: string;
  language: string; // 'ar' | 'tr' | 'en'
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
