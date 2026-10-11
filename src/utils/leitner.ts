import { PhaseConfig } from '../types/vocab';

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
 * Format relative due time (e.g., "Heute fällig", "In 3 Tagen", "Überfällig")
 */
export function formatDueDate(dateStr: string): { label: string; isDue: boolean } {
  if (!dateStr) return { label: 'Jetzt fällig', isDue: true };
  const target = new Date(dateStr);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs <= 0) {
    return { label: 'Heute fällig', isDue: true };
  }
  if (diffDays === 1) {
    return { label: 'Morgen fällig', isDue: false };
  }
  return { label: `In ${diffDays} Tagen`, isDue: false };
}
