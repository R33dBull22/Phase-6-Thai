import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Plus,
  Check,
  Volume2,
  FolderPlus,
  BookOpen,
  Filter,
  Pencil,
  Trash2,
  FolderInput,
  FolderEdit,
  X,
  AlertTriangle,
  RotateCcw,
  ArrowDownCircle,
} from 'lucide-react';
import { Vocabulary, UserProgress } from '../types/vocab';
import { speakThai } from '../utils/thaiAudio';
import { PHASES, formatDueDate, isCardDue } from '../utils/leitner';
import { EditVocabModal } from './EditVocabModal';

interface PoolViewProps {
  vocabularies: Vocabulary[];
  progressMap: Record<string, UserProgress>;
  onSelectForStudy: (selectedVocabs: { vocab: Vocabulary; progress?: UserProgress }[]) => void;
  onAddBatchToDeck: (vocabIds: string[]) => Promise<void>;
  onNavigateCreate: () => void;
  onUpdateVocab?: (id: string, updatedData: Partial<Omit<Vocabulary, 'id' | 'createdAt'>>) => Promise<void>;
  onDeleteVocab?: (id: string) => Promise<void>;
  onRenameLesson?: (oldName: string, newName: string) => Promise<void>;
  onDeleteLesson?: (lessonName: string, deleteVocabs: boolean, moveToLesson?: string) => Promise<void>;
  onMoveVocabs?: (vocabIds: string[], targetLesson: string) => Promise<void>;
  onStepBackLesson?: (lessonName: string) => Promise<number>;
  onResetVocabsPhase?: (vocabIds: string[]) => Promise<number>;
  onUpdateSinglePhase?: (vocabId: string, newPhase: number) => Promise<void>;
  existingLessons?: string[];
}

