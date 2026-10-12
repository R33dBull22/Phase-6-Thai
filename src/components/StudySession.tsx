import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Volume2,
  Eye,
  EyeOff,
  MessageSquare,
  Check,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Award,
  Keyboard,
  Layers,
  CheckCircle2,
  XCircle,
  Pencil,
  MoreVertical,
  ChevronRight,
  Send,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Vocabulary, UserProgress, QueryDirection } from '../types/vocab';
import { PHASES, getDirectionProgress } from '../utils/leitner';
import { speakThai } from '../utils/thaiAudio';
import { EditVocabModal } from './EditVocabModal';

export type StudyMode = 'preview_first' | 'skip_preview';
export type StudyDirection = 'de_to_th' | 'both' | 'th_to_de';
export type StudyInputMethod = 'typing' | 'flashcard';

export interface StudyCardItem {
  vocab: Vocabulary;
  progress?: UserProgress;
  direction?: QueryDirection;
}

interface StudySessionProps {
  cards: StudyCardItem[];
  mode: StudyMode;
  direction: StudyDirection;
  inputMethod?: StudyInputMethod;
  onFinish: () => void;
  onAnswer: (vocabId: string, isCorrect: boolean, direction: QueryDirection) => Promise<UserProgress>;
  defaultHideRomanization?: boolean;
  acceptRomanizationTyping?: boolean;
  onUpdateVocab?: (id: string, updatedData: Partial<Omit<Vocabulary, 'id' | 'createdAt'>>) => Promise<void>;
  existingLessons?: string[];
}

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'«»]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeThaiString(str: string): string {
  return str.trim().replace(/\s+/g, '');
}

function evaluateInput(
  input: string,
  v: Vocabulary,
  isDeToTh: boolean,
  allowRomanization: boolean
): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;

  if (isDeToTh) {
    // Target is Thai script
    const targetThai = normalizeThaiString(v.thai);
    const userThai = normalizeThaiString(trimmed);
    if (userThai === targetThai) return true;

    // Check romanization if permitted
    if (allowRomanization && v.romanization) {
      const targetRom = normalizeString(v.romanization);
      const userRom = normalizeString(trimmed);
      if (targetRom === userRom) return true;
    }

    return false;
  } else {
    // Target is German
    const targetGerman = normalizeString(v.german);
    const userGerman = normalizeString(trimmed);
    if (targetGerman === userGerman) return true;

    // Split options like "Hallo / Guten Tag"
    const options = v.german.split(/[\/,;]/).map((s) => normalizeString(s));
    if (options.some((opt) => opt === userGerman || opt.includes(userGerman) || userGerman.includes(opt))) {
      return true;
    }

    return false;
  }
}

