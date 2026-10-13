import { Vocabulary, UserProgress } from '../types/vocab';
import { getDirectionProgress } from '../utils/leitner';

export interface ExportData {
  vocabularies: (Vocabulary & { phase?: number; phaseDeToTh?: number; phaseThToDe?: number })[];
  progress?: Record<string, UserProgress>;
  exportedAt: string;
  formatVersion: string;
  appName: string;
}

/**
 * Downloads a string content as a file in the browser
 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 1-Click CSV Export with UTF-8 BOM for flawless Excel & Sheets Thai character support
 */
export function exportToCSV(
  vocabularies: Vocabulary[],
  userProgress?: Record<string, UserProgress>,
  filenamePrefix = 'thai_hasis_vokabeln'
) {
  const headers = [
    'Deutsch',
    'Thai',
    'Romanisierung',
    'Lektion',
    'Beispielsatz Thai',
    'Beispielsatz Deutsch',
    'Phase (1-6)',
    'Phase DE->TH',
    'Phase TH->DE',
    'Nächste Wiederholung',
  ];

  const escapeCSV = (str: string | undefined | null) => {
    if (!str) return '""';
    const text = String(str).replace(/"/g, '""');
    return `"${text}"`;
  };

  const rows = vocabularies.map((v) => {
    const prog = userProgress ? userProgress[v.id] : undefined;
    const currentPhase = prog ? prog.phase : 1;
    const dePhase = prog ? getDirectionProgress(prog, 'de_to_th').phase : 1;
    const thPhase = prog ? getDirectionProgress(prog, 'th_to_de').phase : 1;

    return [
      escapeCSV(v.german),
      escapeCSV(v.thai),
      escapeCSV(v.romanization),
      escapeCSV(v.lesson),
      escapeCSV(v.exampleThai),
      escapeCSV(v.exampleGerman),
      escapeCSV(String(currentPhase)),
      escapeCSV(String(dePhase)),
      escapeCSV(String(thPhase)),
      escapeCSV(prog?.nextReviewDate || ''),
    ].join(';');
  });

  // Prepend UTF-8 BOM (\uFEFF)
  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(csvContent, `${filenamePrefix}_${dateStr}.csv`, 'text/csv;charset=utf-8;');
}

/**
 * 1-Click JSON Export for complete data backup
 */
export function exportToJSON(
  vocabularies: Vocabulary[],
  userProgress?: Record<string, UserProgress>,
  filenamePrefix = 'thai_hasis_backup'
) {
  const exportPayload: ExportData = {
    appName: 'Thai Hasis Vokabeltrainer',
    vocabularies: vocabularies.map((v) => {
      const prog = userProgress ? userProgress[v.id] : undefined;
      return {
        ...v,
        phase: prog ? prog.phase : 1,
      };
    }),
    progress: userProgress,
    exportedAt: new Date().toISOString(),
    formatVersion: '2.0',
  };

  const jsonContent = JSON.stringify(exportPayload, null, 2);
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(jsonContent, `${filenamePrefix}_${dateStr}.json`, 'application/json;charset=utf-8;');
}

/**
 * Downloads a sample CSV template for users to easily fill in
 */
export function downloadSampleCSVTemplate() {
  const sampleContent =
    '\uFEFF' +
    [
      'Deutsch;Thai;Romanisierung;Lektion;Beispielsatz Thai;Beispielsatz Deutsch;Phase (1-6)',
      'Hallo;สวัสดี;sa-wat-dee;Begrüßung;สวัสดีครับ;Hallo (höflich);1',
      'Danke;ขอบคุณ;khop-khun;Begrüßung;ขอบคุณมาก;Vielen Dank;2',
      'Wie geht es dir?;สบายดีไหม;sa-baai-dee-mai;Begrüßung;สบายดีครับ;Mir geht es gut;1',
      'Lecker;อร่อย;a-roi;Essen & Trinken;อาหารนี้อร่อยมาก;Dieses Essen ist sehr lecker;3',
      'Wasser;น้ำ;nam;Essen & Trinken;ขอน้ำเปล่าแก้วหนึ่ง;Bitte ein Glas stilles Wasser;1',
    ].join('\r\n');

  downloadFile(sampleContent, 'thai_hasis_muster_vorlage.csv', 'text/csv;charset=utf-8;');
}

export interface ParsedCSVRow {
  german: string;
  thai: string;
  romanization?: string;
  lesson: string;
  exampleThai?: string;
  exampleGerman?: string;
  phase?: number;
  phaseDeToTh?: number;
  phaseThToDe?: number;
  isValid: boolean;
  error?: string;
}

/**
 * Parses user uploaded CSV text with flexible delimiters (; or , or \t) and Phase detection
 */
export function parseCSVContent(text: string): ParsedCSVRow[] {
  // Strip BOM if present
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.substring(1);
  }

  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Determine delimiter from first line
  const firstLine = lines[0];
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ';';
  if (commaCount > semicolonCount && commaCount > tabCount) delimiter = ',';
  if (tabCount > semicolonCount && tabCount > commaCount) delimiter = '\t';

  // Helper to split row respecting quotes
  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  // Check if first row is header
  const firstCols = parseLine(firstLine).map((c) => c.toLowerCase());
  const isHeader =
    firstCols.some((c) => c.includes('deutsch') || c.includes('german') || c.includes('wort')) ||
    firstCols.some((c) => c.includes('thai')) ||
    firstCols.some((c) => c.includes('lektion') || c.includes('lesson'));

  // Look for phase columns in header
  let phaseColIndex = -1;
  let phaseDeColIndex = -1;
  let phaseThColIndex = -1;

  if (isHeader) {
    phaseDeColIndex = firstCols.findIndex(
      (c) => (c.includes('de') && (c.includes('th') || c.includes('thai'))) || c.includes('de->th') || c.includes('de➔th')
    );
    phaseThColIndex = firstCols.findIndex(
      (c) => (c.includes('th') && (c.includes('de') || c.includes('deutsch'))) || c.includes('th->de') || c.includes('th➔de')
    );
    phaseColIndex = firstCols.findIndex(
      (c) =>
        (c.includes('phase') || c.includes('stufe') || c.includes('leitner')) &&
        c !== firstCols[phaseDeColIndex] &&
        c !== firstCols[phaseThColIndex]
    );
  }

  const startIndex = isHeader ? 1 : 0;
  const result: ParsedCSVRow[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length === 0 || cols.every((c) => !c)) continue;

    // Expected order: Deutsch, Thai, Romanisierung, Lektion, [exThai], [exGerman], [Phase]
    const german = cols[0] || '';
    const thai = cols[1] || '';
    const romanization = cols[2] || '';
    const lesson = cols[3] || 'Importierte Vokabeln';
    const exampleThai = cols[4] || '';
    const exampleGerman = cols[5] || '';

    // Check for general phase
    let parsedPhase: number | undefined;
    if (phaseColIndex !== -1 && cols[phaseColIndex]) {
      const digitMatch = cols[phaseColIndex].match(/[1-6]/);
      if (digitMatch) parsedPhase = parseInt(digitMatch[0], 10);
    } else if (cols[6]) {
      const digitMatch = cols[6].match(/[1-6]/);
      if (digitMatch) parsedPhase = parseInt(digitMatch[0], 10);
    } else if (cols.length === 5 && cols[4] && /^[1-6]$/.test(cols[4].trim())) {
      parsedPhase = parseInt(cols[4].trim(), 10);
    }

    // Check for directional phases
    let parsedDePhase: number | undefined;
    let parsedThPhase: number | undefined;
    if (phaseDeColIndex !== -1 && cols[phaseDeColIndex]) {
      const digitMatch = cols[phaseDeColIndex].match(/[1-6]/);
      if (digitMatch) parsedDePhase = parseInt(digitMatch[0], 10);
    } else if (cols[7] && /^[1-6]$/.test(cols[7].trim())) {
      parsedDePhase = parseInt(cols[7].trim(), 10);
    }

    if (phaseThColIndex !== -1 && cols[phaseThColIndex]) {
      const digitMatch = cols[phaseThColIndex].match(/[1-6]/);
      if (digitMatch) parsedThPhase = parseInt(digitMatch[0], 10);
    } else if (cols[8] && /^[1-6]$/.test(cols[8].trim())) {
      parsedThPhase = parseInt(cols[8].trim(), 10);
    }

    const basePhase = parsedPhase || 1;
    const finalDePhase = parsedDePhase || basePhase;
    const finalThPhase = parsedThPhase || basePhase;

    const isValid = Boolean(german.trim() && thai.trim());
    result.push({
      german,
      thai,
      romanization,
      lesson: lesson.trim() || 'Importierte Vokabeln',
      exampleThai,
      exampleGerman,
      phase: Math.min(finalDePhase, finalThPhase),
      phaseDeToTh: finalDePhase,
      phaseThToDe: finalThPhase,
      isValid,
      error: !isValid ? 'Deutsch und Thai-Feld dürfen nicht leer sein' : undefined,
    });
  }

  return result;
}

/**
 * Parses user uploaded JSON backup content with full Phase support
 */
export function parseJSONContent(text: string): ParsedCSVRow[] {
  try {
    const data = JSON.parse(text);
    const vocabList: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data.vocabularies)
      ? data.vocabularies
      : [];
    const progressMap = data.progress || {};

    return vocabList.map((item: any) => {
      const german = item.german || '';
      const thai = item.thai || '';
      let phase: number = 1;

      if (typeof item.phase === 'number' && item.phase >= 1 && item.phase <= 6) {
        phase = item.phase;
      } else if (item.id && progressMap[item.id]?.phase) {
        phase = progressMap[item.id].phase;
      }

      const isValid = Boolean(german.trim() && thai.trim());
      return {
        german,
        thai,
        romanization: item.romanization || '',
        lesson: item.lesson || 'Importierte Vokabeln',
        exampleThai: item.exampleThai || '',
        exampleGerman: item.exampleGerman || '',
        phase,
        isValid,
        error: !isValid ? 'Deutsch und Thai-Feld dürfen nicht leer sein' : undefined,
      };
    });
  } catch (err) {
    console.warn('Error parsing JSON backup content:', err);
    return [];
  }
}
