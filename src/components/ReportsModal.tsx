import React from 'react';
import { X, Award, CheckCircle2, TrendingUp, Calendar, Zap } from 'lucide-react';
import { UserProgress, Vocabulary } from '../types/vocab';
import { PHASES } from '../utils/leitner';

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  progressMap: Record<string, UserProgress>;
  vocabularies: Vocabulary[];
}

export const ReportsModal: React.FC<ReportsModalProps> = ({
  isOpen,
  onClose,
  progressMap,
  vocabularies,
}) => {
  if (!isOpen) return null;

  const totalInDeck = Object.keys(progressMap).length;

  // Count per phase (1 to 6)
  const phaseCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let totalCorrect = 0;
  let totalIncorrect = 0;
  let maxStreak = 0;

  Object.values(progressMap).forEach((p) => {
    const ph = p.phase || 1;
    phaseCounts[ph] = (phaseCounts[ph] || 0) + 1;
    totalCorrect += p.correctCount || 0;
    totalIncorrect += p.incorrectCount || 0;
    if ((p.streak || 0) > maxStreak) {
      maxStreak = p.streak || 0;
    }
  });

  const totalAnswers = totalCorrect + totalIncorrect;
  const accuracy = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 100;
  const masteredCount = phaseCounts[6] || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#1C1C1E] border border-[#2C2C2E] rounded-t-3xl sm:rounded-3xl p-6 text-white max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#2C2C2E]">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#FF7A00]" />
              Lernstatistik & Phasen
            </h2>
            <p className="text-xs text-[#8E8E93] mt-0.5">6-Stufen-Leitner-System</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#8E8E93] hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick KPI stats */}
        <div className="grid grid-cols-3 gap-2.5 my-5">
          <div className="bg-[#242426] p-3 rounded-2xl border border-[#323236] text-center">
            <span className="text-2xl font-bold text-white">{totalInDeck}</span>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">Im Lern-Deck</p>
          </div>
          <div className="bg-[#242426] p-3 rounded-2xl border border-[#323236] text-center">
            <span className="text-2xl font-bold text-[#FF7A00]">{masteredCount}</span>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">Langzeit (P6)</p>
          </div>
          <div className="bg-[#242426] p-3 rounded-2xl border border-[#323236] text-center">
            <span className="text-2xl font-bold text-emerald-400">{accuracy}%</span>
            <p className="text-[11px] text-[#8E8E93] mt-0.5">Trefferquote</p>
          </div>
        </div>

        {/* 6-Phase Breakdown */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-3">
            Verteilung auf die 6 Phasen
          </h3>
          <div className="space-y-2.5">
            {[1, 2, 3, 4, 5, 6].map((phaseNum) => {
              const cfg = PHASES[phaseNum];
              const count = phaseCounts[phaseNum] || 0;
              const percentage = totalInDeck > 0 ? Math.round((count / totalInDeck) * 100) : 0;

              return (
                <div key={phaseNum} className="bg-[#242426] rounded-xl p-2.5 border border-[#2E2E32]">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full ${cfg.badgeBg} text-white font-bold flex items-center justify-center text-[10px]`}>
                        {phaseNum}
                      </span>
                      <span className="font-medium text-white">{cfg.name}</span>
                      <span className="text-[#8E8E93] text-[11px]">({cfg.intervalLabel})</span>
                    </div>
                    <span className="font-semibold text-white">
                      {count} <span className="text-[#8E8E93] font-normal">({percentage}%)</span>
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 w-full bg-[#18181A] rounded-full overflow-hidden">
                    <div
                      className={`h-full ${cfg.badgeBg} transition-all duration-500 rounded-full`}
                      style={{ width: `${Math.max(percentage, count > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leitner Spaced Repetition explanation */}
        <div className="bg-[#242426]/70 rounded-2xl p-3.5 border border-[#323236] text-xs text-[#A1A1AA] space-y-1.5 mb-5">
          <p className="font-semibold text-white flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-[#FF7A00]" />
            Wie funktioniert das 6-Phasen-Lernsystem?
          </p>
          <p>
            Jede gewusste Vokabel wandert eine Phase weiter und wird in größeren Zeitabständen abgefragt (1 &rarr; 3 &rarr; 7 &rarr; 15 &rarr; 30 &rarr; 90 Tage).
          </p>
          <p>
            Bei "Nicht gewusst" fällt die Karte auf Phase 1 zurück, um Wissenslücken sofort zu schließen.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-full bg-[#FF7A00] text-black font-semibold text-sm hover:bg-[#FF881A] transition-colors shadow-lg active:scale-[0.99]"
        >
          Verstanden
        </button>
      </div>
    </div>
  );
};
