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
} from 'lucide-react';
import { Vocabulary, UserProgress } from '../types/vocab';
import { speakThai } from '../utils/thaiAudio';
import { PHASES } from '../utils/leitner';
import { EditVocabModal } from './EditVocabModal';

interface PoolViewProps {
  vocabularies: Vocabulary[];
  progressMap: Record<string, UserProgress>;
  onSelectForStudy: (selectedVocabs: { vocab: Vocabulary; progress?: UserProgress }[]) => void;
  onAddBatchToDeck: (vocabIds: string[]) => Promise<void>;
  onNavigateCreate: () => void;
  onUpdateVocab?: (id: string, updatedData: Partial<Omit<Vocabulary, 'id' | 'createdAt'>>) => Promise<void>;
  onDeleteVocab?: (id: string) => Promise<void>;
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
  existingLessons = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedLessons, setExpandedLessons] = useState<Record<string, boolean>>({});
  const [filterMode, setFilterMode] = useState<'all' | 'in_deck' | 'not_in_deck'>('all');
  const [isAddingToDeck, setIsAddingToDeck] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingVocab, setEditingVocab] = useState<Vocabulary | null>(null);

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

      const lessonName = v.lesson || 'Allgemein';
      if (!map[lessonName]) map[lessonName] = [];
      map[lessonName].push(v);
    });
    return map;
  }, [vocabularies, searchQuery, filterMode, progressMap]);

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

  const selectedCount = selectedIds.size;
  const selectedNotInDeck = Array.from(selectedIds).filter((id) => !progressMap[id]).length;

  return (
    <div className="max-w-md mx-auto px-4 pt-3 pb-36 text-white">
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
            className="text-[#8E8E93] hover:text-white text-xs px-1"
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
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs text-[#8E8E93] hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Quick Filter chips */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilterMode('all')}
          className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
            filterMode === 'all'
              ? 'bg-[#FF7A00] text-black font-semibold'
              : 'bg-[#242426] text-[#8E8E93] border border-[#323236]'
          }`}
        >
          Alle ({vocabularies.length})
        </button>
        <button
          onClick={() => setFilterMode('in_deck')}
          className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
            filterMode === 'in_deck'
              ? 'bg-[#FF7A00] text-black font-semibold'
              : 'bg-[#242426] text-[#8E8E93] border border-[#323236]'
          }`}
        >
          In meinem Deck ({Object.keys(progressMap).length})
        </button>
        <button
          onClick={() => setFilterMode('not_in_deck')}
          className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
            filterMode === 'not_in_deck'
              ? 'bg-[#FF7A00] text-black font-semibold'
              : 'bg-[#242426] text-[#8E8E93] border border-[#323236]'
          }`}
        >
          Noch nicht gelernt ({Math.max(0, vocabularies.length - Object.keys(progressMap).length)})
        </button>
      </div>

      {/* Course Header Banner */}
      <div className="bg-[#242426] rounded-2xl p-3 flex items-center gap-3 border border-[#323236] mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 border border-[#444448] flex items-center justify-center text-lg">
          🇹🇭
        </div>
        <div>
          <span className="text-sm font-bold text-white tracking-tight">Thai Grund- & Aufbauwortschatz</span>
          <p className="text-[11px] text-[#8E8E93]">Gemeinsamer Community-Pool & eigene Kärtchen</p>
        </div>
      </div>

      {/* Accordion List matching IMG_6341.png */}
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
              className="px-4 py-2 bg-[#FF7A00] text-black rounded-full font-semibold text-xs hover:bg-[#FF881A]"
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
                {/* Accordion Header matching IMG_6341.png */}
                <div className="p-3.5 flex items-center justify-between border-b border-[#323236]/60">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Checkbox for entire lesson */}
                    <button
                      type="button"
                      onClick={() => toggleSelectLesson(items)}
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
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
                      className="flex items-center justify-between flex-1 text-left min-w-0 pr-1"
                    >
                      <span className="text-sm font-semibold text-white truncate">
                        {lesson}
                      </span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs font-semibold text-[#FF7A00]">
                          {selectedInLesson} / {items.length}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-[#8E8E93]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#8E8E93]" />
                        )}
                      </div>
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
                              className="p-1 rounded-full text-[#71717A] hover:text-[#FF7A00] transition-colors"
                              title="Vokabel bearbeiten"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            {/* Audio pronunciation icon */}
                            <button
                              type="button"
                              onClick={() => speakThai(vocab.thai)}
                              className="p-1 rounded-full text-[#71717A] hover:text-white transition-colors"
                              title="Aussprache anhören"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Phase pill if in deck */}
                            {inDeck ? (
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${
                                  PHASES[prog.phase]?.badgeBg || 'bg-gray-600'
                                }`}
                              >
                                P{prog.phase}
                              </span>
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

      {/* Edit Vocab Modal */}
      {editingVocab && (
        <EditVocabModal
          vocab={editingVocab}
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
          existingLessons={
            existingLessons.length > 0
              ? existingLessons
              : Object.keys(groupedByLesson)
          }
        />
      )}

      {/* Sticky Bottom Actions matching IMG_6341.png */}
      <div className="fixed bottom-16 left-0 right-0 z-30 bg-[#121214]/95 backdrop-blur-md border-t border-[#2C2C2E] p-3 px-4">
        <div className="max-w-md mx-auto space-y-2">
          {/* Outlined button: + Vokabeln eingeben */}
          <button
            onClick={onNavigateCreate}
            className="w-full py-3.5 rounded-full bg-[#1C1C1E] border border-[#3A3A3D] text-white font-semibold text-sm hover:bg-[#242426] transition-colors flex items-center justify-center gap-2 active:scale-[0.99]"
          >
            <Plus className="w-4 h-4 text-[#FF7A00]" />
            <span>+ Vokabeln eingeben</span>
          </button>

          {/* If cards not in deck are selected, show add option, or directly study */}
          {selectedNotInDeck > 0 ? (
            <button
              onClick={handleAddSelectedToDeck}
              disabled={isAddingToDeck}
              className="w-full py-3.5 rounded-full bg-[#FF7A00] text-black font-semibold text-sm hover:bg-[#FF881A] transition-colors shadow-lg active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <FolderPlus className="w-4 h-4 text-black" />
              <span>{selectedNotInDeck} zur Abfrage hinzufügen</span>
            </button>
          ) : (
            <button
              onClick={handleStartStudySelected}
              disabled={selectedCount === 0}
              className="w-full py-3.5 rounded-full bg-[#FF7A00] text-black font-semibold text-sm hover:bg-[#FF881A] transition-colors shadow-lg active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span>Ausgewählte abfragen ({selectedCount})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
