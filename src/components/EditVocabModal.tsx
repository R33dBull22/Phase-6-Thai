import React, { useState, useEffect } from 'react';
import {
  X,
  Volume2,
  Trash2,
  Check,
  Sparkles,
  AlertCircle,
  Pencil,
} from 'lucide-react';
import { Vocabulary } from '../types/vocab';
import { speakThai } from '../utils/thaiAudio';

interface EditVocabModalProps {
  vocab: Vocabulary | null;
  currentPhase?: number;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updatedData: Partial<Omit<Vocabulary, 'id' | 'createdAt'>>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onUpdatePhase?: (vocabId: string, newPhase: number) => Promise<void>;
  existingLessons: string[];
}

export const EditVocabModal: React.FC<EditVocabModalProps> = ({
  vocab,
  currentPhase,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onUpdatePhase,
  existingLessons,
}) => {
  const [german, setGerman] = useState('');
  const [thai, setThai] = useState('');
  const [romanization, setRomanization] = useState('');
  const [lesson, setLesson] = useState('');
  const [customLesson, setCustomLesson] = useState('');
  const [exampleThai, setExampleThai] = useState('');
  const [exampleGerman, setExampleGerman] = useState('');
  const [selectedPhase, setSelectedPhase] = useState<number>(currentPhase || 1);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (vocab) {
      setGerman(vocab.german || '');
      setThai(vocab.thai || '');
      setRomanization(vocab.romanization || '');
      setExampleThai(vocab.exampleThai || '');
      setExampleGerman(vocab.exampleGerman || '');
      setSelectedPhase(currentPhase || 1);

      const isKnownLesson = existingLessons.includes(vocab.lesson);
      if (isKnownLesson) {
        setLesson(vocab.lesson);
        setCustomLesson('');
      } else {
        setLesson('__new__');
        setCustomLesson(vocab.lesson || '');
      }
      setErrorMessage(null);
      setShowDeleteConfirm(false);
    }
  }, [vocab, currentPhase, existingLessons]);

  if (!isOpen || !vocab) return null;

  const finalLesson = lesson === '__new__' ? customLesson.trim() : lesson;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!german.trim()) {
      setErrorMessage('Bitte gib die deutsche Bedeutung ein.');
      return;
    }
    if (!thai.trim()) {
      setErrorMessage('Bitte gib die Thai-Schriftzeichen ein.');
      return;
    }
    if (!finalLesson) {
      setErrorMessage('Bitte wähle oder erstelle eine Lektion.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(vocab.id, {
        german: german.trim(),
        thai: thai.trim(),
        romanization: romanization.trim() || undefined,
        lesson: finalLesson,
        exampleThai: exampleThai.trim() || undefined,
        exampleGerman: exampleGerman.trim() || undefined,
      });

      if (onUpdatePhase && selectedPhase !== currentPhase) {
        await onUpdatePhase(vocab.id, selectedPhase);
      }

      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Fehler beim Speichern der Änderungen.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(vocab.id);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Fehler beim Löschen der Vokabel.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTestAudio = () => {
    if (thai.trim()) {
      speakThai(thai.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div
        className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#1C1C1E]/95 backdrop-blur-md px-5 py-4 border-b border-[#2C2C2E] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#FF7A00]/20 flex items-center justify-center text-[#FF7A00]">
              <Pencil className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Vokabel bearbeiten</h2>
              <p className="text-[11px] text-[#8E8E93]">Änderungen werden sofort übernommen</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#242426] flex items-center justify-center text-[#8E8E93] hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Lektion Auswahl */}
          <div className="bg-[#242426] rounded-2xl p-4 border border-[#323236]">
            <label className="block text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-2">
              Lektion / Kategorie
            </label>
            <select
              value={lesson}
              onChange={(e) => setLesson(e.target.value)}
              className="w-full bg-[#1C1C1E] border border-[#3A3A3D] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF7A00]"
            >
              {existingLessons.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
              <option value="__new__">+ Neue Lektion eingeben...</option>
            </select>

            {lesson === '__new__' && (
              <input
                type="text"
                value={customLesson}
                onChange={(e) => setCustomLesson(e.target.value)}
                placeholder="Name der neuen Lektion"
                className="w-full mt-2 bg-[#1C1C1E] border border-[#3A3A3D] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FF7A00]"
                autoFocus
              />
            )}
          </div>

          {/* Deutsche Bedeutung */}
          <div className="bg-[#242426] rounded-2xl p-4 border border-[#323236]">
            <label className="block text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-2">
              Bedeutung auf Deutsch *
            </label>
            <input
              type="text"
              value={german}
              onChange={(e) => setGerman(e.target.value)}
              placeholder="z. B. Guten Tag / Hallo"
              className="w-full bg-[#1C1C1E] border border-[#3A3A3D] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF7A00]"
            />
          </div>

          {/* Thai Schriftzeichen */}
          <div className="bg-[#242426] rounded-2xl p-4 border border-[#323236]">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">
                Thai-Schriftzeichen *
              </label>
              {thai.trim() && (
                <button
                  type="button"
                  onClick={handleTestAudio}
                  className="flex items-center gap-1 text-[11px] text-[#FF7A00] hover:underline"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Audio anhören</span>
                </button>
              )}
            </div>
            <input
              type="text"
              value={thai}
              onChange={(e) => setThai(e.target.value)}
              placeholder="z. B. สวัสดีครับ"
              className="w-full bg-[#1C1C1E] border border-[#3A3A3D] rounded-xl px-3 py-3 text-lg font-thai text-white focus:outline-none focus:border-[#FF7A00]"
            />
          </div>

          {/* Lautschrift */}
          <div className="bg-[#242426] rounded-2xl p-4 border border-[#323236]">
            <label className="block text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-2">
              Lautschrift / Umschrift (Optional)
            </label>
            <input
              type="text"
              value={romanization}
              onChange={(e) => setRomanization(e.target.value)}
              placeholder="z. B. sà-wàt-dee kráp"
              className="w-full bg-[#1C1C1E] border border-[#3A3A3D] rounded-xl px-3 py-2.5 text-sm text-[#FF7A00] focus:outline-none focus:border-[#FF7A00]"
            />
          </div>

          {/* Beispielsatz */}
          <div className="bg-[#242426] rounded-2xl p-4 border border-[#323236] space-y-3">
            <label className="block text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">
              Beispielsatz & Kontext (Optional)
            </label>
            <input
              type="text"
              value={exampleThai}
              onChange={(e) => setExampleThai(e.target.value)}
              placeholder="Thai-Satz"
              className="w-full bg-[#1C1C1E] border border-[#3A3A3D] rounded-xl px-3 py-2 text-sm font-thai text-white focus:outline-none focus:border-[#FF7A00]"
            />
            <input
              type="text"
              value={exampleGerman}
              onChange={(e) => setExampleGerman(e.target.value)}
              placeholder="Deutsche Übersetzung"
              className="w-full bg-[#1C1C1E] border border-[#3A3A3D] rounded-xl px-3 py-2 text-sm text-[#D1D1D6] focus:outline-none focus:border-[#FF7A00]"
            />
          </div>

          {/* Phase bearbeiten */}
          <div className="bg-[#242426] rounded-2xl p-4 border border-[#323236]">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider">
                Lernphase (Leitner 1–6)
              </label>
              <span className="text-[11px] font-bold text-[#FF7A00]">
                Phase {selectedPhase}
              </span>
            </div>
            <p className="text-[11px] text-[#A1A1AA] mb-3 leading-relaxed">
              Wähle direkt die Phase, in der sich diese Vokabel in deinem persönlichen Leitner-System befinden soll:
            </p>
            <div className="grid grid-cols-6 gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((p) => {
                const isSelected = selectedPhase === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedPhase(p)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-[#FF7A00] text-black border-[#FF7A00] shadow-md scale-105'
                        : 'bg-[#1C1C1E] text-[#8E8E93] border-[#3A3A3D] hover:text-white hover:border-[#52525B]'
                    }`}
                  >
                    P{p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 space-y-3">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3.5 rounded-full bg-[#FF7A00] text-black font-semibold text-sm hover:bg-[#FF881A] transition-colors shadow-lg active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{isSaving ? 'Wird gespeichert...' : 'Änderungen speichern'}</span>
            </button>

            {onDelete && (
              <div>
                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-2.5 rounded-full text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Vokabel löschen</span>
                  </button>
                ) : (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-center space-y-2">
                    <p className="text-xs text-rose-300 font-medium">
                      Möchtest du diese Vokabel wirklich dauerhaft löschen?
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="px-4 py-1.5 bg-rose-600 text-white rounded-full text-xs font-semibold hover:bg-rose-500 transition-colors"
                      >
                        {isDeleting ? 'Löschen...' : 'Ja, löschen'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-4 py-1.5 bg-[#2C2C2E] text-[#8E8E93] rounded-full text-xs font-medium hover:text-white transition-colors"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
