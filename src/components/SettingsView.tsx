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
  Copy,
  Check,
  HelpCircle,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Vocabulary, UserProgress, DeletedVocabEntry } from '../types/vocab';
import { StudyInputMethod, StudyMode, StudyDirection } from './StudySession';
import {
  exportToCSV,
  exportToJSON,
  downloadSampleCSVTemplate,
  parseCSVContent,
  parseJSONContent,
  ParsedCSVRow,
} from '../services/exportImportService';
import {
  getDeletedVocabs,
  permanentlyDeleteFromTrash,
  clearAllDeletedVocabs,
} from '../services/vocabService';
import { useAuth } from '../context/AuthContext';
import { Trash2, RotateCcw } from 'lucide-react';

interface SettingsViewProps {
  vocabularies: Vocabulary[];
  progressMap: Record<string, UserProgress>;
  onImportVocabs: (
    newVocabs: (Omit<Vocabulary, 'id' | 'createdAt'> & { phase?: number })[]
  ) => Promise<number>;
  onRestoreVocab?: (id: string) => Promise<void>;
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

  // Deleted items & restoration state
  const [deletedList, setDeletedList] = useState<DeletedVocabEntry[]>(() =>
    getDeletedVocabs(user?.uid)
  );
  const [showDeletedTrash, setShowDeletedTrash] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [trashToast, setTrashToast] = useState<string | null>(null);

  const refreshDeletedList = () => {
    setDeletedList(getDeletedVocabs(user?.uid));
  };