export const PoolView: React.FC<PoolViewProps> = ({
  vocabularies,
  progressMap,
  onSelectForStudy,
  onAddBatchToDeck,
  onNavigateCreate,
  onUpdateVocab,
  onDeleteVocab,
  onRenameLesson,
  onDeleteLesson,
  onMoveVocabs,
  onStepBackLesson,
  onResetVocabsPhase,
  onUpdateSinglePhase,
  existingLessons = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedLessons, setExpandedLessons] = useState<Record<string, boolean>>({});
  const [filterMode, setFilterMode] = useState<'all' | 'in_deck' | 'not_in_deck' | 'due'>('all');
  const [isAddingToDeck, setIsAddingToDeck] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingVocab, setEditingVocab] = useState<Vocabulary | null>(null);

  // Due vocabs count
  const dueVocabsCount = useMemo(() => {
    return vocabularies.filter((v) => {
      const prog = progressMap[v.id];
      return prog && isCardDue(prog.nextReviewDate);
    }).length;
  }, [vocabularies, progressMap]);

  // Phase manipulation states
  const [stepBackConfirmLesson, setStepBackConfirmLesson] = useState<string | null>(null);
  const [isSteppingBack, setIsSteppingBack] = useState(false);
  const [showResetSelectedConfirm, setShowResetSelectedConfirm] = useState(false);
  const [isResettingSelected, setIsResettingSelected] = useState(false);

  // Lesson rename state
  const [renamingLesson, setRenamingLesson] = useState<string | null>(null);
  const [newLessonNameInput, setNewLessonNameInput] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Lesson delete state
  const [deletingLesson, setDeletingLesson] = useState<string | null>(null);
  const [deleteOption, setDeleteOption] = useState<'delete_cards' | 'move_to_general'>('delete_cards');
  const [isDeletingLesson, setIsDeletingLesson] = useState(false);

  // Move vocabularies state
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [targetMoveLesson, setTargetMoveLesson] = useState('');
  const [customTargetMoveLesson, setCustomTargetMoveLesson] = useState('');
  const [isMovingVocabs, setIsMovingVocabs] = useState(false);

  // Group by lessons
  const groupedByLesson = useMemo(() => {
    const map: Record<string, Vocabulary[]> = {};
    vocabularies.forEach((v) => {
      // Apply search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchGerman = v.german.toLowerCase().includes(q);
        const matchThai = v.thai.toLowerCase().includes(q);
        const matchRom = (v.romanization || '').toLowerCase().includes(q);
        const matchLesson = v.lesson.toLowerCase().includes(q);
        if (!matchGerman && !matchThai && !matchRom && !matchLesson) {
          return;
        }
      }

      // Apply deck filter
      const inDeck = Boolean(progressMap[v.id]);
      if (filterMode === 'in_deck' && !inDeck) return;
      if (filterMode === 'not_in_deck' && inDeck) return;
      if (filterMode === 'due' && (!inDeck || !isCardDue(progressMap[v.id]?.nextReviewDate))) return;

      const lessonName = v.lesson || 'Allgemein';
      if (!map[lessonName]) map[lessonName] = [];
      map[lessonName].push(v);
    });
    return map;
  }, [vocabularies, searchQuery, filterMode, progressMap]);

  const allLessonsList = useMemo(() => {
    const set = new Set<string>();
    vocabularies.forEach((v) => {
      if (v.lesson) set.add(v.lesson);
    });
    return Array.from(set);
  }, [vocabularies]);

  const toggleSelectCard = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectLesson = (lessonVocabs: Vocabulary[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = lessonVocabs.every((v) => next.has(v.id));
      if (allSelected) {
        lessonVocabs.forEach((v) => next.delete(v.id));
      } else {
        lessonVocabs.forEach((v) => next.add(v.id));
      }
      return next;
    });
  };

  const toggleExpand = (lesson: string) => {
    setExpandedLessons((prev) => ({
      ...prev,
      [lesson]: prev[lesson] !== undefined ? !prev[lesson] : false, // default opened
    }));
  };

  const isLessonExpanded = (lesson: string) => {
    return expandedLessons[lesson] !== false; // open by default
  };

  // Handle start study with selected cards
  const handleStartStudySelected = () => {
    const list = vocabularies
      .filter((v) => selectedIds.has(v.id))
      .map((v) => ({ vocab: v, progress: progressMap[v.id] }));
    if (list.length > 0) {
      onSelectForStudy(list);
    }
  };

  // Handle batch adding to personal deck
  const handleAddSelectedToDeck = async () => {
    const idsToAdd = Array.from(selectedIds).filter((id) => !progressMap[id]);
    if (!idsToAdd.length) return;
    setIsAddingToDeck(true);
    try {
      await onAddBatchToDeck(idsToAdd);
      setSelectedIds(new Set());
      setToastMessage(
        `✓ ${idsToAdd.length} ${
          idsToAdd.length === 1 ? 'Vokabel' : 'Vokabeln'
        } erfolgreich zur Abfrage hinzugefügt! Die Karten sind jetzt in Phase 1 gespeichert.`
      );
      setTimeout(() => setToastMessage(null), 5000);
    } finally {
      setIsAddingToDeck(false);
    }
  };

  // Handle Rename Lesson
  const handleConfirmRenameLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingLesson || !newLessonNameInput.trim()) return;
    if (!onRenameLesson) return;

    setIsRenaming(true);
    try {
      await onRenameLesson(renamingLesson, newLessonNameInput.trim());
      setToastMessage(`✓ Lektion „${renamingLesson}“ umbenannt in „${newLessonNameInput.trim()}“!`);
      setRenamingLesson(null);
      setNewLessonNameInput('');
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setToastMessage(`Fehler beim Umbenennen: ${err.message || 'Unbekannt'}`);
    } finally {
      setIsRenaming(false);
    }
  };

  // Handle Delete Lesson
  const handleConfirmDeleteLesson = async () => {
    if (!deletingLesson) return;
    if (!onDeleteLesson) return;

    setIsDeletingLesson(true);
    try {
      await onDeleteLesson(
        deletingLesson,
        deleteOption === 'delete_cards',
        deleteOption === 'move_to_general' ? 'Allgemein' : undefined
      );
      setToastMessage(`✓ Lektion „${deletingLesson}“ erfolgreich gelöscht!`);
      setDeletingLesson(null);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setToastMessage(`Fehler beim Löschen: ${err.message || 'Unbekannt'}`);
    } finally {
      setIsDeletingLesson(false);
    }
  };

  // Handle Move Vocabularies
  const handleConfirmMoveVocabs = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTarget =
      targetMoveLesson === '__new__' ? customTargetMoveLesson.trim() : targetMoveLesson.trim();

    if (!finalTarget) return;
    if (!onMoveVocabs) return;

    const ids = Array.from(selectedIds);
    if (!ids.length) return;

    setIsMovingVocabs(true);
    try {
      await onMoveVocabs(ids, finalTarget);
      setToastMessage(`✓ ${ids.length} Vokabeln nach „${finalTarget}“ verschoben!`);
      setSelectedIds(new Set());
      setMoveModalOpen(false);
      setTargetMoveLesson('');
      setCustomTargetMoveLesson('');
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setToastMessage(`Fehler beim Verschieben: ${err.message || 'Unbekannt'}`);
    } finally {
      setIsMovingVocabs(false);
    }
  };

  // Handle Step Back All Cards in Lesson
  const handleConfirmStepBackLesson = async () => {
    if (!stepBackConfirmLesson || !onStepBackLesson) return;
    setIsSteppingBack(true);
    try {
      const count = await onStepBackLesson(stepBackConfirmLesson);
      setToastMessage(
        `✓ ${count} Vokabeln der Lektion „${stepBackConfirmLesson}“ um eine Phase zurückgestellt!`
      );
      setStepBackConfirmLesson(null);
      setTimeout(() => setToastMessage(null), 4500);
    } catch (err: any) {
      setToastMessage(`Fehler: ${err.message || 'Konnte Phase nicht zurückstellen'}`);
    } finally {
      setIsSteppingBack(false);
    }
  };

  // Handle Reset Selected Cards to Phase 1 (von Anfang an lernen)
  const handleConfirmResetSelected = async () => {
    if (!selectedIds.size || !onResetVocabsPhase) return;
    setIsResettingSelected(true);
    try {
      const ids = Array.from(selectedIds);
      const count = await onResetVocabsPhase(ids);
      setToastMessage(
        `✓ ${count} ausgewählte Vokabeln werden jetzt von Anfang an gelernt (in Phase 1 zurückgesetzt)!`
      );
      setSelectedIds(new Set());
      setShowResetSelectedConfirm(false);
      setTimeout(() => setToastMessage(null), 4500);
    } catch (err: any) {
      setToastMessage(`Fehler: ${err.message || 'Konnte Vokabeln nicht zurücksetzen'}`);
    } finally {
      setIsResettingSelected(false);
    }
  };

  const selectedCount = selectedIds.size;
  const selectedNotInDeck = Array.from(selectedIds).filter((id) => !progressMap[id]).length;

  return (
    <div className="max-w-md mx-auto px-4 pt-3 pb-40 text-white">
      {/* Top Header matching IMG_6341.png */}
      <div className="flex items-center justify-between py-2 mb-3">
        <h1 className="text-xl font-bold tracking-tight text-white">
          Kärtchen auswählen
        </h1>
        <span className="text-xs text-[#8E8E93] bg-[#242426] px-2.5 py-1 rounded-full border border-[#323236]">
          {vocabularies.length} Vokabeln
        </span>
      </div>

      {/* Success Confirmation Toast */}
      {toastMessage && (
        <div className="mb-4 p-3 bg-[#242426] border border-emerald-500/50 rounded-2xl text-xs text-emerald-300 flex items-center justify-between gap-2 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-[#8E8E93] hover:text-white text-xs px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Pill Search Bar matching IMG_6341.png */}
      <div className="relative mb-4">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8E8E93]">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Suche Vokabeln (Deutsch, Thai, Lautschrift)..."
          className="w-full pl-10 pr-4 py-3 bg-[#242426] rounded-full text-sm text-white placeholder-[#8E8E93] border border-[#323236] focus:outline-none focus:border-[#FF7A00] transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs text-[#8E8E93] hover:text-white cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {/* Quick Filter chips */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilterMode('all')}
          className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
            filterMode === 'all'
              ? 'bg-[#FF7A00] text-black font-semibold'
              : 'bg-[#242426] text-[#8E8E93] border border-[#323236]'
          }`}
        >
          Alle ({vocabularies.length})
        </button>
        <button
          onClick={() => setFilterMode('in_deck')}
          className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
            filterMode === 'in_deck'
              ? 'bg-[#FF7A00] text-black font-semibold'
              : 'bg-[#242426] text-[#8E8E93] border border-[#323236]'
          }`}
        >
          In meinem Deck ({Object.keys(progressMap).length})
        </button>
        <button
          onClick={() => setFilterMode('not_in_deck')}
          className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
            filterMode === 'not_in_deck'
              ? 'bg-[#FF7A00] text-black font-semibold'
              : 'bg-[#242426] text-[#8E8E93] border border-[#323236]'
          }`}
        >
          Noch nicht gelernt ({Math.max(0, vocabularies.length - Object.keys(progressMap).length)})
        </button>
        <button
          onClick={() => setFilterMode('due')}
          className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
            filterMode === 'due'
              ? 'bg-amber-500 text-black font-semibold'
              : 'bg-[#242426] text-amber-400 border border-amber-500/30'
          }`}
        >
          <span>⚡ Fällig zur Abfrage</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
            filterMode === 'due' ? 'bg-black text-amber-400' : 'bg-amber-500/20 text-amber-300'
          }`}>
            {dueVocabsCount}
          </span>
        </button>
      </div>

      {/* Course Header Banner */}
      <div className="bg-[#242426] rounded-2xl p-3 flex items-center gap-3 border border-[#323236] mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 border border-[#444448] flex items-center justify-center text-lg">
          🇹🇭
        </div>
        <div>
          <span className="text-sm font-bold text-white tracking-tight">Thai Grund- & Aufbauwortschatz</span>
          <p className="text-[11px] text-[#8E8E93]">Gemeinsamer Wortschatz • Lektionen bearbeiten & verschieben</p>
        </div>
      </div>

      {/* Accordion List */}
      <div className="space-y-3">
        {Object.keys(groupedByLesson).length === 0 ? (
          <div className="text-center py-12 bg-[#1C1C1E] rounded-3xl border border-[#2C2C2E] p-6">
            <BookOpen className="w-10 h-10 text-[#71717A] mx-auto mb-3" />
            <p className="text-sm font-medium text-white">Keine Vokabeln gefunden</p>
            <p className="text-xs text-[#8E8E93] mt-1 mb-4">
              Passe deine Suche an oder erstelle neue Vokabelkarten.
            </p>
            <button
              onClick={onNavigateCreate}
              className="px-4 py-2 bg-[#FF7A00] text-black rounded-full font-semibold text-xs hover:bg-[#FF881A] cursor-pointer"
            >
              + Neue Vokabel anlegen
            </button>
          </div>
        ) : (
          Object.entries(groupedByLesson).map(([lesson, items]) => {
            const isExpanded = isLessonExpanded(lesson);
            const selectedInLesson = items.filter((v) => selectedIds.has(v.id)).length;
            const allInLessonSelected = items.length > 0 && selectedInLesson === items.length;

            return (
              <div
                key={lesson}
                className="bg-[#242426] rounded-2xl border border-[#323236] overflow-hidden transition-all"
              >
                {/* Accordion Header */}
                <div className="p-3.5 flex items-center justify-between border-b border-[#323236]/60">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Checkbox for entire lesson */}
                    <button
                      type="button"
                      onClick={() => toggleSelectLesson(items)}
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        allInLessonSelected
                          ? 'bg-[#FF7A00] border-[#FF7A00]'
                          : selectedInLesson > 0
                          ? 'bg-[#FF7A00]/20 border-[#FF7A00]'
                          : 'border-[#52525B] bg-[#1C1C1E]'
                      }`}
                    >
                      {allInLessonSelected && <Check className="w-3.5 h-3.5 text-black stroke-[3]" />}
                      {!allInLessonSelected && selectedInLesson > 0 && (
                        <div className="w-2 h-2 rounded-xs bg-[#FF7A00]" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleExpand(lesson)}
                      className="flex items-center justify-between flex-1 text-left min-w-0 pr-1 cursor-pointer"
                    >
                      <span className="text-sm font-semibold text-white truncate">
                        {lesson}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {/* Step Back Phase button for lesson */}
                    {onStepBackLesson && (
                      <button
                        type="button"
                        onClick={() => setStepBackConfirmLesson(lesson)}
                        className="p-1 rounded-md text-[#8E8E93] hover:text-amber-400 hover:bg-[#1C1C1E] transition-colors cursor-pointer"
                        title="Alle Vokabeln dieser Lektion um eine Phase zurückschieben"
                      >
                        <ArrowDownCircle className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Rename Lesson button */}
                    {onRenameLesson && (
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingLesson(lesson);
                          setNewLessonNameInput(lesson);
                        }}
                        className="p-1 rounded-md text-[#8E8E93] hover:text-[#FF7A00] hover:bg-[#1C1C1E] transition-colors cursor-pointer"
                        title="Lektion umbenennen"
                      >
                        <FolderEdit className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Delete Lesson button */}
                    {onDeleteLesson && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeletingLesson(lesson);
                          setDeleteOption('delete_cards');
                        }}
                        className="p-1 rounded-md text-[#8E8E93] hover:text-rose-400 hover:bg-[#1C1C1E] transition-colors cursor-pointer"
                        title="Lektion löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <span className="text-xs font-semibold text-[#FF7A00] px-1">
                      {selectedInLesson} / {items.length}
                    </span>

                    <button
                      type="button"
                      onClick={() => toggleExpand(lesson)}
                      className="p-1 text-[#8E8E93] hover:text-white cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[#8E8E93]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#8E8E93]" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Items in Lesson */}
                {isExpanded && (
                  <div className="divide-y divide-[#323236]/50">
                    {items.map((vocab) => {
                      const isSelected = selectedIds.has(vocab.id);
                      const prog = progressMap[vocab.id];
                      const inDeck = Boolean(prog);

                      return (
                        <div
                          key={vocab.id}
                          className={`p-3.5 flex items-center gap-3.5 hover:bg-[#2C2C2E] transition-colors cursor-pointer ${
                            isSelected ? 'bg-[#2A2A2E]' : ''
                          }`}
                          onClick={() => toggleSelectCard(vocab.id)}
                        >
                          {/* Square rounded checkbox matching IMG_6341.png */}
                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-[#FF7A00] border-[#FF7A00]'
                                : 'border-[#52525B] bg-[#1C1C1E]'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 text-black stroke-[3]" />}
                          </div>

                          {/* 2-Line Text Content matching IMG_6341.png */}
                          <div className="flex-1 min-w-0">
                            {/* Line 1: German / Meaning */}
                            <p className="text-sm font-medium text-white truncate">
                              {vocab.german}
                            </p>

                            {/* Line 2: Thai + Romanization */}
                            <p className="text-xs text-[#A1A1AA] mt-0.5 truncate flex items-center gap-1.5 font-thai">
                              <span className="text-[#E4E4E7] font-medium">{vocab.thai}</span>
                              {vocab.romanization && (
                                <span className="text-[#FF7A00] font-sans">
                                  {vocab.romanization}
                                </span>
                              )}
                            </p>
                          </div>

                          {/* Right Status / Actions */}
                          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {/* Edit button */}
                            <button
                              type="button"
                              onClick={() => setEditingVocab(vocab)}
                              className="p-1 rounded-full text-[#71717A] hover:text-[#FF7A00] transition-colors cursor-pointer"
                              title="Vokabel bearbeiten / Lektion ändern"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            {/* Audio pronunciation icon */}
                            <button
                              type="button"
                              onClick={() => speakThai(vocab.thai)}
                              className="p-1 rounded-full text-[#71717A] hover:text-white transition-colors cursor-pointer"
                              title="Aussprache anhören"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Phase pill if in deck */}
                            {inDeck ? (
                              <div className="flex flex-col items-end">
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${
                                    PHASES[prog.phase]?.badgeBg || 'bg-gray-600'
                                  }`}
                                >
                                  P{prog.phase}
                                </span>
                                {(() => {
                                  const dueInfo = formatDueDate(prog.nextReviewDate);
                                  return (
                                    <span
                                      className={`text-[9px] mt-0.5 font-medium whitespace-nowrap ${
                                        dueInfo.isDue
                                          ? 'text-amber-400 font-semibold'
                                          : 'text-[#8E8E93]'
                                      }`}
                                      title={`Nächste Abfrage: ${dueInfo.dateFormatted}`}
                                    >
                                      {dueInfo.label}
                                    </span>
                                  );
                                })()}
                              </div>
                            ) : (
                              <span className="text-[10px] bg-[#323236] text-[#8E8E93] px-1.5 py-0.5 rounded">
                                Neu
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Rename Lesson Modal */}
      {renamingLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-3xl w-full max-w-sm p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#2C2C2E] mb-4">
              <div className="flex items-center gap-2">
                <FolderEdit className="w-5 h-5 text-[#FF7A00]" />
                <h3 className="text-base font-bold text-white">Lektion umbenennen</h3>
              </div>
              <button
                onClick={() => setRenamingLesson(null)}
                className="w-7 h-7 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#8E8E93] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmRenameLesson} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#8E8E93] mb-1">
                  Neuer Name für „{renamingLesson}“
                </label>
                <input
                  type="text"
                  value={newLessonNameInput}
                  onChange={(e) => setNewLessonNameInput(e.target.value)}
                  placeholder="z.B. Familie & Freunde"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-[#242426] border border-[#3A3A3D] rounded-xl text-sm text-white focus:outline-none focus:border-[#FF7A00]"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRenamingLesson(null)}
                  className="flex-1 py-2.5 rounded-full bg-[#2C2C2E] text-white text-xs font-semibold hover:bg-[#3A3A3D] cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isRenaming || !newLessonNameInput.trim()}
                  className="flex-1 py-2.5 rounded-full bg-[#FF7A00] text-black text-xs font-semibold hover:bg-[#FF881A] cursor-pointer disabled:opacity-50"
                >
                  {isRenaming ? 'Wird gespeichert...' : 'Umbenennen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Lesson Modal */}
      {deletingLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#1C1C1E] border border-rose-500/30 rounded-3xl w-full max-w-sm p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#2C2C2E] mb-4">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-white">Lektion löschen</h3>
              </div>
              <button
                onClick={() => setDeletingLesson(null)}
                className="w-7 h-7 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#8E8E93] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#D1D1D6] mb-4 leading-relaxed">
              Möchtest du die Lektion <span className="text-white font-bold">„{deletingLesson}“</span> wirklich entfernen?
            </p>

            <div className="space-y-2 mb-5 text-xs">
              <label
                onClick={() => setDeleteOption('delete_cards')}
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                  deleteOption === 'delete_cards'
                    ? 'border-rose-500/60 bg-rose-500/10 text-white'
                    : 'border-[#323236] bg-[#242426] text-[#8E8E93]'
                }`}
              >
                <input
                  type="radio"
                  name="delOption"
                  checked={deleteOption === 'delete_cards'}
                  onChange={() => setDeleteOption('delete_cards')}
                  className="mt-0.5 text-rose-500"
                />
                <div>
                  <p className="font-semibold text-rose-300">Alle Vokabeln dieser Lektion löschen</p>
                  <p className="text-[11px] text-[#A1A1AA] mt-0.5">
                    Die Karten werden komplett aus der App entfernt.
                  </p>
                </div>
              </label>

              <label
                onClick={() => setDeleteOption('move_to_general')}
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                  deleteOption === 'move_to_general'
                    ? 'border-[#FF7A00]/60 bg-[#FF7A00]/10 text-white'
                    : 'border-[#323236] bg-[#242426] text-[#8E8E93]'
                }`}
              >
                <input
                  type="radio"
                  name="delOption"
                  checked={deleteOption === 'move_to_general'}
                  onChange={() => setDeleteOption('move_to_general')}
                  className="mt-0.5 text-[#FF7A00]"
                />
                <div>
                  <p className="font-semibold text-[#FF7A00]">Vokabeln in „Allgemein“ verschieben</p>
                  <p className="text-[11px] text-[#A1A1AA] mt-0.5">
                    Nur die Lektion wird gelöscht, die Vokabeln bleiben erhalten.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeletingLesson(null)}
                className="flex-1 py-2.5 rounded-full bg-[#2C2C2E] text-white text-xs font-semibold hover:bg-[#3A3A3D] cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteLesson}
                disabled={isDeletingLesson}
                className="flex-1 py-2.5 rounded-full bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 cursor-pointer disabled:opacity-50"
              >
                {isDeletingLesson ? 'Löschen...' : 'Löschen bestätigen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Selected Vocabs Modal */}
      {moveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-3xl w-full max-w-sm p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#2C2C2E] mb-4">
              <div className="flex items-center gap-2">
                <FolderInput className="w-5 h-5 text-[#FF7A00]" />
                <h3 className="text-base font-bold text-white">Vokabeln verschieben</h3>
              </div>
              <button
                onClick={() => setMoveModalOpen(false)}
                className="w-7 h-7 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#8E8E93] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmMoveVocabs} className="space-y-4">
              <p className="text-xs text-[#8E8E93]">
                Verschiebe die <span className="text-[#FF7A00] font-semibold">{selectedIds.size}</span> ausgewählten Vokabeln in eine Lektion:
              </p>

              <div>
                <label className="block text-xs font-semibold text-[#8E8E93] mb-1">
                  Ziel-Lektion auswählen
                </label>
                <select
                  value={targetMoveLesson}
                  onChange={(e) => setTargetMoveLesson(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#242426] border border-[#3A3A3D] rounded-xl text-xs text-white focus:outline-none focus:border-[#FF7A00]"
                >
                  <option value="">-- Lektion wählen --</option>
                  {allLessonsList.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                  <option value="__new__">+ Neue Lektion anlegen...</option>
                </select>
              </div>

              {targetMoveLesson === '__new__' && (
                <div>
                  <label className="block text-xs font-medium text-[#8E8E93] mb-1">
                    Name der neuen Lektion
                  </label>
                  <input
                    type="text"
                    value={customTargetMoveLesson}
                    onChange={(e) => setCustomTargetMoveLesson(e.target.value)}
                    placeholder="z.B. Restaurant & Bestellen"
                    required
                    autoFocus
                    className="w-full px-3.5 py-2.5 bg-[#242426] border border-[#3A3A3D] rounded-xl text-xs text-white focus:outline-none focus:border-[#FF7A00]"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMoveModalOpen(false)}
                  className="flex-1 py-2.5 rounded-full bg-[#2C2C2E] text-white text-xs font-semibold hover:bg-[#3A3A3D] cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={
                    isMovingVocabs ||
                    !targetMoveLesson ||
                    (targetMoveLesson === '__new__' && !customTargetMoveLesson.trim())
                  }
                  className="flex-1 py-2.5 rounded-full bg-[#FF7A00] text-black text-xs font-semibold hover:bg-[#FF881A] cursor-pointer disabled:opacity-50"
                >
                  {isMovingVocabs ? 'Verschieben...' : 'Verschieben'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Vocab Modal */}
      {editingVocab && (
        <EditVocabModal
          vocab={editingVocab}
          currentPhase={progressMap[editingVocab.id]?.phase || 1}
          isOpen={Boolean(editingVocab)}
          onClose={() => setEditingVocab(null)}
          onSave={async (id, data) => {
            if (onUpdateVocab) {
              await onUpdateVocab(id, data);
              setToastMessage('✓ Vokabel erfolgreich aktualisiert!');
              setTimeout(() => setToastMessage(null), 3500);
            }
          }}
          onDelete={
            onDeleteVocab
              ? async (id) => {
                  await onDeleteVocab(id);
                  setToastMessage('✓ Vokabel gelöscht.');
                  setTimeout(() => setToastMessage(null), 3500);
                }
              : undefined
          }
          onUpdatePhase={onUpdateSinglePhase}
          existingLessons={
            existingLessons.length > 0
              ? existingLessons
              : Object.keys(groupedByLesson)
          }
        />
      )}

      {/* Modal: Lektion um eine Phase zurückstellen */}
      {stepBackConfirmLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#1C1C1E] border border-amber-500/40 rounded-3xl w-full max-w-sm p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#2C2C2E] mb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <ArrowDownCircle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-white">Lektion zurückstellen</h3>
              </div>
              <button
                onClick={() => setStepBackConfirmLesson(null)}
                className="w-7 h-7 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#8E8E93] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#D1D1D6] mb-3 leading-relaxed">
              Möchtest du alle Vokabeln der Lektion <strong className="text-white">„{stepBackConfirmLesson}“</strong> um eine Phase zurückschieben?
            </p>

            <div className="bg-[#242426] p-3 rounded-xl border border-[#323236] text-[11px] text-[#A1A1AA] mb-4 space-y-1">
              <p>• Vokabeln in Phase 2–6 fallen jeweils um eine Stufe zurück (z. B. Phase 3 &rarr; 2).</p>
              <p>• Vokabeln in Phase 1 bleiben in Phase 1 und sind sofort wieder fällig.</p>
              <p>• Noch nicht gelernte Karten werden in Phase 1 aufgenommen.</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStepBackConfirmLesson(null)}
                className="flex-1 py-2.5 rounded-full bg-[#2C2C2E] text-white text-xs font-semibold hover:bg-[#3A3A3D] cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleConfirmStepBackLesson}
                disabled={isSteppingBack}
                className="flex-1 py-2.5 rounded-full bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 cursor-pointer disabled:opacity-50"
              >
                {isSteppingBack ? 'Zurückstellen...' : '1 Phase zurück'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ausgewählte Vokabeln von Anfang an lernen (Phase 1) */}
      {showResetSelectedConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#1C1C1E] border border-[#FF7A00]/40 rounded-3xl w-full max-w-sm p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#2C2C2E] mb-3">
              <div className="flex items-center gap-2 text-[#FF7A00]">
                <RotateCcw className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-white">Von Anfang an lernen</h3>
              </div>
              <button
                onClick={() => setShowResetSelectedConfirm(false)}
                className="w-7 h-7 rounded-full bg-[#2C2C2E] flex items-center justify-center text-[#8E8E93] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#D1D1D6] mb-3 leading-relaxed">
              Möchtest du die <strong className="text-[#FF7A00]">{selectedCount}</strong> ausgewählten {selectedCount === 1 ? 'Vokabel' : 'Vokabeln'} komplett von vorne lernen?
            </p>

            <div className="bg-[#242426] p-3 rounded-xl border border-[#323236] text-[11px] text-[#A1A1AA] mb-4 space-y-1">
              <p>• Alle markierten Vokabeln werden auf <strong className="text-white">Phase 1</strong> gesetzt.</p>
              <p>• Die Karten stehen ab sofort direkt zur Wiederholung bereit.</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowResetSelectedConfirm(false)}
                className="flex-1 py-2.5 rounded-full bg-[#2C2C2E] text-white text-xs font-semibold hover:bg-[#3A3A3D] cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleConfirmResetSelected}
                disabled={isResettingSelected}
                className="flex-1 py-2.5 rounded-full bg-[#FF7A00] text-black text-xs font-bold hover:bg-[#FF881A] cursor-pointer disabled:opacity-50"
              >
                {isResettingSelected ? 'Zurücksetzen...' : 'Auf Phase 1 setzen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Bottom Actions */}
      <div className="fixed bottom-16 left-0 right-0 z-30 bg-[#121214]/95 backdrop-blur-md border-t border-[#2C2C2E] p-3 px-4">
        <div className="max-w-md mx-auto space-y-2">
          {/* Outlined button: + Vokabeln eingeben */}
          <button
            onClick={onNavigateCreate}
            className="w-full py-2.5 rounded-full bg-[#1C1C1E] border border-[#3A3A3D] text-white font-semibold text-xs hover:bg-[#242426] transition-colors flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#FF7A00]" />
            <span>+ Vokabeln eingeben</span>
          </button>

          {/* Action Row for Selected Vocabs: Move + Von Anfang an lernen */}
          {selectedCount > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {/* Von Anfang an lernen Button */}
              {onResetVocabsPhase && (
                <button
                  type="button"
                  onClick={() => setShowResetSelectedConfirm(true)}
                  className="py-2.5 px-3 rounded-full bg-[#242426] border border-amber-500/50 text-amber-300 font-semibold text-xs hover:bg-[#2C2C2E] transition-colors active:scale-[0.99] flex items-center justify-center gap-1.5 cursor-pointer shadow"
                  title="Ausgewählte Vokabeln auf Phase 1 zurücksetzen"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span className="truncate">Von Anfang an ({selectedCount})</span>
                </button>
              )}

              {/* Move to another lesson Button */}
              {onMoveVocabs && (
                <button
                  type="button"
                  onClick={() => {
                    setTargetMoveLesson('');
                    setCustomTargetMoveLesson('');
                    setMoveModalOpen(true);
                  }}
                  className="py-2.5 px-3 rounded-full bg-[#242426] border border-[#FF7A00]/50 text-[#FF7A00] font-semibold text-xs hover:bg-[#2C2C2E] transition-colors active:scale-[0.99] flex items-center justify-center gap-1.5 cursor-pointer shadow"
                  title="Vokabeln in andere Lektion verschieben"
                >
                  <FolderInput className="w-3.5 h-3.5" />
                  <span className="truncate">Verschieben ({selectedCount})</span>
                </button>
              )}
            </div>
          )}

          {/* If cards not in deck are selected, show add option, or directly study */}
          {selectedNotInDeck > 0 ? (
            <button
              onClick={handleAddSelectedToDeck}
              disabled={isAddingToDeck}
              className="w-full py-3.5 rounded-full bg-[#FF7A00] text-black font-semibold text-sm hover:bg-[#FF881A] transition-colors shadow-lg active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
            >
              <FolderPlus className="w-4 h-4 text-black" />
              <span>{selectedNotInDeck} zur Abfrage hinzufügen</span>
            </button>
          ) : (
            <button
              onClick={handleStartStudySelected}
              disabled={selectedCount === 0}
              className="w-full py-3.5 rounded-full bg-[#FF7A00] text-black font-semibold text-sm hover:bg-[#FF881A] transition-colors shadow-lg active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Ausgewählte abfragen ({selectedCount})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
