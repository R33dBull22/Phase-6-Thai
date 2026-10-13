import React, { useState } from 'react';
import {
  ArrowLeft,
  Keyboard,
  Layers,
  ArrowRight,
  ArrowLeftRight,
  Sparkles,
} from 'lucide-react';
import { Vocabulary, UserProgress } from '../types/vocab';
import { StudyMode, StudyDirection, StudyInputMethod, StudyCardItem } from './StudySession';

interface StudySummaryModalProps {
  cardsToStudy: StudyCardItem[];
  onBack: () => void;
  initialMode?: StudyMode;
  initialDirection?: StudyDirection;
  defaultInputMethod?: StudyInputMethod;
  onStart: (mode: StudyMode, direction: StudyDirection, inputMethod: StudyInputMethod) => void;
}

export const StudySummaryModal: React.FC<StudySummaryModalProps> = ({
  cardsToStudy,
  onBack,
  initialMode,
  initialDirection,
  defaultInputMethod = 'typing',
  onStart,
}) => {
  const [mode, setMode] = useState<StudyMode>(() => {
    if (initialMode) return initialMode;
    try {
      return (localStorage.getItem('thai_hasis_study_mode') || localStorage.getItem('phase6_study_mode') || 'skip_preview') as StudyMode;
    } catch {
      return 'skip_preview';
    }
  });

  const [direction, setDirection] = useState<StudyDirection>(() => {
    if (initialDirection) return initialDirection;
    try {
      return (localStorage.getItem('thai_hasis_study_direction') || localStorage.getItem('phase6_study_direction') || 'both') as StudyDirection;
    } catch {
      return 'both';
    }
  });

  const [inputMethod, setInputMethod] = useState<StudyInputMethod>(() => {
    try {
      return ((localStorage.getItem('thai_hasis_default_input_method') || localStorage.getItem('phase6_default_input_method')) as StudyInputMethod) || defaultInputMethod;
    } catch {
      return defaultInputMethod;
    }
  });

  const count = cardsToStudy.length;

  const handleStart = () => {
    try {
      localStorage.setItem('thai_hasis_study_mode', mode);
      localStorage.setItem('thai_hasis_study_direction', direction);
      localStorage.setItem('thai_hasis_default_input_method', inputMethod);
    } catch {}
    onStart(mode, direction, inputMethod);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#121214] text-white flex flex-col justify-between p-4 sm:p-6 overflow-y-auto">
      {/* Top Bar matching IMG_6342.png */}
      <div className="max-w-md w-full mx-auto">
        <div className="flex items-center justify-between py-2 mb-4">
          <button
            onClick={onBack}
            className="p-1 -ml-1 text-[#FF7A00] hover:text-[#FFA040] transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-semibold text-white tracking-tight">
            Abfrage-Einstellungen
          </h1>
          <div className="w-6" />
        </div>

        {/* Course Card */}
        <div className="bg-[#242426] rounded-2xl p-4 flex items-center gap-3.5 border border-[#323236] mb-5">
          <div className="w-12 h-14 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 border border-[#444448] flex items-center justify-center relative overflow-hidden">
            <span className="text-xl">🇹🇭</span>
            <div className="absolute inset-0 bg-black/20" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Thai</h2>
            <p className="text-xs text-[#8E8E93]">
              {count} {count === 1 ? 'Kärtchen' : 'Kärtchen'} bereit
            </p>
          </div>
        </div>

        {/* 1. Eingabemethode: Schreibabfrage vs. Karteikarte */}
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            <Keyboard className="w-3.5 h-3.5 text-[#FF7A00]" />
            Eingabe & Schreibmodus
          </h3>
          <div className="bg-[#242426] rounded-2xl border border-[#323236] overflow-hidden divide-y divide-[#323236]">
            {/* Option A: Schreibabfrage (Tippen) */}
            <button
              type="button"
              onClick={() => setInputMethod('typing')}
              className="w-full p-3.5 flex items-start gap-3.5 text-left transition-colors hover:bg-[#2C2C2E]"
            >
              <div
                className={`w-5 h-5 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                  inputMethod === 'typing'
                    ? 'border-[#FF7A00] bg-[#FF7A00]'
                    : 'border-[#71717A] bg-transparent'
                }`}
              >
                {inputMethod === 'typing' && (
                  <div className="w-2 h-2 rounded-full bg-black" />
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${inputMethod === 'typing' ? 'text-[#FF7A00]' : 'text-[#D1D1D6]'}`}>
                  Schreibabfrage (Deutsch ➔ Thai tippen)
                </p>
                <p className="text-xs text-[#8E8E93] mt-0.5">
                  Thai-Schriftzeichen oder Lautschrift aktiv eingeben. Thai ➔ Deutsch wird mit Lösung aufdecken abgefragt.
                </p>
              </div>
            </button>

            {/* Option B: Karteikarte (Umdrehen & Selbstbewertung) */}
            <button
              type="button"
              onClick={() => setInputMethod('flashcard')}
              className="w-full p-3.5 flex items-start gap-3.5 text-left transition-colors hover:bg-[#2C2C2E]"
            >
              <div
                className={`w-5 h-5 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                  inputMethod === 'flashcard'
                    ? 'border-[#FF7A00] bg-[#FF7A00]'
                    : 'border-[#71717A] bg-transparent'
                }`}
              >
                {inputMethod === 'flashcard' && (
                  <div className="w-2 h-2 rounded-full bg-black" />
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${inputMethod === 'flashcard' ? 'text-[#FF7A00]' : 'text-[#D1D1D6]'}`}>
                  Klassische Karteikarte (Nur Aufdecken)
                </p>
                <p className="text-xs text-[#8E8E93] mt-0.5">
                  Karte umdrehen und mit "Gelten lassen" oder "Nicht gewusst" bewerten. Kein Tippen nötig.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* 2. Abfragemodus matching IMG_6342.png */}
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#FF7A00]" />
            Abfragemodus
          </h3>
          <div className="bg-[#242426] rounded-2xl border border-[#323236] overflow-hidden divide-y divide-[#323236]">
            {/* Option 1: Zuerst einprägen */}
            <button
              type="button"
              onClick={() => setMode('preview_first')}
              className="w-full p-3.5 flex items-start gap-3.5 text-left transition-colors hover:bg-[#2C2C2E]"
            >
              <div
                className={`w-5 h-5 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                  mode === 'preview_first'
                    ? 'border-[#FF7A00] bg-[#FF7A00]'
                    : 'border-[#71717A] bg-transparent'
                }`}
              >
                {mode === 'preview_first' && (
                  <div className="w-2 h-2 rounded-full bg-black" />
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${mode === 'preview_first' ? 'text-[#FF7A00]' : 'text-[#D1D1D6]'}`}>
                  Zuerst einprägen
                </p>
                <p className="text-xs text-[#8E8E93] mt-0.5">
                  Karten zuerst mit beiden Seiten anzeigen, bevor die Abfrage beginnt.
                </p>
              </div>
            </button>

            {/* Option 2: Einprägen überspringen */}
            <button
              type="button"
              onClick={() => setMode('skip_preview')}
              className="w-full p-3.5 flex items-start gap-3.5 text-left transition-colors hover:bg-[#2C2C2E]"
            >
              <div
                className={`w-5 h-5 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                  mode === 'skip_preview'
                    ? 'border-[#FF7A00] bg-[#FF7A00]'
                    : 'border-[#71717A] bg-transparent'
                }`}
              >
                {mode === 'skip_preview' && (
                  <div className="w-2 h-2 rounded-full bg-black" />
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${mode === 'skip_preview' ? 'text-[#FF7A00]' : 'text-[#D1D1D6]'}`}>
                  Direkt abfragen (Einprägen überspringen)
                </p>
                <p className="text-xs text-[#8E8E93] mt-0.5">
                  Sofort mit der eigentlichen Wiederholung und Abfrage beginnen.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* 3. Lernrichtung matching IMG_6342.png */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            <ArrowLeftRight className="w-3.5 h-3.5 text-[#FF7A00]" />
            Lernrichtung
          </h3>
          <div className="grid grid-cols-3 gap-2.5">
            {/* Deutsch -> Thai */}
            <button
              type="button"
              onClick={() => setDirection('de_to_th')}
              className={`p-3 rounded-2xl border text-center transition-all ${
                direction === 'de_to_th'
                  ? 'bg-[#FF7A00]/15 border-[#FF7A00] text-white shadow-sm'
                  : 'bg-[#242426] border-[#323236] text-[#8E8E93] hover:text-white'
              }`}
            >
              <div className="flex items-center justify-center gap-1 text-sm font-medium mb-1">
                <span>🇩🇪</span>
                <ArrowRight className="w-3 h-3 text-[#FF7A00]" />
                <span>🇹🇭</span>
              </div>
              <span className="text-[11px] font-semibold block">
                DE ➔ Thai
              </span>
            </button>

            {/* Beide Richtungen */}
            <button
              type="button"
              onClick={() => setDirection('both')}
              className={`p-3 rounded-2xl border text-center transition-all ${
                direction === 'both'
                  ? 'bg-[#FF7A00]/15 border-[#FF7A00] text-white shadow-sm'
                  : 'bg-[#242426] border-[#323236] text-[#8E8E93] hover:text-white'
              }`}
            >
              <div className="flex items-center justify-center gap-1 text-sm font-medium mb-1">
                <span>🇩🇪</span>
                <ArrowLeftRight className="w-3.5 h-3.5 text-[#FF7A00]" />
                <span>🇹🇭</span>
              </div>
              <span className="text-[11px] font-semibold block">
                Beide
              </span>
            </button>

            {/* Thai -> Deutsch */}
            <button
              type="button"
              onClick={() => setDirection('th_to_de')}
              className={`p-3 rounded-2xl border text-center transition-all ${
                direction === 'th_to_de'
                  ? 'bg-[#FF7A00]/15 border-[#FF7A00] text-white shadow-sm'
                  : 'bg-[#242426] border-[#323236] text-[#8E8E93] hover:text-white'
              }`}
            >
              <div className="flex items-center justify-center gap-1 text-sm font-medium mb-1">
                <span>🇹🇭</span>
                <ArrowRight className="w-3 h-3 text-[#FF7A00]" />
                <span>🇩🇪</span>
              </div>
              <span className="text-[11px] font-semibold block">
                Thai ➔ DE
              </span>
            </button>
          </div>
        </div>

        {/* Persistence note */}
        <p className="text-[11px] text-[#8E8E93] text-center mb-4">
          ✓ Diese Einstellungen werden dauerhaft gespeichert und für die "Reguläre Übung" verwendet.
        </p>
      </div>

      {/* Sticky Bottom Button */}
      <div className="max-w-md w-full mx-auto pt-2 pb-2">
        <button
          onClick={handleStart}
          className="w-full py-4 rounded-full bg-[#FF7A00] text-black font-semibold text-base hover:bg-[#FF881A] transition-colors shadow-lg active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <span>Einstellungen speichern & Abfrage starten</span>
          <ArrowRight className="w-4 h-4 text-black stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
};