  const handleRestoreItem = async (id: string, germanText: string) => {
    if (!onRestoreVocab) return;
    setRestoringId(id);
    try {
      await onRestoreVocab(id);
      refreshDeletedList();
      setTrashToast(`✓ „${germanText}“ erfolgreich wiederhergestellt!`);
      setTimeout(() => setTrashToast(null), 4000);
    } catch (err: any) {
      setTrashToast(`Fehler: ${err.message || 'Konnte nicht wiederhergestellt werden'}`);
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = (id: string) => {
    permanentlyDeleteFromTrash(id, user?.uid);
    refreshDeletedList();
    setTrashToast('Eintrag endgültig aus dem Papierkorb gelöscht.');
    setTimeout(() => setTrashToast(null), 3000);
  };

  const handleClearTrash = () => {
    clearAllDeletedVocabs(user?.uid);
    refreshDeletedList();
    setTrashToast('Papierkorb vollständig geleert.');
    setTimeout(() => setTrashToast(null), 3000);
  };

  // Import State (CSV or JSON)
  const [parsedRows, setParsedRows] = useState<ParsedCSVRow[] | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCsvFormatGuide, setShowCsvFormatGuide] = useState(true);
  const [copiedTemplate, setCopiedTemplate] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isJson = file.name.toLowerCase().endsWith('.json');
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const rows = isJson ? parseJSONContent(text) : parseCSVContent(text);
        setParsedRows(rows);
        setImportStatus(null);
      }
    };
    reader.readAsText(file);
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
        phase: r.phase && r.phase >= 1 && r.phase <= 6 ? r.phase : 1,
        creatorId: user?.uid || 'logged_in_user',
      }));

      const count = await onImportVocabs(formatted);
      setImportStatus(`✓ ${count} Vokabeln erfolgreich importiert! Die Phasen wurden für dein Profil übernommen.`);
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
                  {user
                    ? (user.displayName || user.email || 'Angemeldeter Lerner')
                    : 'Nicht angemeldet'}
                </p>
                <p className="text-xs text-[#8E8E93]">
                  {user
                    ? (user.email ? `${user.email} • Mitgliedskonto` : 'Persönliches Profil aktiv')
                    : 'Bitte anmelden'}
                </p>
              </div>
            </div>

            {user ? (
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

        {/* Cloud Synchronization Status Card */}
        <div className="bg-[#242426] rounded-2xl p-4 border border-[#323236]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-4 h-4 text-[#FF7A00]" />
              Gemeinsamer Cloud-Vokabelpool
            </h2>
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Echtzeit
            </span>
          </div>

          <p className="text-xs text-[#A1A1AA] mb-3">
            Alle erstellten Vokabeln werden automatisch in der Cloud gesichert. Gelöschte Vokabeln und Lektionen bleiben für dich dauerhaft ausgeblendet, auch nach einem erneuten Cloud-Abgleich.
          </p>

          <div className="bg-[#1C1C1E] rounded-xl p-3 border border-[#3A3A3D] flex items-center justify-between mb-1">
            <div>
              <p className="text-xs text-[#8E8E93]">Aktive Vokabeln im Pool</p>
              <p className="text-base font-bold text-white">{vocabularies.length} Vokabeln</p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="py-1.5 px-3 rounded-lg bg-[#2C2C2E] hover:bg-[#38383B] text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#FF7A00]' : ''}`} />
              <span>{isRefreshing ? 'Gleicht ab...' : 'Jetzt abgleichen'}</span>
            </button>
          </div>
        </div>

        {/* Gelöschte Vokabeln wiederherstellen (Papierkorb) */}
        <div className="bg-[#242426] rounded-2xl p-4 border border-[#323236]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4 text-[#FF7A00]" />
              Gelöschte Vokabeln wiederherstellen
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#1C1C1E] border border-[#3A3A3D] text-[#8E8E93]">
              {deletedList.length} {deletedList.length === 1 ? 'Eintrag' : 'Einträge'}
            </span>
          </div>

          <p className="text-xs text-[#A1A1AA] mb-3 leading-relaxed">
            Vokabeln, die du gelöscht hast, bleiben dauerhaft ausgeblendet und werden nicht wieder durch den Cloud-Abgleich eingespielt. Hier kannst du versehentlich gelöschte Wörter jederzeit wieder aktivieren.
          </p>

          {/* Toast inside trash */}
          {trashToast && (
            <div className="mb-3 p-2.5 rounded-xl bg-[#1C1C1E] border border-[#FF7A00]/40 text-xs text-amber-200 flex items-center justify-between gap-2">
              <span>{trashToast}</span>
              <button
                type="button"
                onClick={() => setTrashToast(null)}
                className="text-[#8E8E93] hover:text-white text-xs px-1"
              >
                ✕
              </button>
            </div>
          )}

          <div className="bg-[#1C1C1E] rounded-xl border border-[#3A3A3D] overflow-hidden">
            <div className="p-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowDeletedTrash((prev) => !prev)}
                className="flex items-center gap-2 text-xs font-semibold text-white hover:text-[#FF7A00] transition-colors cursor-pointer text-left flex-1"
              >
                <Trash2 className="w-4 h-4 text-[#8E8E93]" />
                <span>
                  {showDeletedTrash
                    ? 'Papierkorb einklappen'
                    : `Papierkorb öffnen (${deletedList.length})`}
                </span>
              </button>

              <div className="flex items-center gap-2">
                {deletedList.length > 0 && showDeletedTrash && (
                  <button
                    type="button"
                    onClick={handleClearTrash}
                    className="text-[10px] text-rose-400 hover:text-rose-300 px-2 py-1 rounded bg-[#2C2C2E] hover:bg-[#38383B] transition-colors cursor-pointer"
                  >
                    Alle leeren
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDeletedTrash((prev) => !prev)}
                  className="p-1 text-[#8E8E93] hover:text-white cursor-pointer"
                >
                  {showDeletedTrash ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {showDeletedTrash && (
              <div className="p-3 pt-0 border-t border-[#2C2C2E]/80">
                {deletedList.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#71717A]">
                    <p className="text-xl mb-1">🗑️</p>
                    <p className="font-medium">Keine gelöschten Vokabeln vorhanden.</p>
                    <p className="text-[11px] text-[#52525B] mt-0.5">
                      Sobald du Vokabeln oder Lektionen entfernst, landen sie hier.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto divide-y divide-[#2C2C2E] pt-2">
                    {deletedList.map((entry) => {
                      const v = entry.vocab;
                      const isRestoring = restoringId === v.id;
                      return (
                        <div
                          key={v.id}
                          className="pt-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium truncate">
                                {v.german}
                              </span>
                              <span className="text-[#8E8E93]">&rarr;</span>
                              <span className="text-[#FF7A00] font-thai truncate font-medium">
                                {v.thai}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#71717A]">
                              <span className="truncate max-w-[120px]">
                                {v.lesson || 'Allgemein'}
                              </span>
                              {v.romanization && (
                                <span className="italic truncate max-w-[100px]">
                                  ({v.romanization})
                                </span>
                              )}
                              {entry.previousProgress && (
                                <span className="text-amber-400/80">
                                  P{entry.previousProgress.phase}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Wiederherstellen Button */}
                            <button
                              type="button"
                              onClick={() => handleRestoreItem(v.id, v.german)}
                              disabled={isRestoring}
                              className="px-2.5 py-1 rounded-lg bg-[#FF7A00] hover:bg-[#FF881A] text-black font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                              title="Vokabel wiederherstellen"
                            >
                              <RotateCcw className={`w-3 h-3 ${isRestoring ? 'animate-spin' : ''}`} />
                              <span>{isRestoring ? '...' : 'Wiederherstellen'}</span>
                            </button>

                            {/* Endgültig löschen Button */}
                            <button
                              type="button"
                              onClick={() => handlePermanentDelete(v.id)}
                              className="p-1 rounded-md text-[#71717A] hover:text-rose-400 hover:bg-[#2C2C2E] transition-colors cursor-pointer"
                              title="Endgültig vernichten"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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

        {/* CSV & JSON Import Section */}
        <div className="bg-[#242426] rounded-2xl p-4 border border-[#323236]">
          <h2 className="text-xs font-semibold text-[#8E8E93] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Upload className="w-4 h-4 text-[#FF7A00]" />
            CSV & JSON Vokabeln Importieren
          </h2>
          <p className="text-xs text-[#A1A1AA] mb-3">
            Lade CSV-Dateien oder JSON-Backups hoch. <br />
            <span className="text-[11px] text-[#8E8E93]">
              Die Phase (1-6) wird beim Import für dein persönliches Profil übernommen. Für andere Lerner starten die Vokabeln in Phase 1.
            </span>
          </p>

          <input
            type="file"
            accept=".csv, .json, text/csv, application/json, text/plain"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 px-4 rounded-xl border border-dashed border-[#444448] bg-[#1C1C1E] hover:border-[#FF7A00] hover:bg-[#242426] transition-colors text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#FF7A00]" />
            <span>CSV- oder JSON-Datei auswählen...</span>
          </button>

          {/* Import status toast */}
          {importStatus && (
            <div className="mt-3 p-2.5 rounded-xl bg-[#1C1C1E] border border-[#323236] text-xs text-[#D1D1D6] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{importStatus}</span>
            </div>
          )}

          {/* CSV Format Documentation & Example */}
          <div className="mt-3.5 bg-[#1C1C1E] rounded-xl border border-[#3A3A3D] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCsvFormatGuide((prev) => !prev)}
              className="w-full p-3 flex items-center justify-between text-left hover:bg-[#222225] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#FF7A00]" />
                <span className="text-xs font-semibold text-white">
                  Erwartetes CSV-Format & Spaltenaufbau
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-[#8E8E93]">
                <span>{showCsvFormatGuide ? 'Einklappen' : 'Anzeigen'}</span>
                {showCsvFormatGuide ? (
                  <ChevronUp className="w-3.5 h-3.5 text-[#8E8E93]" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-[#8E8E93]" />
                )}
              </div>
            </button>

            {showCsvFormatGuide && (
              <div className="px-3.5 pb-3.5 pt-1 text-xs border-t border-[#2C2C2E]/80 space-y-3">
                <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                  Deine CSV-Datei kann mit Excel, Google Sheets, Numbers oder einem Texteditor erstellt werden.
                  Unterstützte Trennzeichen: <strong className="text-white">Semikolon (;)</strong>, Komma (,) oder Tabulator (UTF-8).
                </p>

                {/* Spalten-Übersicht */}
                <div className="space-y-1.5 text-[11px]">
                  <span className="font-semibold text-[#8E8E93] uppercase tracking-wider text-[10px] block">
                    Spalten-Reihenfolge (Headerzeile optional):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    <div className="p-2 rounded-lg bg-[#242426] border border-[#2E2E32]">
                      <span className="text-[#FF7A00] font-bold">1. Deutsch</span> <span className="text-rose-400 text-[10px]">*Pflicht</span>
                      <p className="text-[#8E8E93] text-[10px]">Deutsche Übersetzung (z. B. „Hallo“)</p>
                    </div>
                    <div className="p-2 rounded-lg bg-[#242426] border border-[#2E2E32]">
                      <span className="text-[#FF7A00] font-bold">2. Thai</span> <span className="text-rose-400 text-[10px]">*Pflicht</span>
                      <p className="text-[#8E8E93] text-[10px]">Thai-Schriftzeichen (z. B. „สวัสดี“)</p>
                    </div>
                    <div className="p-2 rounded-lg bg-[#242426] border border-[#2E2E32]">
                      <span className="text-white font-semibold">3. Romanisierung</span>
                      <p className="text-[#8E8E93] text-[10px]">Lautschrift / Umschrift (z. B. „sa-wat-dee“)</p>
                    </div>
                    <div className="p-2 rounded-lg bg-[#242426] border border-[#2E2E32]">
                      <span className="text-white font-semibold">4. Lektion</span>
                      <p className="text-[#8E8E93] text-[10px]">Lektionsname (z. B. „Begrüßung“)</p>
                    </div>
                    <div className="p-2 rounded-lg bg-[#242426] border border-[#2E2E32]">
                      <span className="text-[#8E8E93] font-medium">5. Beispielsatz Thai</span>
                      <p className="text-[#8E8E93] text-[10px]">Optional (z. B. „สวัสดีครับ“)</p>
                    </div>
                    <div className="p-2 rounded-lg bg-[#242426] border border-[#2E2E32]">
                      <span className="text-[#8E8E93] font-medium">6. Beispielsatz Deutsch</span>
                      <p className="text-[#8E8E93] text-[10px]">Optional (z. B. „Hallo höflich“)</p>
                    </div>
                    <div className="p-2 rounded-lg bg-[#242426] border border-[#2E2E32] sm:col-span-2">
                      <span className="text-amber-400 font-bold">7. Phase (1 bis 6)</span>
                      <p className="text-[#8E8E93] text-[10px]">
                        Wird beim Import für <strong className="text-white">dein angemeldetes Profil</strong> direkt als Leitner-Phase übernommen (1–6). Bei anderen Benutzern starten importierte Wörter standardmäßig in Phase 1.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Code-Beispiel */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-[#8E8E93] text-[10px] uppercase tracking-wider">
                      Beispiel-CSV (Inhalt):
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const sample = `Deutsch;Thai;Romanisierung;Lektion;Beispielsatz Thai;Beispielsatz Deutsch;Phase (1-6)\nHallo;สวัสดี;sa-wat-dee;Begrüßung;สวัสดีครับ;Hallo (höflich);1\nDanke;ขอบคุณ;khop-khun;Begrüßung;ขอบคุณมาก;Vielen Dank;2\nLecker;อร่อย;a-roi;Essen & Trinken;อาหารนี้อร่อยมาก;Dieses Essen ist sehr lecker;3`;
                        navigator.clipboard.writeText(sample);
                        setCopiedTemplate(true);
                        setTimeout(() => setCopiedTemplate(false), 2500);
                      }}
                      className="text-[10px] text-[#FF7A00] hover:text-[#FFA040] flex items-center gap-1 cursor-pointer font-medium"
                    >
                      {copiedTemplate ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Kopiert!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Muster kopieren</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="p-2.5 bg-[#121214] rounded-lg border border-[#2C2C2E] text-[10px] text-[#E4E4E7] overflow-x-auto font-mono leading-relaxed whitespace-pre selection:bg-[#FF7A00] selection:text-black">
Deutsch;Thai;Romanisierung;Lektion;Beispielsatz Thai;Beispielsatz Deutsch;Phase (1-6)
Hallo;สวัสดี;sa-wat-dee;Begrüßung;สวัสดีครับ;Hallo (höflich);1
Danke;ขอบคุณ;khop-khun;Begrüßung;ขอบคุณมาก;Vielen Dank;2
Lecker;อร่อย;a-roi;Essen & Trinken;อาหารนี้อร่อยมาก;Dieses Essen ist sehr lecker;3
                  </pre>
                </div>

                {/* Download Template Button */}
                <button
                  type="button"
                  onClick={downloadSampleCSVTemplate}
                  className="w-full py-2 px-3 rounded-lg bg-[#242426] hover:bg-[#2C2C2E] border border-[#3A3A3D] text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#FF7A00]" />
                  <span>Fertige Muster-CSV herunterladen (.csv)</span>
                </button>
              </div>
            )}
          </div>

          {/* Preview Table of Parsed CSV/JSON */}
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
                    <div className="min-w-0 pr-2">
                      <span className="text-white font-medium">{row.german}</span> &rarr;{' '}
                      <span className="text-[#FF7A00] font-thai">{row.thai}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FF7A00]/20 text-[#FF7A00] font-bold">
                        P{row.phase || 1}
                      </span>
                      <span className="text-[#8E8E93] text-[10px] truncate max-w-[80px]">
                        {row.lesson}
                      </span>
                    </div>
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
                  className="flex-1 py-2 rounded-lg bg-[#242426] text-xs text-[#8E8E93] hover:text-white cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={isImporting}
                  className="flex-1 py-2 rounded-lg bg-[#FF7A00] text-black font-semibold text-xs hover:bg-[#FF881A] cursor-pointer disabled:opacity-50"
                >
                  {isImporting ? 'Wird importiert...' : 'Import bestätigen'}
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
              <p className="text-[#D1D1D6] font-medium">iOS Systemschrift (Thonburi & Sarabun)</p>
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
