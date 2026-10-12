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
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleInsertThaiChar = (char: string) => {
    setUserInput((prev) => prev + char);
    inputRef.current?.focus();
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
    <div className="fixed inset-0 z-50 bg-[#121214] text-white flex flex-col justify-between p-4 sm:p-6 select-none overflow-hidden">
      {/* Top Bar matching IMG_6344.png */}
      <div className="max-w-md w-full mx-auto">
        <div className="flex items-center gap-3 pt-2 pb-4">
          {/* Phase Badge */}
          <div className="w-8 text-center" title={`Aktuelle Richtung (${isDeToThai ? 'DE ➔ TH' : 'TH ➔ DE'}): Phase ${currentPhase}`}>
            <span className="text-base font-bold text-[#FF7A00]">
              {currentPhase}
            </span>
          </div>

          {/* Progress Bar Track: zeigt die richtig beantworteten Vokabeln an */}
          <div className="flex-1 h-1.5 bg-[#2C2C2E] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FF7A00] transition-all duration-300 rounded-full"
              style={{
                width: `${totalUniqueCount > 0 ? (masteredTaskKeys.size / totalUniqueCount) * 100 : 0}%`,
              }}
            />
          </div>

          {/* Counter: richtig beantwortet / gesamt */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-medium text-[#8E8E93]" title="Richtig gewusst / Gesamt">
              <span className="text-emerald-400 font-bold">{masteredTaskKeys.size}</span> / {totalUniqueCount}
            </span>

            {/* Switch between typing and flashcard mode */}
            <button
              onClick={() => setCurrentInputMethod(currentInputMethod === 'typing' ? 'flashcard' : 'typing')}
              className="p-1 rounded-full text-[#8E8E93] hover:text-[#FF7A00] transition-colors"
              title={currentInputMethod === 'typing' ? 'Zu Aufdecken-Modus wechseln' : 'Zu Tippen-Modus wechseln'}
            >
              {currentInputMethod === 'typing' ? (
                <Keyboard className="w-4 h-4 text-[#FF7A00]" />
              ) : (
                <Layers className="w-4 h-4 text-[#8E8E93]" />
              )}
            </button>

            <button
              onClick={onFinish}
              className="w-8 h-8 rounded-full bg-[#242426] flex items-center justify-center text-[#8E8E93] hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Flashcard split container matching IMG_6344.png */}
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col justify-center py-2 space-y-3">
        {/* Top Half of Card (Question) */}
        <div className="relative bg-[#2C2C2E] rounded-3xl p-6 min-h-[160px] flex flex-col justify-between border border-[#3A3A3D] shadow-lg">
          {/* Top Header inside card */}
          <div className="flex items-center justify-between text-xs text-[#8E8E93]">
            <div className="flex items-center gap-2">
              <span className="text-lg">{isDeToThai ? '🇩🇪' : '🇹🇭'}</span>
              <span className="text-[11px] font-medium text-[#8E8E93]">
                {vocab.lesson}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {onUpdateVocab && (
                <button
                  type="button"
                  onClick={() => setEditingCurrentVocab(true)}
                  className="p-1 rounded-full text-[#8E8E93] hover:text-[#FF7A00] transition-colors cursor-pointer"
                  title="Diese Vokabel bearbeiten"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="text-[10px] bg-[#3A3A3D] text-[#FF7A00] px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                {isDeToThai ? '🇩🇪 ➔ 🇹🇭' : '🇹🇭 ➔ 🇩🇪'}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${
                  PHASES[currentPhase]?.badgeBg || 'bg-[#3A3A3D]'
                }`}
                title={`Aktuelle Richtung (${isDeToThai ? 'DE ➔ TH' : 'TH ➔ DE'}): Phase ${currentPhase}`}
              >
                P{currentPhase}
              </span>
              <span
                className="text-[10px] bg-[#242426] text-[#8E8E93] px-1.5 py-0.5 rounded-full hidden sm:inline"
                title={`Gegenrichtung (${isDeToThai ? 'TH ➔ DE' : 'DE ➔ TH'}): Phase ${otherDirProgress.phase}`}
              >
                {isDeToThai ? 'TH➔DE' : 'DE➔TH'}: P{otherDirProgress.phase}
              </span>
            </div>
          </div>

          {/* Center Text */}
          <div className="my-auto text-center py-2">
            {isDeToThai ? (
              <h2 className="text-2xl font-bold tracking-tight text-white px-2">
                {vocab.german}
              </h2>
            ) : (
              <div>
                <h2 className="text-3xl sm:text-4xl font-semibold tracking-normal text-white font-thai mb-1 py-1">
                  {vocab.thai}
                </h2>
                {!hideRomanization && vocab.romanization && (
                  <p className="text-sm text-[#FF7A00] font-medium">
                    {vocab.romanization}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Bottom subtle hint */}
          <div className="text-center text-[10px] text-[#8E8E93]/80">
            {isDeToThai
              ? isTyping ? 'Tippe die Thai-Übersetzung ein:' : 'Wie heißt das auf Thai?'
              : isTyping ? 'Tippe die deutsche Bedeutung ein:' : 'Wie heißt das auf Deutsch?'}
          </div>
        </div>

        {/* Bottom Half of Card matching IMG_6344.png */}
        <div className="relative bg-[#2C2C2E] rounded-3xl p-5 min-h-[220px] flex flex-col justify-between border border-[#3A3A3D] shadow-lg">
          {/* Card action controls header */}
          <div className="flex items-center justify-between text-xs text-[#8E8E93]">
            {/* Example sentence icon toggle */}
            <button
              onClick={() => setShowExample(!showExample)}
              className={`p-1.5 rounded-full transition-colors ${
                showExample ? 'bg-[#FF7A00] text-black' : 'hover:bg-[#3A3A3D] text-[#8E8E93]'
              }`}
              title="Beispielsatz anzeigen"
            >
              <MessageSquare className="w-4 h-4" />
            </button>

            {/* Menu controls / Umschrift toggle */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setHideRomanization(!hideRomanization)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                  hideRomanization
                    ? 'bg-[#FF7A00]/20 text-[#FF7A00] border border-[#FF7A00]/40'
                    : 'bg-[#3A3A3D] text-[#D1D1D6]'
                }`}
                title="Lautschrift/Umschrift verdecken um Thai-Schrift zu trainieren"
              >
                {hideRomanization ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Umschrift verdeckt</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Umschrift sichtbar</span>
                  </>
                )}
              </button>

              <button
                onClick={handlePlayAudio}
                className="p-1.5 rounded-full hover:bg-[#3A3A3D] text-[#8E8E93] hover:text-white transition-colors"
                title="Aussprache anhören"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Solution Area (shown when revealed or after typing evaluation) */}
          <div className="my-auto text-center py-1">
            {isRevealed ? (
              <div className="animate-in fade-in duration-200">
                {isDeToThai ? (
                  <div>
                    {/* Thai characters in Thonburi / Sarabun font */}
                    <h2 className="text-3xl sm:text-4xl font-semibold tracking-normal text-white font-thai mb-1 py-1">
                      {vocab.thai}
                    </h2>

                    {/* Romanization / Umschrift */}
                    {vocab.romanization && (
                      <div className="mt-1">
                        {!hideRomanization ? (
                          <p className="text-base text-[#FF7A00] font-medium tracking-wide">
                            {vocab.romanization}
                          </p>
                        ) : (
                          <button
                            onClick={() => setHideRomanization(false)}
                            className="text-xs text-[#8E8E93] bg-[#222224] px-3 py-1 rounded-full hover:text-white transition-colors"
                          >
                            [Umschrift ausgeblendet - tippen zum Zeigen]
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                      {vocab.german}
                    </h2>
                  </div>
                )}

                {/* Example sentence if toggled */}
                {showExample && (vocab.exampleThai || vocab.exampleGerman) && (
                  <div className="mt-2.5 p-2.5 bg-[#242426] rounded-2xl border border-[#3A3A3D] text-left text-xs space-y-1">
                    {vocab.exampleThai && (
                      <p className="text-white font-thai text-sm">{vocab.exampleThai}</p>
                    )}
                    {vocab.exampleGerman && (
                      <p className="text-[#8E8E93] italic">{vocab.exampleGerman}</p>
                    )}
                  </div>
                )}
              </div>
            ) : !isTyping ? (
              <button
                onClick={handleReveal}
                className="w-full py-6 rounded-2xl border-2 border-dashed border-[#444448] text-[#8E8E93] hover:text-white hover:border-[#FF7A00] transition-colors flex flex-col items-center justify-center gap-2"
              >
                <Sparkles className="w-5 h-5 text-[#FF7A00]" />
                <span className="text-sm font-semibold text-[#D1D1D6]">
                  Lösung anzeigen
                </span>
                <span className="text-[11px] text-[#71717A]">
                  Tippe hier oder auf die Leertaste
                </span>
              </button>
            ) : null}
          </div>

          {/* Typing Input Box matching IMG_6344.png */}
          {isTyping && (
            <div className="mt-2 space-y-2">
              <div
                className={`relative rounded-2xl bg-[#1C1C1E] border transition-colors flex items-center overflow-hidden px-4 py-3 ${
                  isEvaluated
                    ? isTypingCorrect
                      ? 'border-emerald-500/80 shadow-md shadow-emerald-500/10'
                      : 'border-[#FF7A00] shadow-md shadow-orange-500/10'
                    : 'border-[#3A3A3D] focus-within:border-[#FF7A00]'
                }`}
              >
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
                  disabled={isEvaluated}
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
                  className="w-full bg-transparent text-white text-base focus:outline-none placeholder-[#71717A] font-thai"
                />

                {/* Status Icon matching IMG_6344.png */}
                {isEvaluated && (
                  <div className="shrink-0 ml-2">
                    {isTypingCorrect ? (
                      <span className="text-xl" title="Richtig!">😊</span>
                    ) : (
                      <span className="text-2xl text-[#FF7A00]" title="Abweichung">☹️</span>
                    )}
                  </div>
                )}
              </div>

              {/* Thai Tone Marks Helper Row (when typing Thai script) */}
              {!isEvaluated && isDeToThai && (
                <div className="flex items-center justify-center gap-1.5 pt-1 overflow-x-auto">
                  <span className="text-[10px] text-[#71717A] mr-1">Tonzeichen:</span>
                  {['่', '้', '๊', '๋', '์', '็'].map((char) => (
                    <button
                      key={char}
                      type="button"
                      onClick={() => handleInsertThaiChar(char)}
                      className="w-7 h-7 bg-[#242426] hover:bg-[#323236] border border-[#3A3A3D] rounded-lg text-sm font-thai text-white flex items-center justify-center active:scale-95"
                    >
                      {char}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sticky Action Buttons matching IMG_6344.png */}
      <div className="max-w-md w-full mx-auto pt-2 pb-2">
        {/* CASE 1: Typing mode, not yet submitted */}
        {isTyping && !isEvaluated && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleReveal}
              className="py-4 rounded-full bg-[#242426] border border-[#3A3A3D] text-white font-semibold text-sm hover:bg-[#2C2C2E] transition-colors active:scale-[0.99]"
            >
              Lösung anzeigen
            </button>
            <button
              onClick={handleCheckTyping}
              disabled={!userInput.trim()}
              className="py-4 rounded-full bg-[#FF7A00] text-black font-semibold text-sm hover:bg-[#FF881A] transition-colors shadow-lg active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span>Antwort prüfen</span>
              <ArrowRight className="w-4 h-4 text-black" />
            </button>
          </div>
        )}

        {/* CASE 2: Typing mode, evaluated */}
        {isTyping && isEvaluated && (
          <div className="grid grid-cols-2 gap-3">
            {/* Roter Pfeil: Nicht gewusst / Wiederholen */}
            <button
              onClick={() => handleRate(false)}
              disabled={isSubmitting}
              className="py-4 rounded-full bg-[#242426] border border-rose-500/40 text-rose-400 font-semibold text-sm hover:bg-[#2C2C2E] hover:border-rose-500 transition-colors active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4 text-rose-400 stroke-[2.5]" />
              <span>Nicht gewusst</span>
            </button>

            {/* Grüner Pfeil: Gelten lassen / Gewusst */}
            <button
              onClick={() => handleRate(true)}
              disabled={isSubmitting}
              className="py-4 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-semibold text-sm hover:bg-emerald-500/25 transition-colors shadow-lg active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <span>{isTypingCorrect ? 'Gewusst' : 'Gelten lassen'}</span>
              <ArrowRight className="w-4 h-4 text-emerald-400 stroke-[2.5]" />
            </button>
          </div>
        )}

        {/* CASE 3: Flashcard mode / Thai -> Deutsch (Lösung anzeigen -> roter/grüner Pfeil) */}
        {!isTyping && !isRevealed && (
          <button
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
              onClick={() => handleRate(false)}
              disabled={isSubmitting}
              className="py-4 rounded-full bg-[#242426] border border-rose-500/40 text-rose-400 font-semibold text-sm hover:bg-[#2C2C2E] hover:border-rose-500 transition-colors active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4 text-rose-400 stroke-[2.5]" />
              <span>Nicht gewusst</span>
            </button>

            {/* Grüner Pfeil: Gelten lassen / Gewusst */}
            <button
              onClick={() => handleRate(true)}
              disabled={isSubmitting}
              className="py-4 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-semibold text-sm hover:bg-emerald-500/25 transition-colors shadow-lg active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <span>Gelten lassen</span>
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