export const StudySession: React.FC<StudySessionProps> = ({
  cards: initialCards,
  mode,
  direction,
  inputMethod = 'typing',
  onFinish,
  onAnswer,
  defaultHideRomanization = false,
  acceptRomanizationTyping = true,
  onUpdateVocab,
  existingLessons = [],
}) => {
  // Session queue: wrong cards are pushed to the end so they are repeated
  const [cardQueue, setCardQueue] = useState<StudyCardItem[]>(() => [...initialCards]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Set of task keys (vocabId_direction) that have been answered correctly during this session
  const [masteredTaskKeys, setMasteredTaskKeys] = useState<Set<string>>(new Set());
  const [editingCurrentVocab, setEditingCurrentVocab] = useState(false);

  // Total unique vocabs/directions to master in this session
  const totalUniqueCount = initialCards.length;

  const [currentInputMethod, setCurrentInputMethod] = useState<StudyInputMethod>(inputMethod);
  const [isRevealed, setIsRevealed] = useState(mode === 'preview_first');
  const [hideRomanization, setHideRomanization] = useState(defaultHideRomanization);
  const [showExample, setShowExample] = useState(false);
  const [showCardMenu, setShowCardMenu] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setShowCardMenu(false);
  }, [currentIndex]);

  // Typing state
  const [userInput, setUserInput] = useState('');
  const [isEvaluated, setIsEvaluated] = useState(false);
  const [isTypingCorrect, setIsTypingCorrect] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Statistics for session summary
  const [sessionResults, setSessionResults] = useState<{
    correctCount: number;
    incorrectCount: number;
    promotedToPhase6: number;
    reviewedCards: { vocab: Vocabulary; isCorrect: boolean; newPhase: number; direction: QueryDirection }[];
  }>({
    correctCount: 0,
    incorrectCount: 0,
    promotedToPhase6: 0,
    reviewedCards: [],
  });

  const [isSessionComplete, setIsSessionComplete] = useState(false);

  const currentItem = cardQueue[currentIndex];
  const vocab = currentItem?.vocab;
  const progress = currentItem?.progress;

  // Determine current card direction: item-specific direction has priority, otherwise based on session direction
  const activeDirection: QueryDirection =
    currentItem?.direction ||
    (direction === 'de_to_th'
      ? 'de_to_th'
      : direction === 'th_to_de'
      ? 'th_to_de'
      : currentIndex % 2 === 0
      ? 'de_to_th'
      : 'th_to_de');

  const isDeToThai = activeDirection === 'de_to_th';
  const otherDirection: QueryDirection = isDeToThai ? 'th_to_de' : 'de_to_th';

  const dirProgress = getDirectionProgress(progress, activeDirection);
  const otherDirProgress = getDirectionProgress(progress, otherDirection);
  const currentPhase = dirProgress.phase;

  const currentTaskKey = vocab ? `${vocab.id}_${activeDirection}` : '';

  // Auto-focus input when card changes
  useEffect(() => {
    if (currentInputMethod === 'typing' && !isEvaluated) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [currentIndex, currentInputMethod, isEvaluated]);

  const handlePlayAudio = () => {
    if (vocab?.thai) {
      speakThai(vocab.thai);
    }
  };

  const handleReveal = () => {
    setIsRevealed(true);
    if (isTyping) {
      // In typing mode (Deutsch -> Thai): revealing solution immediately brings up
      // the evaluation controls ("Gelten lassen" / "Nicht gewusst"), just like checking an answer!
      setIsEvaluated(true);
      setIsTypingCorrect(false);
    }
    if (isDeToThai) {
      handlePlayAudio();
    }
  };

  // Check typed answer
  const handleCheckTyping = () => {
    if (!vocab) return;
    const isCorrect = evaluateInput(userInput, vocab, isDeToThai, acceptRomanizationTyping);
    setIsTypingCorrect(isCorrect);
    setIsEvaluated(true);
    setIsRevealed(true);
    handlePlayAudio();
  };

  const handleRate = async (isCorrect: boolean) => {
    if (!vocab || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const updated = await onAnswer(vocab.id, isCorrect, activeDirection);

      const updatedDirProg = getDirectionProgress(updated, activeDirection);
      const hitPhase6 = isCorrect && updatedDirProg.phase === 6 && currentPhase < 6;
      if (hitPhase6) {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
        });
      }

      const isMasteredBefore = masteredTaskKeys.has(currentTaskKey);

      if (isCorrect && !isMasteredBefore) {
        setMasteredTaskKeys((prev) => new Set(prev).add(currentTaskKey));
      }

      setSessionResults((prev) => ({
        correctCount: prev.correctCount + (isCorrect ? 1 : 0),
        incorrectCount: prev.incorrectCount + (!isCorrect ? 1 : 0),
        promotedToPhase6: prev.promotedToPhase6 + (hitPhase6 ? 1 : 0),
        reviewedCards: [
          ...prev.reviewedCards,
          {
            vocab,
            isCorrect,
            newPhase: updatedDirProg.phase,
            direction: activeDirection,
          },
        ],
      }));

      // If answered incorrectly: card re-enters the study queue at the end with the same direction!
      if (!isCorrect) {
        setCardQueue((prev) => [
          ...prev,
          { vocab, progress: updated, direction: activeDirection },
        ]);
      }

      // Check if session is complete:
      // Session finishes when ALL unique cards in this session have been answered correctly at least once,
      // and we have reached the end of the current queue (taking into account the freshly re-enqueued card if wrong).
      const newMasteredCount = (!isMasteredBefore && isCorrect)
        ? masteredTaskKeys.size + 1
        : masteredTaskKeys.size;

      const hasNextInQueue = !isCorrect || (currentIndex + 1 < cardQueue.length);

      if (newMasteredCount >= totalUniqueCount && !hasNextInQueue) {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
        setIsSessionComplete(true);
      } else {
        setCurrentIndex((i) => i + 1);
        setIsRevealed(mode === 'preview_first');
        setUserInput('');
        setIsEvaluated(false);
        setIsTypingCorrect(null);
        setShowExample(false);
      }
    } catch (err) {
      console.error('Answer recording failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Completed Screen
  if (isSessionComplete) {
    return (
      <div className="fixed inset-0 z-50 bg-[#121214] text-white flex flex-col justify-between p-6">
        <div className="max-w-md w-full mx-auto flex-1 flex flex-col justify-center items-center text-center">
          <div className="w-20 h-20 rounded-full bg-[#FF7A00]/20 border border-[#FF7A00]/40 flex items-center justify-center mb-6 text-[#FF7A00]">
            <Award className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-bold tracking-tight mb-2">Abfrage abgeschlossen!</h2>
          <p className="text-sm text-[#8E8E93] mb-8">
            Du hast alle {totalUniqueCount} {totalUniqueCount === 1 ? 'Vokabel' : 'Vokabeln'} erfolgreich gemeistert.
          </p>

          <div className="grid grid-cols-3 gap-3 w-full mb-8">
            <div className="bg-[#242426] p-4 rounded-2xl border border-[#323236]">
              <span className="text-2xl font-bold text-emerald-400">
                {sessionResults.correctCount}
              </span>
              <p className="text-xs text-[#8E8E93] mt-1">Gewusst</p>
            </div>
            <div className="bg-[#242426] p-4 rounded-2xl border border-[#323236]">
              <span className="text-2xl font-bold text-rose-400">
                {sessionResults.incorrectCount}
              </span>
              <p className="text-xs text-[#8E8E93] mt-1">Wiederholen</p>
            </div>
            <div className="bg-[#242426] p-4 rounded-2xl border border-[#323236]">
              <span className="text-2xl font-bold text-[#FF7A00]">
                {sessionResults.promotedToPhase6}
              </span>
              <p className="text-xs text-[#8E8E93] mt-1">Langzeit (P6)</p>
            </div>
          </div>

          {/* List of reviewed items */}
          <div className="w-full bg-[#1C1C1E] rounded-2xl p-4 border border-[#2C2C2E] max-h-52 overflow-y-auto text-left mb-6">
            <span className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider block mb-2">
              Zusammenfassung
            </span>
            <div className="space-y-2">
              {sessionResults.reviewedCards.map((rc, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-1.5 border-b border-[#2C2C2E]/60 last:border-none">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="text-[10px] bg-[#242426] text-[#FF7A00] px-1.5 py-0.5 rounded font-mono shrink-0">
                      {rc.direction === 'de_to_th' ? '🇩🇪➔🇹🇭' : '🇹🇭➔🇩🇪'}
                    </span>
                    <span className="font-medium text-white truncate">{rc.vocab.german}</span>
                    <span className="text-[#8E8E93] ml-1 font-thai truncate">{rc.vocab.thai}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      PHASES[rc.newPhase]?.badgeBg || 'bg-gray-600'
                    }`}>
                      P{rc.newPhase}
                    </span>
                    {rc.isCorrect ? (
                      <span className="text-emerald-400">✓</span>
                    ) : (
                      <span className="text-rose-400">↺</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-md w-full mx-auto">
          <button
            onClick={onFinish}
            className="w-full py-4 rounded-full bg-[#FF7A00] text-black font-semibold text-base hover:bg-[#FF881A] transition-colors shadow-lg active:scale-[0.99]"
          >
            Fertig
          </button>
        </div>
      </div>
    );
  }

  if (!vocab) return null;

  // Typing is only for Deutsch -> Thai, while Thai -> Deutsch uses "Lösung anzeigen" -> "Gelten lassen / Nicht gewusst" with red/green arrows!
  const isTyping = currentInputMethod === 'typing' && isDeToThai;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#121214] text-white flex flex-col justify-between p-3 sm:p-5 select-none overflow-hidden h-[100dvh]"
      onClick={() => setShowCardMenu(false)}
    >
      {/* Top Bar matching IMG_6357.png */}
      <div className="max-w-md w-full mx-auto">
        <div className="flex items-center justify-between pt-1 pb-2 px-1">
          {/* Phase Number on Left */}
          <span
            className="text-lg font-bold text-[#FF7A00] select-none"
            title={`Aktuelle Richtung (${isDeToThai ? 'DE ➔ TH' : 'TH ➔ DE'}): Phase ${currentPhase}`}
          >
            {currentPhase}
          </span>

          {/* Progress Bar Track in Center */}
          <div className="flex-1 h-1.5 bg-[#2C2C2E] rounded-full overflow-hidden mx-3">
            <div
              className="h-full bg-[#FF7A00] transition-all duration-300 rounded-full"
              style={{
                width: `${totalUniqueCount > 0 ? (masteredTaskKeys.size / totalUniqueCount) * 100 : 0}%`,
              }}
            />
          </div>

          {/* Counter and Close on Right */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold select-none">
              <span className="text-[#FF7A00] font-bold">{masteredTaskKeys.size}</span>
              <span className="text-[#8E8E93]"> / {totalUniqueCount}</span>
            </span>

            <button
              type="button"
              onClick={onFinish}
              className="p-1 text-[#8E8E93] hover:text-white transition-colors"
              title="Session beenden"
            >
              <X className="w-5 h-5 stroke-[2.2]" />
            </button>
          </div>
        </div>
      </div>

      {/* Single Unified Card matching IMG_6357.png */}
      <div className="max-w-md w-full mx-auto flex-1 min-h-0 flex flex-col my-1">
        <div className="relative bg-[#262628] border border-[#38383A] rounded-3xl p-5 flex flex-col justify-between flex-1 min-h-[200px] shadow-xl overflow-hidden">
          {/* Card Top Row: Flag on left, 3-dots menu on right */}
          <div className="flex items-center justify-between z-10">
            <span
              className="text-2xl select-none"
              title={isDeToThai ? 'Deutsch ➔ Thai' : 'Thai ➔ Deutsch'}
            >
              {isDeToThai ? '🇩🇪' : '🇹🇭'}
            </span>

            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCardMenu(!showCardMenu);
                }}
                className="p-1.5 rounded-full text-[#8E8E93] hover:text-white hover:bg-[#323236] transition-colors"
                title="Optionen"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {/* 3-dots Dropdown Menu */}
              {showCardMenu && (
                <div
                  className="absolute right-0 top-9 z-30 bg-[#1C1C1E] border border-[#3A3A3D] rounded-2xl p-1.5 shadow-2xl min-w-[210px] text-xs space-y-1 animate-in fade-in zoom-in-95 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  {onUpdateVocab && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowCardMenu(false);
                        setEditingCurrentVocab(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#2C2C2E] text-white transition-colors text-left"
                    >
                      <Pencil className="w-3.5 h-3.5 text-[#FF7A00]" />
                      <span>Vokabel bearbeiten</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      handlePlayAudio();
                      setShowCardMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#2C2C2E] text-white transition-colors text-left"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-[#FF7A00]" />
                    <span>Aussprache abspielen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHideRomanization(!hideRomanization);
                      setShowCardMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#2C2C2E] text-white transition-colors text-left"
                  >
                    {hideRomanization ? (
                      <>
                        <Eye className="w-3.5 h-3.5 text-[#FF7A00]" />
                        <span>Umschrift einblenden</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-[#FF7A00]" />
                        <span>Umschrift ausblenden</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentInputMethod(currentInputMethod === 'typing' ? 'flashcard' : 'typing');
                      setShowCardMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#2C2C2E] text-white transition-colors text-left"
                  >
                    <Keyboard className="w-3.5 h-3.5 text-[#FF7A00]" />
                    <span>
                      {currentInputMethod === 'typing'
                        ? 'Zu Karteikarte wechseln'
                        : 'Zu Tippen wechseln'}
                    </span>
                  </button>
                  <div className="border-t border-[#2C2C2E] pt-1 px-3 py-1 text-[10px] text-[#8E8E93]">
                    Lektion: {vocab.lesson} | Phase {currentPhase}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Center: The Word (e.g. "Weight" / "Größe / Körpergröße") */}
          <div className="my-auto text-center px-4 py-2 z-10">
            {/* Primary Question Prompt */}
            {isDeToThai ? (
              <h2 className="text-2xl sm:text-3xl font-medium text-white tracking-wide leading-snug">
                {vocab.german}
              </h2>
            ) : (
              <div>
                <h2 className="text-3xl sm:text-4xl font-thai font-medium text-white tracking-normal leading-snug">
                  {vocab.thai}
                </h2>
                {!hideRomanization && vocab.romanization && (
                  <p className="text-base text-[#FF7A00] font-medium mt-1.5">
                    {vocab.romanization}
                  </p>
                )}
              </div>
            )}

            {/* Revealed / Evaluated Solution */}
            {isRevealed && (
              <div className="mt-4 pt-4 border-t border-[#3A3A3D]/70 animate-in fade-in duration-200">
                {isDeToThai ? (
                  <div>
                    <h3 className="text-3xl sm:text-4xl font-thai font-semibold text-white tracking-normal mb-1">
                      {vocab.thai}
                    </h3>
                    {!hideRomanization && vocab.romanization && (
                      <p className="text-base text-[#FF7A00] font-medium tracking-wide">
                        {vocab.romanization}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-bold text-white mb-1">
                      {vocab.german}
                    </h3>
                  </div>
                )}

                {/* Speaker button & feedback icon */}
                <div className="flex items-center justify-center gap-3 mt-3">
                  <button
                    type="button"
                    onClick={handlePlayAudio}
                    className="p-2 rounded-full bg-[#323236] text-[#D1D1D6] hover:text-white hover:bg-[#3E3E42] transition-colors"
                    title="Aussprache anhören"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  {isEvaluated && isTyping && (
                    <span className="text-xl" title={isTypingCorrect ? 'Richtig' : 'Abweichung'}>
                      {isTypingCorrect ? '😊' : '☹️'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Example sentence if toggled via the speech bubble button */}
            {showExample && (vocab.exampleThai || vocab.exampleGerman) && (
              <div className="mt-3 p-3 bg-[#1C1C1E] rounded-2xl border border-[#3A3A3D] text-left text-xs space-y-1 animate-in fade-in duration-150">
                {vocab.exampleThai && (
                  <p className="text-white font-thai text-sm">{vocab.exampleThai}</p>
                )}
                {vocab.exampleGerman && (
                  <p className="text-[#8E8E93] italic">{vocab.exampleGerman}</p>
                )}
              </div>
            )}
          </div>

          {/* Right Chevron > inside card matching IMG_6357.png */}
          <button
            type="button"
            onClick={() => {
              if (!isRevealed) handleReveal();
            }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-2 text-[#8E8E93] hover:text-white transition-colors cursor-pointer"
            title="Lösung anzeigen"
          >
            <ChevronRight className="w-5 h-5 stroke-[2]" />
          </button>

          {/* Bottom-right Keyboard Icon inside card matching IMG_6357.png */}
          <button
            type="button"
            onClick={() => setCurrentInputMethod(currentInputMethod === 'typing' ? 'flashcard' : 'typing')}
            className="absolute bottom-4 right-4 p-1.5 text-[#8E8E93] hover:text-[#FF7A00] transition-colors cursor-pointer"
            title={currentInputMethod === 'typing' ? 'Zu Karteikarte wechseln' : 'Zu Tippen wechseln'}
          >
            <Keyboard className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom Area matching IMG_6357.png: Input row docked above keyboard */}
      <div className="max-w-md w-full mx-auto pt-2 pb-1 sm:pb-3">
        {/* CASE 1: Typing mode, not yet submitted */}
        {isTyping && !isEvaluated && (
          <div className="flex items-center gap-2.5">
            {/* Input Pill Container with Speech bubble button inside */}
            <div className="flex-1 flex items-center bg-[#28282A] border border-[#38383A] focus-within:border-[#FF7A00] rounded-2xl px-2 py-1.5 transition-colors shadow-inner">
                {/* Speech Bubble Icon (Beispielsatz) */}
                <button
                  type="button"
                  onClick={() => setShowExample(!showExample)}
                  className={`p-2 rounded-xl transition-colors ${
                    showExample
                      ? 'bg-[#FF7A00] text-black'
                      : 'bg-[#38383C] text-[#8E8E93] hover:text-white'
                  }`}
                  title="Beispielsatz anzeigen"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>

                {/* Text input */}
                <input
                  ref={inputRef}
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (!isEvaluated) {
                        handleCheckTyping();
                      } else {
                        handleRate(isTypingCorrect ? true : false);
                      }
                    }
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  aria-autocomplete="none"
                  inputMode="text"
                  placeholder={
                    acceptRomanizationTyping
                      ? 'Thai oder Lautschrift tippen...'
                      : 'Thai Schriftzeichen tippen...'
                  }
                  className="w-full bg-transparent text-white text-base px-3 py-1 focus:outline-none placeholder-[#71717A] font-thai"
                />
              </div>

              {/* Circular Send / Submit Button matching IMG_6357.png */}
              <button
                type="button"
                onClick={handleCheckTyping}
                disabled={!userInput.trim()}
                className={`w-12 h-12 rounded-full border border-[#38383A] flex items-center justify-center transition-all active:scale-95 shrink-0 ${
                  userInput.trim()
                    ? 'bg-[#FF7A00] text-black shadow-lg shadow-orange-500/20 hover:bg-[#FF881A]'
                    : 'bg-[#28282A] text-[#8E8E93] hover:text-white hover:bg-[#323236]'
                }`}
                title="Antwort prüfen"
              >
                <Send className="w-5 h-5 -rotate-45 ml-0.5" />
              </button>
            </div>
        )}

        {/* CASE 2: Typing mode, evaluated */}
        {isTyping && isEvaluated && (
          isTypingCorrect ? (
            /* Vokabel genau so eingegeben wie in der Lösung -> Nur der Button "Gewusst" */
            <button
              type="button"
              onClick={() => handleRate(true)}
              disabled={isSubmitting}
              className="w-full py-4 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-base shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5 text-white stroke-[2.5]" />
              <span>Gewusst</span>
              <ArrowRight className="w-4 h-4 text-white stroke-[2.5]" />
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {/* Roter Pfeil: Nicht gewusst / Wiederholen */}
              <button
                type="button"
                onClick={() => handleRate(false)}
                disabled={isSubmitting}
                className="py-4 rounded-full bg-[#242426] border border-rose-500/40 text-rose-400 font-semibold text-sm hover:bg-[#2C2C2E] hover:border-rose-500 transition-colors active:scale-[0.99] flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4 text-rose-400 stroke-[2.5]" />
                <span>Nicht gewusst</span>
              </button>

              {/* Grüner Pfeil: Gelten lassen */}
              <button
                type="button"
                onClick={() => handleRate(true)}
                disabled={isSubmitting}
                className="py-4 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-semibold text-sm hover:bg-emerald-500/25 transition-colors shadow-lg active:scale-[0.99] flex items-center justify-center gap-2"
              >
                <span>Gelten lassen</span>
                <ArrowRight className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
              </button>
            </div>
          )
        )}

        {/* CASE 3: Flashcard mode / Aufdecken-Modus */}
        {!isTyping && !isRevealed && (
          <button
            type="button"
            onClick={handleReveal}
            className="w-full py-4 rounded-full bg-[#FF7A00] text-black font-semibold text-base hover:bg-[#FF881A] transition-colors shadow-lg active:scale-[0.99] flex items-center justify-center gap-2"
          >
            <Eye className="w-4 h-4 text-black" />
            <span>Lösung anzeigen</span>
          </button>
        )}

        {!isTyping && isRevealed && (
          <div className="grid grid-cols-2 gap-3">
            {/* Roter Pfeil: Nicht gewusst */}
            <button
              type="button"
              onClick={() => handleRate(false)}
              disabled={isSubmitting}
              className="py-4 rounded-full bg-[#242426] border border-rose-500/40 text-rose-400 font-semibold text-sm hover:bg-[#2C2C2E] hover:border-rose-500 transition-colors active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4 text-rose-400 stroke-[2.5]" />
              <span>Nicht gewusst</span>
            </button>

            {/* Grüner Pfeil: Gewusst */}
            <button
              type="button"
              onClick={() => handleRate(true)}
              disabled={isSubmitting}
              className="py-4 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-semibold text-sm hover:bg-emerald-500/25 transition-colors shadow-lg active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <span>Gewusst</span>
              <ArrowRight className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
            </button>
          </div>
        )}
      </div>

      {/* In-Session Edit Vocab Modal */}
      {editingCurrentVocab && vocab && (
        <EditVocabModal
          vocab={vocab}
          isOpen={editingCurrentVocab}
          onClose={() => setEditingCurrentVocab(false)}
          onSave={async (id, data) => {
            if (onUpdateVocab) {
              await onUpdateVocab(id, data);
              // Update in cardQueue
              setCardQueue((prev) =>
                prev.map((item) =>
                  item.vocab.id === id
                    ? {
                        ...item,
                        vocab: {
                          ...item.vocab,
                          ...data,
                        },
                      }
                    : item
                )
              );
            }
          }}
          existingLessons={
            existingLessons.length > 0 ? existingLessons : [vocab.lesson]
          }
        />
      )}
    </div>
  );
};
