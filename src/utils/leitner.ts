import { PhaseConfig, UserProgress, DirectionProgress, QueryDirection } from '../types/vocab';

export const PHASES: Record<number, PhaseConfig> = {
  1: {
    phase: 1,
    name: 'Phase 1',
    intervalDays: 1,
    intervalLabel: 'Täglich / Sofort',
    badgeBg: 'bg-rose-500',
    badgeText: 'text-white',
    borderColor: 'border-rose-300',
    bgLight: 'bg-rose-50',
    description: 'Neu im Deck, tägliche Wiederholung',
  },
  2: {
    phase: 2,
    name: 'Phase 2',
    intervalDays: 3,
    intervalLabel: '3 Tage',
    badgeBg: 'bg-amber-500',
    badgeText: 'text-white',
    borderColor: 'border-amber-300',
    bgLight: 'bg-amber-50',
    description: 'Erste Festigung, Wiederholung nach 3 Tagen',
  },
  3: {
    phase: 3,
    name: 'Phase 3',
    intervalDays: 7,
    intervalLabel: '7 Tage',
    badgeBg: 'bg-emerald-500',
    badgeText: 'text-white',
    borderColor: 'border-emerald-300',
    bgLight: 'bg-emerald-50',
    description: 'Mittelfristig gefestigt, 1 Woche Pause',
  },
  4: {
    phase: 4,
    name: 'Phase 4',
    intervalDays: 15,
    intervalLabel: '15 Tage',
    badgeBg: 'bg-sky-500',
    badgeText: 'text-white',
    borderColor: 'border-sky-300',
    bgLight: 'bg-sky-50',
    description: 'Sichere Kenntnis, Wiederholung nach 2 Wochen',
  },
  5: {
    phase: 5,
    name: 'Phase 5',
    intervalDays: 30,
    intervalLabel: '30 Tage',
    badgeBg: 'bg-indigo-600',
    badgeText: 'text-white',
    borderColor: 'border-indigo-300',
    bgLight: 'bg-indigo-50',
    description: 'Starkes Gedächtnis, Wiederholung nach 1 Monat',
  },
  6: {
    phase: 6,
    name: 'Phase 6',
    intervalDays: 90,
    intervalLabel: '90 Tage',
    badgeBg: 'bg-purple-600',
    badgeText: 'text-white',
    borderColor: 'border-purple-300',
    bgLight: 'bg-purple-50',
    description: 'Langzeitgedächtnis gemeistert!',
  },
};

/**
 * Calculates next review ISO date string based on current phase after answering correctly
 */
export function calculateNextReviewDate(nextPhase: number): string {
  const config = PHASES[nextPhase] || PHASES[1];
  const now = new Date();
  now.setDate(now.getDate() + config.intervalDays);
  return now.toISOString();
}

/**
 * When answering incorrectly, review is due today or tomorrow
 */
export function calculateResetReviewDate(): string {
  const now = new Date();
  // due in a few hours or next day for re-review
  now.setMinutes(now.getMinutes() + 10);
  return now.toISOString();
}

/**
 * Check if a card is currently due for review
 */
export function isCardDue(nextReviewDateStr: string): boolean {
  if (!nextReviewDateStr) return true;
  const reviewDate = new Date(nextReviewDateStr);
  return reviewDate.getTime() <= Date.now();
}

/**
 * Format relative due time and calendar date (e.g., "Heute fällig", "Morgen fällig (13.10.)", "In 3 Tagen (15.10.)", "Überfällig (seit 2 Tagen)")
 */
export function formatDueDate(dateStr?: string): {
  label: string;
  isDue: boolean;
  dateFormatted: string;
  daysDiff: number;
} {
  if (!dateStr) {
    return {
      label: 'Jetzt fällig',
      isDue: true,
      dateFormatted: 'Heute',
      daysDiff: 0,
    };
  }

  const target = new Date(dateStr);
  const now = new Date();
  const dateFormatted = target.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: target.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });

  // Calculate midnight diff to avoid timezone shift inconsistencies
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((targetMidnight - nowMidnight) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      label: overdueDays === 1 ? 'Gestern fällig' : `Überfällig (${overdueDays} T.)`,
      isDue: true,
      dateFormatted,
      daysDiff: diffDays,
    };
  }

  if (diffDays === 0) {
    return {
      label: 'Heute fällig',
      isDue: true,
      dateFormatted,
      daysDiff: 0,
    };
  }

  if (diffDays === 1) {
    return {
      label: `Morgen (${dateFormatted})`,
      isDue: false,
      dateFormatted,
      daysDiff: 1,
    };
  }

  return {
    label: `In ${diffDays} Tagen (${dateFormatted})`,
    isDue: false,
    dateFormatted,
    daysDiff: diffDays,
  };
}

/**
 * Returns the DirectionProgress for a specific query direction ('de_to_th' or 'th_to_de').
 * Gracefully falls back to overall legacy progress if directional progress is not yet set.
 */
export function getDirectionProgress(
  prog: UserProgress | undefined,
  direction: QueryDirection
): DirectionProgress {
  const dirKey = direction === 'de_to_th' ? 'deToTh' : 'thToDe';
  const existingDir = prog ? prog[dirKey] : undefined;

  if (existingDir && typeof existingDir.phase === 'number') {
    return {
      phase: Math.max(1, Math.min(6, existingDir.phase)),
      nextReviewDate: existingDir.nextReviewDate || prog?.nextReviewDate || new Date().toISOString(),
      lastReviewedAt: existingDir.lastReviewedAt || prog?.lastReviewedAt,
      streak: existingDir.streak ?? 0,
      correctCount: existingDir.correctCount ?? 0,
      incorrectCount: existingDir.incorrectCount ?? 0,
    };
  }

  // Fallback to legacy progress fields or default Phase 1
  const fallbackPhase = prog?.phase && prog.phase >= 1 && prog.phase <= 6 ? prog.phase : 1;
  return {
    phase: fallbackPhase,
    nextReviewDate: prog?.nextReviewDate || new Date().toISOString(),
    lastReviewedAt: prog?.lastReviewedAt,
    streak: prog?.streak ?? 0,
    correctCount: prog?.correctCount ?? 0,
    incorrectCount: prog?.incorrectCount ?? 0,
  };
}

/**
 * Checks whether a vocabulary item is due in a specific direction
 */
export function isDirectionDue(
  prog: UserProgress | undefined,
  direction: QueryDirection
): boolean {
  if (!prog) return false;
  const dirProg = getDirectionProgress(prog, direction);
  return isCardDue(dirProg.nextReviewDate);
}

/**
 * Checks whether a vocabulary item is due in either direction
 */
export function isAnyDirectionDue(prog: UserProgress | undefined): boolean {
  if (!prog) return false;
  return isDirectionDue(prog, 'de_to_th') || isDirectionDue(prog, 'th_to_de');
}
