export interface Vocabulary {
  id: string;
  german: string;           // Bedeutung auf Deutsch
  thai: string;             // Thai-Schriftzeichen (z. B. สวัสดีครับ)
  romanization?: string;    // Lautschrift / Umschrift (z. B. sà-wàt-dee kráp)
  lesson: string;           // Kategorie / Lektion (z. B. "Lektion 1: Begrüßung")
  exampleThai?: string;     // Beispielsatz in Thai (optional)
  exampleGerman?: string;   // Beispielsatz auf Deutsch (optional)
  creatorId: string;
  creatorName?: string;
  createdAt: string;
}

export interface UserProgress {
  id: string;               // Document ID (typically `${userId}_${vocabId}`)
  userId: string;
  vocabId: string;
  phase: number;            // 1 bis 6 (Phase 6 = Langzeitgedächtnis)
  nextReviewDate: string;   // ISO String (YYYY-MM-DD or full ISO)
  lastReviewedAt?: string;  // ISO String
  streak: number;
  correctCount: number;
  incorrectCount: number;
  updatedAt: string;
}

export interface CardWithProgress {
  vocab: Vocabulary;
  progress: UserProgress;
}

export interface DeletedVocabEntry {
  vocab: Vocabulary;
  deletedAt: string; // ISO String
  previousProgress?: UserProgress;
}

export type ActiveTab = 'learn' | 'pool' | 'create' | 'settings';

export interface PhaseConfig {
  phase: number;
  name: string;
  intervalDays: number;
  intervalLabel: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  bgLight: string;
  description: string;
}
