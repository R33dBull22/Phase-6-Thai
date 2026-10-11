import { Vocabulary, UserProgress } from '../types/vocab';

export interface ExportData {
  vocabularies: Vocabulary[];
  progress?: Record<string, UserProgress>;
  exportedAt: string;
  formatVersion: string;
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
  filenamePrefix = 'phase6_thai_vokabeln'
) {
  const headers = [
    'Deutsch',
    'Thai',
    'Romanisierung',
    'Lektion',
    'Beispielsatz Thai',
    'Beispielsatz Deutsch',
    'Aktuelle Phase (1-6)',
    'Nächste Wiederholung',
  ];

  const escapeCSV = (str: string | undefined | null) => {
    if (!str) return '""';
    const text = String(str).replace(/"/g, '""');
    return `"${text}"`;
  };

  const rows = vocabularies.map((v) => {
    const prog = userProgress ? userProgress[v.id] : undefined;
    return [
      escapeCSV(v.german),
      escapeCSV(v.thai),
      escapeCSV(v.romanization),
      escapeCSV(v.lesson),
      escapeCSV(v.exampleThai),
      escapeCSV(v.exampleGerman),
      escapeCSV(prog ? String(prog.phase) : 'Nicht im Deck'),
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
  filenamePrefix = 'phase6_thai_backup'
) {
  const exportPayload: ExportData = {
    vocabularies,
    progress: userProgress,
    exportedAt: new Date().toISOString(),
    formatVersion: '1.0',
  };

  const jsonContent = JSON.stringify(exportPayload, null, 2);
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(jsonContent, `${filenamePrefix}_${dateStr}.json`, 'application/json;charset=utf-8;');
}

export interface ParsedCSVRow {
  german: string;
  thai: string;
  romanization?: string;
  lesson: string;
  exampleThai?: string;
  exampleGerman?: string;
  isValid: boolean;
  error?: string;
}

/**
 * Parses user uploaded CSV text with flexible delimiters (; or , or \t)
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

  const startIndex = isHeader ? 1 : 0;
  const result: ParsedCSVRow[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length === 0 || cols.every((c) => !c)) continue;

    // Expected order: Deutsch, Thai, Romanisierung, Lektion, [exThai], [exGerman]
    const german = cols[0] || '';
    const thai = cols[1] || '';
    const romanization = cols[2] || '';
    const lesson = cols[3] || 'Importierte Vokabeln';
    const exampleThai = cols[4] || '';
    const exampleGerman = cols[5] || '';

    const isValid = Boolean(german.trim() && thai.trim());
    result.push({
      german,
      thai,
      romanization,
      lesson: lesson.trim() || 'Importierte Vokabeln',
      exampleThai,
      exampleGerman,
      isValid,
      error: !isValid ? 'Deutsch und Thai-Feld dürfen nicht leer sein' : undefined,
    });
  }

  return result;
}
