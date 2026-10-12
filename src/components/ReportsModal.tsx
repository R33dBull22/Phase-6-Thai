import React, { useState, useMemo } from 'react';
import {
  X,
  Award,
  CheckCircle2,
  TrendingUp,
  Calendar,
  Zap,
  ChevronDown,
  ChevronUp,
  Clock,
  Volume2,
  BookOpen,
  Check,
} from 'lucide-react';
import { UserProgress, Vocabulary } from '../types/vocab';
import { PHASES, formatDueDate } from '../utils/leitner';
import { speakThai } from '../utils/thaiAudio';

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
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<'all' | 'due' | 'future'>('all');
  const [searchFilter, setSearchFilter] = useState('');

  // Map vocabulary lookup by ID
  const vocabMap = useMemo(() => {
    const map = new Map<string, Vocabulary>();
    vocabularies.forEach((v) => map.set(v.id, v));
    return map;
  }, [vocabularies]);

  // Group vocabularies with progress per phase
  const vocabsByPhase = useMemo(() => {
    const map: Record<
      number,
      { vocab: Vocabulary; progress: UserProgress; dueInfo: ReturnType<typeof formatDueDate> }[]
    > = {
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
    };

    Object.values(progressMap).forEach((p) => {
      const vocab = vocabMap.get(p.vocabId);
      if (!vocab) return;

      const ph = Math.max(1, Math.min(6, p.phase || 1));
      const dueInfo = formatDueDate(p.nextReviewDate);

      map[ph].push({
        vocab,
        progress: p,
        dueInfo,
      });
    });

    // Sort items within each phase by nextReviewDate ascending (soonest due first)
    [1, 2, 3, 4, 5, 6].forEach((ph) => {
      map[ph].sort((a, b) => {
        const timeA = new Date(a.progress.nextReviewDate || 0).getTime();
        const timeB = new Date(b.progress.nextReviewDate || 0).getTime();
        return timeA - timeB;
      });
    });

    return map;
  }, [progressMap, vocabMap]);

  if (!isOpen) return null;

  const totalInDeck = Object.keys(progressMap).length;

  let totalCorrect = 0;
  let totalIncorrect = 0;
  let dueTodayCount = 0;

  Object.values(progressMap).forEach((p) => {
    totalCorrect += p.correctCount || 0;
    totalIncorrect += p.incorrectCount || 0;
    const dueInfo = formatDueDate(p.nextReviewDate);
    if (dueInfo.isDue) {
      dueTodayCount++;
    }
  });

  const totalAnswers = totalCorrect + totalIncorrect;
  const accuracy = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 100;
  const masteredCount = vocabsByPhase[6]?.length || 0;

  const togglePhase = (phaseNum: number) => {
    setExpandedPhase((prev) => (prev === phaseNum ? null : phaseNum));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#1C1C1E] border border-[#2C2C2E] rounded-t-3xl sm:rounded-3xl p-5 text-white max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col justify-between">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-[#2C2C2E] mb-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#FF7A00]" />
                Lernstatistik & Vokabel-Phasen
              </h2>
              <p className="text-xs text-[#8E8E93] mt-0.5">
                Klicke auf eine Phase, um alle enthaltenen Vokabeln & Fälligkeiten zu sehen
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#242426] flex items-center justify-center text-[#8E8E93] hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick KPI stats */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="bg-[#242426] p-2.5 rounded-2xl border border-[#323236] text-center">
              <span className="text-xl font-bold text-white block">{totalInDeck}</span>
              <p className="text-[10px] text-[#8E8E93] mt-0.5">Im Deck</p>
            </div>
            <div className="bg-[#242426] p-2.5 rounded-2xl border border-[#323236] text-center">
              <span className="text-xl font-bold text-amber-400 block">{dueTodayCount}</span>
              <p className="text-[10px] text-[#8E8E93] mt-0.5">Jetzt fällig</p>
            </div>
            <div className="bg-[#242426] p-2.5 rounded-2xl border border-[#323236] text-center">
              <span className="text-xl font-bold text-purple-400 block">{masteredCount}</span>
              <p className="text-[10px] text-[#8E8E93] mt-0.5">Langzeit (P6)</p>
            </div>
            <div className="bg-[#242426] p-2.5 rounded-2xl border border-[#323236] text-center">
              <span className="text-xl font-bold text-emerald-400 block">{accuracy}%</span>
              <p className="text-[10px] text-[#8E8E93] mt-0.5">Treffer</p>
            </div>
          </div>

          {/* Search & filter inside reports if expanded */}
          {expandedPhase !== null && (
            <div className="mb-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="In dieser Phase suchen (Deutsch, Thai, Lautschrift)..."
                  className="w-full px-3 py-2 bg-[#242426] border border-[#323236] rounded-xl text-xs text-white placeholder-[#71717A] focus:outline-none focus:border-[#FF7A00]"
                />
                {searchFilter && (
                  <button
                    onClick={() => setSearchFilter('')}
                    className="text-xs text-[#8E8E93] hover:text-white px-2 py-1 rounded bg-[#2C2C2E]"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setPhaseFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    phaseFilter === 'all'
                      ? 'bg-[#FF7A00] text-black font-semibold'
                      : 'bg-[#242426] text-[#8E8E93] hover:text-white'
                  }`}
                >
                  Alle ({vocabsByPhase[expandedPhase]?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setPhaseFilter('due')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                    phaseFilter === 'due'
                      ? 'bg-amber-500 text-black font-semibold'
                      : 'bg-[#242426] text-amber-400 hover:text-amber-300'
                  }`}
                >
                  <span>⚡ Jetzt fällig</span>
                  <span>({vocabsByPhase[expandedPhase]?.filter((i) => i.dueInfo.isDue).length || 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhaseFilter('future')}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    phaseFilter === 'future'
                      ? 'bg-[#3A3A3D] text-white font-semibold'
                      : 'bg-[#242426] text-[#8E8E93] hover:text-white'
                  }`}
                >
                  Später fällig ({vocabsByPhase[expandedPhase]?.filter((i) => !i.dueInfo.isDue).length || 0})
                </button>
              </div>
            </div>
          )}

          {/* 6-Phase Breakdown with Expandable Vocab Lists */}
          <div className="space-y-2.5 mb-5">
            {[1, 2, 3, 4, 5, 6].map((phaseNum) => {
              const cfg = PHASES[phaseNum];
              const phaseItems = vocabsByPhase[phaseNum] || [];
              const count = phaseItems.length;
              const percentage = totalInDeck > 0 ? Math.round((count / totalInDeck) * 100) : 0;
              const isExpanded = expandedPhase === phaseNum;

              // Filter phase items if search or status filter is applied
              const filteredItems = phaseItems.filter((item) => {
                if (isExpanded) {
                  if (phaseFilter === 'due' && !item.dueInfo.isDue) return false;
                  if (phaseFilter === 'future' && item.dueInfo.isDue) return false;
                }
                if (!searchFilter.trim()) return true;
                const q = searchFilter.toLowerCase();
                const v = item.vocab;
                return (
                  v.german.toLowerCase().includes(q) ||
                  v.thai.toLowerCase().includes(q) ||
                  (v.romanization || '').toLowerCase().includes(q) ||
                  (v.lesson || '').toLowerCase().includes(q)
                );
              });

              return (
                <div
                  key={phaseNum}
                  className={`rounded-2xl border transition-all ${
                    isExpanded
                      ? 'bg-[#242426] border-[#FF7A00]/40 shadow-lg'
                      : 'bg-[#242426]/70 border-[#2E2E32] hover:border-[#3E3E42]'
                  }`}
                >
                  {/* Phase Summary Bar (Clickable header) */}
                  <button
                    type="button"
                    onClick={() => togglePhase(phaseNum)}
                    className="w-full p-3 flex items-center justify-between text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-full ${cfg.badgeBg} text-white font-bold flex items-center justify-center text-xs shrink-0 shadow`}
                      >
                        {phaseNum}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white text-xs">
                            {cfg.name}
                          </span>
                          <span className="text-[#8E8E93] text-[11px]">
                            • Intervall: {cfg.intervalLabel}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#A1A1AA] truncate">
                          {cfg.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <div className="text-right">
                        <span className="font-bold text-white text-xs block">
                          {count} {count === 1 ? 'Wort' : 'Wörter'}
                        </span>
                        <span className="text-[10px] text-[#8E8E93]">
                          {percentage}%
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[#FF7A00]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#8E8E93]" />
                      )}
                    </div>
                  </button>

                  {/* Visual Progress percentage bar */}
                  <div className="px-3 pb-2.5">
                    <div className="h-1.5 w-full bg-[#18181A] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${cfg.badgeBg} transition-all duration-500 rounded-full`}
                        style={{ width: `${Math.max(percentage, count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Expanded Vocabulary List with Next Review Dates */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-[#2C2C2E]/80">
                      <div className="flex items-center justify-between py-1 mb-2">
                        <span className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#FF7A00]" />
                          Vokabeln in Phase {phaseNum} & Fälligkeit
                        </span>
                        <span className="text-[10px] text-[#8E8E93]">
                          {filteredItems.length} von {count} angezeigt
                        </span>
                      </div>

                      {filteredItems.length === 0 ? (
                        <div className="py-4 text-center text-xs text-[#71717A]">
                          {count === 0
                            ? 'Aktuell keine Vokabeln in dieser Phase.'
                            : 'Keine Vokabeln entsprechen deinem Suchfilter.'}
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-64 overflow-y-auto divide-y divide-[#2C2C2E] pr-1">
                          {filteredItems.map(({ vocab, progress, dueInfo }) => {
                            return (
                              <div
                                key={vocab.id}
                                className="pt-2 flex items-center justify-between gap-2.5 text-xs"
                              >
                                {/* Left text content */}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-white font-medium truncate">
                                      {vocab.german}
                                    </span>
                                    <span className="text-[#8E8E93]">&rarr;</span>
                                    <span className="text-[#FF7A00] font-thai truncate font-medium">
                                      {vocab.thai}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#71717A]">
                                    <span className="truncate max-w-[120px] text-[#A1A1AA]">
                                      {vocab.lesson || 'Allgemein'}
                                    </span>
                                    {vocab.romanization && (
                                      <span className="italic truncate max-w-[110px] text-[#8E8E93]">
                                        ({vocab.romanization})
                                      </span>
                                    )}
                                    {progress.streak > 0 && (
                                      <span className="text-amber-400/80">
                                        🔥 Streak: {progress.streak}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Right next review badge & audio */}
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => speakThai(vocab.thai)}
                                    className="p-1 rounded text-[#71717A] hover:text-white transition-colors cursor-pointer"
                                    title="Aussprache anhören"
                                  >
                                    <Volume2 className="w-3.5 h-3.5" />
                                  </button>

                                  <div className="text-right">
                                    <span
                                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block ${
                                        dueInfo.isDue
                                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                          : 'bg-[#1C1C1E] text-[#A1A1AA] border border-[#3A3A3D]'
                                      }`}
                                    >
                                      {dueInfo.label}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Leitner Spaced Repetition explanation */}
          <div className="bg-[#242426]/70 rounded-2xl p-3 border border-[#323236] text-xs text-[#A1A1AA] space-y-1 mb-4">
            <p className="font-semibold text-white flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#FF7A00]" />
              Leitner 6-Phasen-Taktung
            </p>
            <p className="text-[11px] leading-relaxed">
              Phase 1: täglich • Phase 2: 3 Tage • Phase 3: 7 Tage • Phase 4: 15 Tage • Phase 5: 30 Tage • Phase 6: 90 Tage. Jede gewusste Karte wandert weiter, bei Fehlern geht es zurück auf Phase 1.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-full bg-[#FF7A00] text-black font-semibold text-sm hover:bg-[#FF881A] transition-colors shadow-lg active:scale-[0.99] cursor-pointer mt-1"
        >
          Schließen
        </button>
      </div>
    </div>
  );
};
