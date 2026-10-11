import React, { useState, useRef } from 'react';
import {
  Download,
  Upload,
  FileSpreadsheet,
  FileJson,
  User,
  LogOut,
  LogIn,
  Eye,
  EyeOff,
  Volume2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Database,
  RefreshCw,
} from 'lucide-react';
import { Vocabulary, UserProgress } from '../types/vocab';
import { StudyInputMethod, StudyMode, StudyDirection } from './StudySession';
import {
  exportToCSV,
  exportToJSON,
  parseCSVContent,
  ParsedCSVRow,
} from '../services/exportImportService';
import { useAuth } from '../context/AuthContext';

interface SettingsViewProps {
  vocabularies: Vocabulary[];
  progressMap: Record<string, UserProgress>;
  onImportVocabs: (newVocabs: Omit<Vocabulary, 'id' | 'createdAt'>[]) => Promise<number>;
  defaultHideRomanization: boolean;
  onToggleDefaultHideRomanization: (val: boolean) => void;
  defaultInputMethod: StudyInputMethod;
  onToggleDefaultInputMethod: (val: StudyInputMethod) => void;
  acceptRomanizationTyping: boolean;
  onToggleAcceptRomanizationTyping: (val: boolean) => void;
  studyMode: StudyMode;
  onToggleStudyMode: (mode: StudyMode) => void;
  studyDirection: StudyDirection;
  onToggleStudyDirection: (direction: StudyDirection) => void;
  onOpenAuthModal: () => void;
  onRefreshData: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  vocabularies,
  progressMap,
  onImportVocabs,
  defaultHideRomanization,
  onToggleDefaultHideRomanization,
  defaultInputMethod,
  onToggleDefaultInputMethod,
  acceptRomanizationTyping,
  onToggleAcceptRomanizationTyping,
  studyMode,
  onToggleStudyMode,
  studyDirection,
  onToggleStudyDirection,
  onOpenAuthModal,
  onRefreshData,
}) => {
  const { user, isGuest, logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CSV Import State
  const [parsedRows, setParsedRows] = useState<ParsedCSVRow[] | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const rows = parseCSVContent(text);
        setParsedRows(rows);
        setImportStatus(null);
      }
    };
    reader.readAsText(file);
    // Reset file input so user can re-upload same file if needed
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!parsedRows || parsedRows.length === 0) return;
    setIsImporting(true);
    setImportStatus(null);

    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setImportStatus('Keine gültigen Zeilen zum Importieren gefunden.');
      setIsImporting(false);
      return;
    }

    try {
      const formatted = validRows.map((r) => ({
        german: r.german,
        thai: r.thai,
        romanization: r.romanization || undefined,
        lesson: r.lesson || 'Importierte Vokabeln',
        exampleThai: r.exampleThai || undefined,
        exampleGerman: r.exampleGerman || undefined,
        creatorId: user?.uid || 'guest_importer',
      }));

      const count = await onImportVocabs(formatted);
      setImportStatus(`${count} Vokabeln erfolgreich importiert!`);
      setParsedRows(null);
    } catch (err: any) {
      setImportStatus(`Fehler beim Import: ${err.message || 'Unbekannt'}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshData();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-3 pb-32 text-white">
      {/* Top Header */}
      <div className="flex items-center justify-between py-2 mb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Einstellungen & Export
          </h1>
          <p className="text-xs text-[#8E8E93]">
            Volle Datenhoheit, Backup & Personalisierung
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-full bg-[#242426] border border-[#323236] text-[#8E8E93] hover:text-white transition-colors"
          title="Daten synchronisieren"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#FF7A00]' : ''}`} />
        </button>
      </div>

      <div className="space-y-5">
        {/* User Account Card */}
        <div className="bg-[#242426] rounded-2xl p-4 border border-[#323236]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-[#1C1C1E] border border-[#3A3A3D] flex items-center justify-center text-xl">
                👤
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {user && !isGuest
                    ? (user.displayName || user.email || 'Angemeldeter Nutzer')
                    : 'Gast-Lernender'}
                </p>
                <p className="text-xs text-[#8E8E93]">
                  {user && !isGuest
                    ? (user.email ? `${user.email} • Gespeichertes Profil` : 'Persönliches Profil aktiv')
                    : 'Kein Konto verknüpft (Lerne als Gast)'}
                </p>
              </div>
            </div>

            {user && !isGuest ? (
              <button
                onClick={logout}
                className="px-3 py-1.5 rounded-full bg-[#1C1C1E] border border-[#3A3A3D] text-xs text-rose-400 hover:bg-[#2C2C2E] flex items-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Abmelden</span>
              </button>
            ) : (
              <button
                onClick={onOpenAuthModal}
                className="px-3.5 py-1.5 rounded-full bg-[#FF7A00] text-black font-semibold text-xs hover:bg-[#FF881A] transition-colors"
              >
                Anmelden / Registrieren
              </button>
            )}
          </div>
        </div>

        {/* 1-Click Export Section (Anti-Lock-in) */}
        <div className="bg-[#242426] rounded-2xl p-4 border border-[#323236]">
          <h2 className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Download className="w-4 h-4 text-[#FF7A00]" />
            1-Click Daten-Export (Anti Vendor Lock-In)
          </h2>
          <p className="text-xs text-[#A1A1AA] mb-4">
            Lade jederzeit alle Vokabeln und deinen aktuellen Lernfortschritt herunter.
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            {/* CSV Export */}
            <button
              onClick={() => exportToCSV(vocabularies, progressMap)}
              className="py-3 px-3 rounded-xl bg-[#1C1C1E] border border-[#3A3A3D] hover:bg-[#2C2C2E] hover:border-[#FF7A00] transition-colors flex flex-col items-center justify-center text-center group"
            >
              <FileSpreadsheet className="w-5 h-5 text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-semibold text-white">CSV Export</span>
              <span className="text-[10px] text-[#8E8E93]">Excel/Sheets UTF-8</span>
            </button>

            {/* JSON Export */}
            <button
              onClick={() => exportToJSON(vocabularies, progressMap)}
              className="py-3 px-3 rounded-xl bg-[#1C1C1E] border border-[#3A3A3D] hover:bg-[#2C2C2E] hover:border-[#FF7A00] transition-colors flex flex-col items-center justify-center text-center group"
            >
              <FileJson className="w-5 h-5 text-[#FF7A00] mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-semibold text-white">JSON Export</span>
              <span className="text-[10px] text-[#8E8E93]">Vollständiges Backup</span>
            </button>
          </div>
        </div>

        {/* CSV Import Section */}
        <div className="bg-[#242426] rounded-2xl p-4 border border-[#323236]">
          <h2 className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Upload className="w-4 h-4 text-[#FF7A00]" />
            CSV Vokabeln Importieren
          </h2>
          <p className="text-xs text-[#A1A1AA] mb-3">
            Lade eigene Tabellen hoch. Unterstütztes Format: <br />
            <code className="text-[#FF7A00] bg-[#1C1C1E] px-1 py-0.5 rounded text-[11px]">
              Deutsch;Thai;Romanisierung;Lektion
            </code>
          </p>

          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 px-4 rounded-xl border border-dashed border-[#444448] bg-[#1C1C1E] hover:border-[#FF7A00] hover:bg-[#242426] transition-colors text-xs font-semibold text-white flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4 text-[#FF7A00]" />
            <span>CSV-Datei auswählen...</span>
          </button>

          {/* Import status toast */}
          {importStatus && (
            <div className="mt-3 p-2.5 rounded-xl bg-[#1C1C1E] border border-[#323236] text-xs text-[#D1D1D6] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{importStatus}</span>
            </div>
          )}

          {/* Preview Table of Parsed CSV */}
          {parsedRows && (
            <div className="mt-4 p-3 bg-[#1C1C1E] rounded-xl border border-[#3A3A3D] text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-white">
                  Vorschau: {parsedRows.length} Zeilen erkannt
                </span>
                <span className="text-[10px] text-emerald-400">
                  {parsedRows.filter((r) => r.isValid).length} gültig
                </span>
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1.5 mb-3 divide-y divide-[#2C2C2E]">
                {parsedRows.slice(0, 5).map((row, idx) => (
                  <div key={idx} className="pt-1.5 flex items-center justify-between text-[11px]">
                    <div>
                      <span className="text-white font-medium">{row.german}</span> &rarr;{' '}
                      <span className="text-[#FF7A00] font-thai">{row.thai}</span>
                    </div>
                    <span className="text-[#8E8E93] text-[10px] truncate max-w-[90px]">
                      {row.lesson}
                    </span>
                  </div>
                ))}
                {parsedRows.length > 5 && (
                  <p className="text-[10px] text-[#71717A] text-center pt-1">
                    + {parsedRows.length - 5} weitere Zeilen
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setParsedRows(null)}
                  className="flex-1 py-2 rounded-lg bg-[#242426] text-xs text-[#8E8E93] hover:text-white"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={isImporting}
                  className="flex-1 py-2 rounded-lg bg-[#FF7A00] text-black font-semibold text-xs hover:bg-[#FF881A]"
                >
                  {isImporting ? 'Importiere...' : 'Jetzt importieren'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Lern-Präferenzen */}
        <div className="bg-[#242426] rounded-2xl p-4 border border-[#323236]">
          <h2 className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-3">
            Lern- & Abfrage-Präferenzen
          </h2>

          {/* Standard-Lernrichtung */}
          <div className="py-2.5 border-b border-[#323236]/60">
            <div className="mb-2">
              <p className="text-sm font-medium text-white">Standard-Lernrichtung</p>
              <p className="text-xs text-[#8E8E93]">
                Wird automatisch für die "Reguläre Übung" verwendet
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onToggleStudyDirection('de_to_th')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                  studyDirection === 'de_to_th'
                    ? 'bg-[#FF7A00] text-black border-[#FF7A00]'
                    : 'bg-[#1C1C1E] text-[#8E8E93] border-[#3A3A3D] hover:text-white'
                }`}
              >
                DE ➔ Thai
              </button>
              <button
                type="button"
                onClick={() => onToggleStudyDirection('both')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                  studyDirection === 'both'
                    ? 'bg-[#FF7A00] text-black border-[#FF7A00]'
                    : 'bg-[#1C1C1E] text-[#8E8E93] border-[#3A3A3D] hover:text-white'
                }`}
              >
                Beide
              </button>
              <button
                type="button"
                onClick={() => onToggleStudyDirection('th_to_de')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                  studyDirection === 'th_to_de'
                    ? 'bg-[#FF7A00] text-black border-[#FF7A00]'
                    : 'bg-[#1C1C1E] text-[#8E8E93] border-[#3A3A3D] hover:text-white'
                }`}
              >
                Thai ➔ DE
              </button>
            </div>
          </div>

          {/* Abfragemodus: Direkt vs. Einprägen */}
          <div className="flex items-center justify-between py-2.5 border-b border-[#323236]/60">
            <div>
              <p className="text-sm font-medium text-white">Direkt abfragen</p>
              <p className="text-xs text-[#8E8E93]">
                {studyMode === 'skip_preview' ? 'Sofort abfragen (Einprägen überspringen)' : 'Zuerst einprägen (beide Kartenseiten zeigen)'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onToggleStudyMode(studyMode === 'skip_preview' ? 'preview_first' : 'skip_preview')}
              className={`w-12 h-6 rounded-full transition-colors p-0.5 flex items-center shrink-0 ml-3 ${
                studyMode === 'skip_preview' ? 'bg-[#FF7A00] justify-end' : 'bg-[#3A3A3D] justify-start'
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-white shadow-md" />
            </button>
          </div>

          {/* Typing Mode Toggle */}
          <div className="flex items-center justify-between py-2.5 border-b border-[#323236]/60">
            <div>
              <p className="text-sm font-medium text-white">Schreibabfrage als Standard</p>
              <p className="text-xs text-[#8E8E93]">
                Thai bei Deutsch ➔ Thai eintippen (Thai ➔ Deutsch wird mit "Lösung anzeigen" abgefragt)
              </p>
            </div>
            <button
              type="button"
              onClick={() => onToggleDefaultInputMethod(defaultInputMethod === 'typing' ? 'flashcard' : 'typing')}
              className={`w-12 h-6 rounded-full transition-colors p-0.5 flex items-center shrink-0 ml-3 ${
                defaultInputMethod === 'typing' ? 'bg-[#FF7A00] justify-end' : 'bg-[#3A3A3D] justify-start'
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-white shadow-md" />
            </button>
          </div>

          {/* Accept Romanization when Typing */}
          <div className="flex items-center justify-between py-2.5 border-b border-[#323236]/60">
            <div>
              <p className="text-sm font-medium text-white">Lautschrift beim Tippen akzeptieren</p>
              <p className="text-xs text-[#8E8E93]">
                Erlaubt die Eingabe in Lautschrift, falls keine Thai-Tastatur aktiv ist
              </p>
            </div>
            <button
              type="button"
              onClick={() => onToggleAcceptRomanizationTyping(!acceptRomanizationTyping)}
              className={`w-12 h-6 rounded-full transition-colors p-0.5 flex items-center shrink-0 ml-3 ${
                acceptRomanizationTyping ? 'bg-[#FF7A00] justify-end' : 'bg-[#3A3A3D] justify-start'
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-white shadow-md" />
            </button>
          </div>

          {/* Keyboard suggestions note */}
          <div className="flex items-center justify-between py-2.5 border-b border-[#323236]/60 text-xs text-[#A1A1AA]">
            <div>
              <p className="text-sm font-medium text-white">Tastaturvorschläge unterdrücken</p>
              <p className="text-xs text-[#8E8E93]">
                Autokorrektur, Wortvorschläge & Vorhersagen sind im Eingabefeld blockiert
              </p>
            </div>
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
              Aktiv
            </span>
          </div>

          {/* Romanization Toggle */}
          <div className="flex items-center justify-between py-2.5 border-b border-[#323236]/60">
            <div>
              <p className="text-sm font-medium text-white">Umschrift standardmäßig verbergen</p>
              <p className="text-xs text-[#8E8E93]">
                Erzwingt das Lesen echter Thai-Schriftzeichen
              </p>
            </div>
            <button
              type="button"
              onClick={() => onToggleDefaultHideRomanization(!defaultHideRomanization)}
              className={`w-12 h-6 rounded-full transition-colors p-0.5 flex items-center shrink-0 ml-3 ${
                defaultHideRomanization ? 'bg-[#FF7A00] justify-end' : 'bg-[#3A3A3D] justify-start'
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-white shadow-md" />
            </button>
          </div>

          {/* Thai Font info */}
          <div className="pt-3 flex items-start gap-2.5 text-xs text-[#8E8E93]">
            <span className="text-base">🇹🇭</span>
            <div>
              <p className="text-[#D1D1D6] font-medium">Original phase6 iOS Schrift (Thonburi & Sarabun)</p>
              <p className="text-[11px] mt-0.5">
                Klassische thailändische Schrift mit deutlichen Kringeln/Schlaufen (Heads/Loops) und optimaler Platzierung für Ton- und Vokalzeichen.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
