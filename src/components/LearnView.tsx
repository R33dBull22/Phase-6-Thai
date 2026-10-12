import React, { useState } from 'react';
import {
  RotateCcw,
  BarChart2,
  BookOpen,
  Layers,
  ClipboardList,
  CheckCircle2,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { Vocabulary, UserProgress } from '../types/vocab';
import { isCardDue } from '../utils/leitner';
import { ReportsModal } from './ReportsModal';
import { StudySummaryModal } from './StudySummaryModal';
import { StudyMode, StudyDirection, StudyInputMethod } from './StudySession';

interface LearnViewProps {
  vocabularies: Vocabulary[];
  progressMap: Record<string, UserProgress>;
  studyMode: StudyMode;
  studyDirection: StudyDirection;
  defaultInputMethod: StudyInputMethod;
  onUpdateStudyPreferences: (
    mode: StudyMode,
    direction: StudyDirection,
    inputMethod: StudyInputMethod
  ) => void;
  onStartSession: (
    cards: { vocab: Vocabulary; progress?: UserProgress }[],
    mode: StudyMode,
    direction: StudyDirection,
    inputMethod?: StudyInputMethod
  ) => void;
  onNavigatePool: () => void;
  onNavigateCreate: () => void;
}

export const LearnView: React.FC<LearnViewProps> = ({
  vocabularies,
  progressMap,
  studyMode,
  studyDirection,
  defaultInputMethod,
  onUpdateStudyPreferences,
  onStartSession,
  onNavigatePool,
  onNavigateCreate,
}) => {
  const [showReports, setShowReports] = useState(false);
  const [customizeModalCards, setCustomizeModalCards] = useState<
    { vocab: Vocabulary; progress?: UserProgress }[] | null
  >(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Cards in deck
  const deckVocabs = vocabularies.filter((v) => progressMap[v.id]);

  // Due cards (strictly due today or overdue based on Leitner intervals)
  const dueCards = deckVocabs
    .filter((v) => {
      const prog = progressMap[v.id];
      return isCardDue(prog?.nextReviewDate || '');
    })
    .map((v) => ({ vocab: v, progress: progressMap[v.id] }));

  // New vocabularies: In deck, in Phase 1, never reviewed yet or streak = 0
  const newVocabCards = deckVocabs
    .filter((v) => {
      const prog = progressMap[v.id];
      if (!prog) return false;
      const isNew = prog.phase === 1 && (!prog.lastReviewedAt || prog.streak === 0);
      return isNew && isCardDue(prog.nextReviewDate);
    })
    .map((v) => ({ vocab: v, progress: progressMap[v.id] }));

  // All cards in deck for voluntary practice
  const allDeckCards = deckVocabs.map((v) => ({
    vocab: v,
    progress: progressMap[v.id],
  }));

  const dueCount = dueCards.length;
  const newCount = newVocabCards.length;
  const totalDeckCount = deckVocabs.length;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Direct start using saved preferences - NO dialog interruption!
  const handleDirectStart = (cards: { vocab: Vocabulary; progress?: UserProgress }[]) => {
    if (cards.length === 0) {
      if (totalDeckCount === 0) {
        onNavigatePool();
      } else {
        showToast('Alle fälligen Vokabeln für heute sind bereits gelernt! 🎉');
      }
      return;
    }
    onStartSession(cards, studyMode, studyDirection, defaultInputMethod);
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-3 pb-28 text-white min-h-[90vh] flex flex-col justify-between">
      <div>
        {/* Top Bar matching IMG_6334.png */}
        <div className="flex items-center justify-between py-2 mb-4">
          <button
            onClick={onNavigatePool}
            className="p-1 -ml-1 text-[#FF7A00] hover:text-[#FFA040] transition-colors"
            title="Zum Vokabelpool"
          >
            <BookOpen className="w-5 h-5" />
          </button>

          <h1 className="text-base font-semibold text-white tracking-tight">
            Thai
          </h1>

          <button
            onClick={() => setShowReports(true)}
            className="p-1 -mr-1 text-[#8E8E93] hover:text-white transition-colors"
            title="Statistik"
          >
            <Layers className="w-5 h-5" />
          </button>
        </div>

        {/* Status Toast Banner */}
        {toastMessage && (
          <div className="mb-4 p-3 bg-[#242426] border border-[#FF7A00]/50 rounded-2xl text-xs text-[#FF7A00] flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#FF7A00]" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Hero Section matching IMG_6334.png */}
        <div className="grid grid-cols-12 gap-3 mb-5">
          {/* Left Course Card */}
          <div className="col-span-7 flex flex-col">
            <div className="relative w-full aspect-[4/5] rounded-3xl overflow-hidden bg-gradient-to-br from-[#2E2E32] to-[#1C1C1E] border border-[#3A3A3D] shadow-lg flex items-center justify-center group">
              <div className="absolute inset-0 bg-[radial-gradient(#3A3A3D_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />

              <div className="text-center p-4 relative z-10">
                <span className="text-4xl block mb-2 drop-shadow-md">🇹🇭</span>
                <span className="text-2xl font-bold font-thai tracking-wide text-white block">
                  ภาษาไทย
                </span>
                <span className="text-xs text-[#A1A1AA] font-medium tracking-tight mt-1 block">
                  Thai Hasis Vokabeltrainer
                </span>
              </div>

              {/* Avatar circle overlay matching IMG_6334.png */}
              <div className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center text-slate-800 shadow-md border border-white">
                <span className="text-base font-bold">👤</span>
              </div>
            </div>

            {/* "Zuletzt gelernt: Heute" */}
            <p className="text-xs text-[#8E8E93] mt-2.5 px-1 font-medium">
              Zuletzt gelernt: <span className="text-[#FF7A00]">Heute</span>
            </p>
          </div>

          {/* Right Stacked Tiles matching IMG_6334.png */}
          <div className="col-span-5 flex flex-col gap-3">
            {/* Top Tile: Circular reload badge with count & "Heute" */}
            <button
              onClick={() => handleDirectStart(dueCards)}
              className="flex-1 bg-[#242426] rounded-3xl p-4 border border-[#323236] flex flex-col items-center justify-center text-center hover:bg-[#2A2A2E] transition-all active:scale-[0.98] shadow-md relative group"
            >
              <div className="relative w-14 h-14 rounded-full border-2 border-[#FF7A00] flex items-center justify-center mb-2">
                <span className="text-xl font-bold text-[#FF7A00]">
                  {dueCount > 0 ? dueCount : totalDeckCount > 0 ? '✓' : '0'}
                </span>
                <RotateCcw className="w-3.5 h-3.5 text-[#FF7A00] absolute -top-1.5 -right-1" />
              </div>
              <span className="text-xs font-semibold text-[#FF7A00]">
                Heute
              </span>
              <span className="text-[10px] text-[#8E8E93] mt-0.5">
                {dueCount > 0 ? `${dueCount} fällig` : 'Auf dem Stand'}
              </span>
            </button>

            {/* Bottom Tile: Reports */}
            <button
              onClick={() => setShowReports(true)}
              className="flex-1 bg-[#242426] rounded-3xl p-4 border border-[#323236] flex flex-col items-center justify-center text-center hover:bg-[#2A2A2E] transition-all active:scale-[0.98] shadow-md group"
            >
              <div className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center text-[#8E8E93] group-hover:text-white transition-colors mb-1.5">
                <BarChart2 className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-white">
                Reports
              </span>
              <span className="text-[10px] text-[#8E8E93] mt-0.5">
                6 Phasen
              </span>
            </button>
          </div>
        </div>

        {/* Learning Status overview & Saved settings badge */}
        <div className="bg-[#1C1C1E] rounded-2xl p-3.5 border border-[#2C2C2E] mb-5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FF7A00] animate-pulse" />
            <span className="text-[#D1D1D6]">
              {totalDeckCount} Vokabeln im Lernprozess
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCustomizeModalCards(dueCards.length > 0 ? dueCards : allDeckCards)}
              className="text-[#8E8E93] hover:text-[#FF7A00] flex items-center gap-1 font-medium transition-colors"
              title="Abfrage-Einstellungen anpassen"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#FF7A00]" />
              <span>Einstellungen</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Action Pill Buttons matching IMG_6334.png */}
      <div className="space-y-3 pt-2">
        {/* Outlined button: Neue Vokabeln */}
        <button
          onClick={() => {
            if (newCount > 0) {
              handleDirectStart(newVocabCards);
            } else {
              onNavigatePool();
            }
          }}
          className="w-full py-4 rounded-full bg-[#1C1C1E] border border-[#3A3A3D] text-white font-semibold text-sm hover:bg-[#242426] transition-colors flex items-center justify-center gap-2.5 active:scale-[0.99] shadow-sm"
        >
          <RotateCcw className="w-4 h-4 text-[#8E8E93]" />
          <span>
            {newCount > 0
              ? `Neue Vokabeln (${newCount})`
              : 'Neue Vokabeln auswählen'}
          </span>
        </button>

        {/* Outlined button: Tests und Aufgaben */}
        <button
          onClick={() => {
            if (allDeckCards.length > 0) {
              handleDirectStart(allDeckCards);
            } else {
              onNavigatePool();
            }
          }}
          className="w-full py-4 rounded-full bg-[#1C1C1E] border border-[#3A3A3D] text-white font-semibold text-sm hover:bg-[#242426] transition-colors flex items-center justify-center gap-2.5 active:scale-[0.99] shadow-sm"
        >
          <ClipboardList className="w-4 h-4 text-[#8E8E93]" />
          <span>Tests und Aufgaben ({totalDeckCount})</span>
        </button>

        {/* Solid Orange button: Reguläre Übung */}
        {dueCount > 0 ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDirectStart(dueCards)}
              className="flex-1 py-4 rounded-full bg-[#FF7A00] text-black font-semibold text-base hover:bg-[#FF881A] transition-colors shadow-lg active:scale-[0.99] flex items-center justify-center gap-2.5"
            >
              <RotateCcw className="w-5 h-5 text-black stroke-[2.5]" />
              <span>Reguläre Übung ({dueCount})</span>
            </button>
            <button
              onClick={() => setCustomizeModalCards(dueCards)}
              className="p-4 rounded-full bg-[#1C1C1E] border border-[#3A3A3D] text-[#8E8E93] hover:text-[#FF7A00] hover:border-[#FF7A00] transition-colors active:scale-95"
              title="Abfrage-Optionen anpassen"
            >
              <SlidersHorizontal className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="w-full py-3.5 px-4 rounded-full bg-[#1C1C1E] border border-emerald-500/30 text-emerald-400 font-medium text-sm flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Alle Vokabeln für heute erledigt! ✓</span>
            </div>
            {totalDeckCount > 0 && (
              <button
                onClick={() => handleDirectStart(allDeckCards)}
                className="w-full py-2.5 text-xs text-[#8E8E93] hover:text-white transition-colors text-center"
              >
                Freiwillig alle {totalDeckCount} Vokabeln wiederholen
              </button>
            )}
          </div>
        )}
      </div>

      {/* Reports Modal */}
      <ReportsModal
        isOpen={showReports}
        onClose={() => setShowReports(false)}
        progressMap={progressMap}
        vocabularies={vocabularies}
      />

      {/* Zusammenfassung Modal - Only shown when user deliberately taps "Einstellungen / Anpassen" */}
      {customizeModalCards && (
        <StudySummaryModal
          cardsToStudy={customizeModalCards}
          onBack={() => setCustomizeModalCards(null)}
          initialMode={studyMode}
          initialDirection={studyDirection}
          defaultInputMethod={defaultInputMethod}
          onStart={(mode, direction, inputMethod) => {
            const list = customizeModalCards;
            setCustomizeModalCards(null);
            onUpdateStudyPreferences(mode, direction, inputMethod);
            onStartSession(list, mode, direction, inputMethod);
          }}
        />
      )}
    </div>
  );
};
