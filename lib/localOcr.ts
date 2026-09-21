import { recognizeText, isSupported } from 'expo-mlkit-ocr';
import { convertPages, getPdfInfo } from '@uzimandias/react-native-pdf-to-image';

export type LocalCandidate = {
  candidate_type: 'academic_item' | 'calendar_event' | 'material' | 'payment' | 'note';
  title: string;
  description?: string | null;
  starts_at?: string | null;
  due_at?: string | null;
  confidence?: number;
  academic_type?: string;
  subject?: string | null;
  priority?: string;
  materials?: string[];
};

export type LocalOcrResult = {
  text: string;
  candidates: LocalCandidate[];
  pageCount: number;
  processedPages: number;
  provider: 'on-device-mlkit';
  durationMs: number;
};

export type OcrFailureCode =
  | 'unsupported_device'
  | 'no_text'
  | 'file_invalid'
  | 'pdf_read_failed'
  | 'ocr_failed';

export class LocalOcrError extends Error {
  readonly code: OcrFailureCode;

  constructor(code: OcrFailureCode, message: string) {
    super(message);
    this.name = 'LocalOcrError';
    this.code = code;
  }
}

const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11,
};

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const SUBJECTS: Array<[RegExp, string]> = [
  [/matem[aá]tic/i, 'Matemática'], [/lenguaje|lengua y literatura/i, 'Lenguaje'],
  [/ciencias? naturales|ciencias?/i, 'Ciencias'], [/historia|geograf/i, 'Historia'],
  [/ingl[eé]s|english/i, 'Inglés'], [/tecnolog/i, 'Tecnología'], [/m[uú]sica/i, 'Música'],
  [/arte|artes visuales/i, 'Artes'], [/educaci[oó]n f[ií]sica|ed\. fisica/i, 'Educación Física'],
  [/relig/i, 'Religión'], [/computaci[oó]n|inform[aá]tica/i, 'Computación'],
];

const ACADEMIC_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(prueba|evaluaci[oó]n|control)\b/i, 'test'], [/\bexamen\b/i, 'exam'],
  [/\b(proyecto|trabajo|disertaci[oó]n|presentaci[oó]n)\b/i, 'project'],
  [/\b(tarea|gu[ií]a|actividad|ejercicio|lectura)\b/i, 'task'],
];

const EVENT_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(reuni[oó]n|citaci[oó]n|entrevista)\b/i, 'school'], [/\b(salida pedag[oó]gica|paseo|visita)\b/i, 'school'],
  [/\b(entrenamiento|partido|taller deportivo)\b/i, 'sport'], [/\b(dentista|m[eé]dico|control de salud)\b/i, 'health'],
];

type DateHint = { month?: number; year?: number };

type OcrBox = { x: number; y: number; width: number; height: number };
type OcrLine = { text: string; boundingBox: OcrBox };
type Recognition = { text: string; blocks?: Array<{ text: string; boundingBox: OcrBox; lines?: OcrLine[] }> };

function stripAccents(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function compact(value: string) {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function titleFromLine(line: string, fallback: string) {
  const cleaned = line.replace(/^[•\-*–—\s]+/, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return fallback;
  return cleaned.length > 150 ? `${cleaned.slice(0, 147)}…` : cleaned;
}

function subjectFromText(text: string) {
  for (const [pattern, label] of SUBJECTS) if (pattern.test(text)) return label;
  const explicit = text.match(/(?:asignatura|ramo|materia)\s*[:\-]\s*([^\n,.;]{2,45})/i);
  return explicit?.[1]?.trim() ?? null;
}

function nextWeekday(target: number) {
  const now = new Date();
  let diff = target - now.getDay();
  if (diff <= 0) diff += 7;
  const result = new Date(now);
  result.setDate(result.getDate() + diff);
  result.setHours(18, 0, 0, 0);
  return result;
}

function documentDateHint(text: string): DateHint {
  const normalized = stripAccents(text.toLowerCase());
  const monthMatch = normalized.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/);
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  return {
    month: monthMatch?.[1] ? MONTHS[monthMatch[1]] : undefined,
    year: yearMatch?.[1] ? Number(yearMatch[1]) : undefined,
  };
}

function normalizeYear(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return parsed < 100 ? parsed + 2000 : parsed;
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(year, month, day, 18, 0, 0, 0);
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

function rollForwardIfYearMissing(date: Date, explicitYear: boolean) {
  if (!explicitYear && date.getTime() < Date.now() - 86_400_000) date.setFullYear(date.getFullYear() + 1);
  return date;
}

function dateFromText(text: string, hint: DateHint = {}): Date | null {
  const normalized = stripAccents(text.toLowerCase());
  const fallbackYear = hint.year ?? new Date().getFullYear();

  const numeric = normalized.match(/\b([0-3]?\d)[\/\-.]([01]?\d)(?:[\/\-.](20\d{2}|\d{2}))?\b/);
  if (numeric?.[1] && numeric[2]) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    const year = normalizeYear(numeric[3], fallbackYear);
    const date = validDate(year, month, day);
    if (date) return rollForwardIfYearMissing(date, Boolean(numeric[3] || hint.year));
  }

  const named = normalized.match(/\b([0-3]?\d)\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(20\d{2}))?\b/);
  if (named?.[1] && named[2]) {
    const day = Number(named[1]);
    const month = MONTHS[named[2]];
    const year = normalizeYear(named[3], fallbackYear);
    if (month !== undefined) {
      const date = validDate(year, month, day);
      if (date) return rollForwardIfYearMissing(date, Boolean(named[3] || hint.year));
    }
  }

  const weekdayDay = normalized.match(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\s+([0-3]?\d)(?:\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre))?(?:\s+(?:de\s+)?(20\d{2}))?\b/);
  if (weekdayDay?.[1] && weekdayDay[2]) {
    const day = Number(weekdayDay[2]);
    const month = weekdayDay[3] ? MONTHS[weekdayDay[3]] : hint.month;
    const year = normalizeYear(weekdayDay[4], fallbackYear);
    if (month !== undefined) {
      const date = validDate(year, month, day);
      if (date) return rollForwardIfYearMissing(date, Boolean(weekdayDay[4] || hint.year));
    }
  }

  const labelledDay = normalized.match(/\b(?:fecha|dia|entrega|vence)\s*[:\-]?\s*([0-3]?\d)\b/);
  if (labelledDay?.[1] && hint.month !== undefined) {
    const day = Number(labelledDay[1]);
    const date = validDate(fallbackYear, hint.month, day);
    if (date) return rollForwardIfYearMissing(date, Boolean(hint.year));
  }

  for (const [word, day] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${word}\\b`).test(normalized)) return nextWeekday(day);
  }

  if (/\bmanana\b/.test(normalized)) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(18, 0, 0, 0);
    return date;
  }
  return null;
}

function hasActionKeyword(line: string) {
  return ACADEMIC_KEYWORDS.some(([pattern]) => pattern.test(line)) || EVENT_KEYWORDS.some(([pattern]) => pattern.test(line));
}

function isDateAnchorLine(line: string, hint: DateHint) {
  if (!dateFromText(line, hint)) return false;
  const normalized = stripAccents(line.toLowerCase()).trim();
  if (/^(fecha|dia|entrega|vence|para)\b/.test(normalized)) return true;
  if (/^(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/.test(normalized)) return true;
  if (/^\s*[0-3]?\d[\/\-.][01]?\d/.test(normalized)) return true;
  if (/^\s*[0-3]?\d\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/.test(normalized)) return true;
  return line.length <= 28 && !hasActionKeyword(line);
}

function isDateDetailLine(line: string | undefined, hint: DateHint) {
  if (!line || !dateFromText(line, hint)) return false;
  const normalized = stripAccents(line.toLowerCase()).trim();
  return /^(fecha|dia|entrega|vence|para)\b/.test(normalized) || line.length <= 24;
}

function timeFromText(text: string) {
  const match = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:hrs?|h)?\b/i);
  if (!match?.[1] || !match[2]) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function applyTime(date: Date | null, text: string) {
  if (!date) return null;
  const resolved = new Date(date.getTime());
  const time = timeFromText(text);
  if (time) resolved.setHours(time.hour, time.minute, 0, 0);
  return resolved.toISOString();
}

function materialsFromText(text: string) {
  const match = text.match(/\b(?:traer|llevar|material(?:es)?|necesita(?:n)?|con)\b\s*[:\-]?\s*([^\n.;]{3,220})/i);
  const raw = match?.[1];
  if (!raw) return [];
  return raw
    .split(/,|\by\b|\+|\//i)
    .map(item => item.replace(/^(un|una|el|la|los|las)\s+/i, '').trim())
    .filter(item => item.length >= 2 && item.length <= 120)
    .slice(0, 12);
}


function candidatesForCalendarCell(cellText: string, date: Date): LocalCandidate[] {
  const lines = compact(cellText).split('\n').map(v => v.trim()).filter(Boolean);
  const candidates: LocalCandidate[] = [];
  const subject = subjectFromText(cellText);
  const materials = materialsFromText(cellText);
  const when = applyTime(date, cellText);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const context = [lines[i - 1], line, lines[i + 1]].filter(Boolean).join(' · ');
    let academicType: string | null = null;
    for (const [pattern, type] of ACADEMIC_KEYWORDS) if (pattern.test(line)) { academicType = type; break; }
    if (academicType) {
      candidates.push({
        candidate_type: 'academic_item',
        title: titleFromLine(line, academicType === 'test' ? 'Prueba del colegio' : 'Pendiente del colegio'),
        description: context === line ? null : context,
        due_at: when,
        confidence: .97,
        academic_type: academicType,
        subject,
        priority: academicType === 'test' || academicType === 'exam' ? 'high' : 'normal',
        materials,
      });
      continue;
    }
    let category: string | null = null;
    for (const [pattern, value] of EVENT_KEYWORDS) if (pattern.test(line)) { category = value; break; }
    if (category) candidates.push({
      candidate_type: 'calendar_event',
      title: titleFromLine(line, 'Actividad del colegio'),
      description: context === line ? null : context,
      starts_at: when,
      confidence: .97,
      subject: category,
    });
  }
  return candidates;
}

function parseCalendarLayout(recognition: Recognition): LocalCandidate[] {
  const hint = documentDateHint(recognition.text || '');
  if (hint.month === undefined || hint.year === undefined) return [];
  const lines = (recognition.blocks ?? []).flatMap(block => block.lines ?? []);
  if (lines.length < 8) return [];

  const normalized = (v: string) => stripAccents(v.toLowerCase()).trim();
  const weekdayHeaders = lines.filter(line => /^(lunes|martes|miercoles|jueves|viernes)$/.test(normalized(line.text)));
  if (weekdayHeaders.length < 4) return [];

  const headerY = Math.max(...weekdayHeaders.map(line => line.boundingBox.y + line.boundingBox.height));
  const centers = weekdayHeaders
    .map(line => ({ name: normalized(line.text), x: line.boundingBox.x + line.boundingBox.width / 2 }))
    .sort((a, b) => a.x - b.x);
  const expected = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
  const columnCenters = expected.map((day, index) => centers.find(item => item.name === day)?.x ?? centers[index]?.x).filter((x): x is number => Number.isFinite(x));
  if (columnCenters.length !== 5) return [];

  const boundaries = [-Infinity,
    (columnCenters[0]! + columnCenters[1]!) / 2,
    (columnCenters[1]! + columnCenters[2]!) / 2,
    (columnCenters[2]! + columnCenters[3]!) / 2,
    (columnCenters[3]! + columnCenters[4]!) / 2,
    Infinity];

  const dateAnchors = lines
    .filter(line => line.boundingBox.y > headerY && /^(?:[1-9]|[12]\d|3[01])$/.test(line.text.trim()))
    .map(line => {
      const x = line.boundingBox.x + line.boundingBox.width / 2;
      const col = boundaries.findIndex((_, i) => i < 5 && x >= boundaries[i]! && x < boundaries[i + 1]!);
      return { day: Number(line.text.trim()), col, y: line.boundingBox.y, line };
    })
    .filter(anchor => anchor.col >= 0 && anchor.col < 5);

  if (dateAnchors.length < 5) return [];

  const rowYs: number[] = [];
  for (const anchor of [...dateAnchors].sort((a, b) => a.y - b.y)) {
    const tolerance = Math.max(18, anchor.line.boundingBox.height * 1.8);
    if (!rowYs.some(y => Math.abs(y - anchor.y) <= tolerance)) rowYs.push(anchor.y);
  }
  rowYs.sort((a, b) => a - b);

  const candidates: LocalCandidate[] = [];
  const seen = new Set<string>();
  for (const anchor of dateAnchors) {
    const row = rowYs.reduce((best, y, idx) => Math.abs(y - anchor.y) < Math.abs(rowYs[best]! - anchor.y) ? idx : best, 0);
    const top = rowYs[row]! - Math.max(8, anchor.line.boundingBox.height);
    const bottom = row + 1 < rowYs.length ? (rowYs[row]! + rowYs[row + 1]!) / 2 : Infinity;
    const cellLines = lines
      .filter(line => {
        const cx = line.boundingBox.x + line.boundingBox.width / 2;
        const cy = line.boundingBox.y + line.boundingBox.height / 2;
        return cx >= boundaries[anchor.col]! && cx < boundaries[anchor.col + 1]! && cy >= top && cy < bottom && line !== anchor.line;
      })
      .filter(line => !/^(lunes|martes|miercoles|jueves|viernes|\d{1,2})$/i.test(normalized(line.text)))
      .sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);

    const date = validDate(hint.year, hint.month, anchor.day);
    if (!date || cellLines.length === 0) continue;
    const cellText = cellLines.map(line => line.text).join('\n');
    for (const candidate of candidatesForCalendarCell(cellText, date)) {
      const key = [candidate.candidate_type, candidate.title.toLowerCase(), candidate.due_at ?? candidate.starts_at ?? ''].join(':');
      if (!seen.has(key)) { seen.add(key); candidates.push(candidate); }
    }
  }
  return candidates.slice(0, 40);
}

export function parseSchoolText(rawText: string): LocalCandidate[] {
  const text = compact(rawText);
  if (!text) return [];

  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const candidates: LocalCandidate[] = [];
  const seen = new Set<string>();
  const hint = documentDateHint(text);
  let activeDate: Date | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    const previous = lines[index - 1];
    const next = lines[index + 1];
    const lineDate = dateFromText(line, hint);
    if (lineDate && isDateAnchorLine(line, hint)) activeDate = lineDate;

    const previousDate = isDateDetailLine(previous, hint) ? dateFromText(previous as string, hint) : null;
    const nextDate = isDateDetailLine(next, hint) ? dateFromText(next as string, hint) : null;
    const resolvedDate = lineDate ?? previousDate ?? activeDate ?? nextDate;
    const timingContext = [previousDate ? previous : null, line, !activeDate && nextDate ? next : null]
      .filter((value): value is string => Boolean(value))
      .join(' · ');

    const context = [previous, line, next]
      .filter((value): value is string => Boolean(value))
      .join(' · ');
    const subject = subjectFromText(context) ?? subjectFromText(text);
    const when = applyTime(resolvedDate, timingContext);
    const materials = materialsFromText(context);

    let academicType: string | null = null;
    for (const [pattern, type] of ACADEMIC_KEYWORDS) {
      if (pattern.test(line)) {
        academicType = type;
        break;
      }
    }

    if (academicType) {
      const title = titleFromLine(line, academicType === 'test' ? 'Prueba del colegio' : 'Pendiente del colegio');
      const key = `a:${title.toLowerCase()}:${when ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          candidate_type: 'academic_item',
          title,
          description: context === line ? null : context,
          due_at: when,
          confidence: when ? .88 : .76,
          academic_type: academicType,
          subject,
          priority: academicType === 'test' || academicType === 'exam' ? 'high' : 'normal',
          materials,
        });
      }
      continue;
    }

    let eventCategory: string | null = null;
    for (const [pattern, category] of EVENT_KEYWORDS) {
      if (pattern.test(line)) {
        eventCategory = category;
        break;
      }
    }

    if (eventCategory) {
      const title = titleFromLine(line, 'Actividad del colegio');
      const key = `e:${title.toLowerCase()}:${when ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          candidate_type: 'calendar_event',
          title,
          description: context === line ? null : context,
          starts_at: when,
          confidence: when ? .86 : .70,
          subject: eventCategory,
        });
      }
    }
  }

  // Texto legible sin candidatos es un estado válido y distinto de OCR vacío.
  // No fabricamos una nota ni una fecha global para ocultar ambigüedad del documento.
  return candidates.slice(0, 20);
}

async function ocrImage(uri: string): Promise<Recognition> {
  if (!isSupported()) {
    throw new LocalOcrError('unsupported_device', 'OCR no está disponible en esta instalación. Usa la beta nativa de After.');
  }

  try {
    const result = await recognizeText(uri);
    return { ...result, text: compact(result.text ?? '') } as Recognition;
  } catch (error) {
    if (error instanceof LocalOcrError) throw error;
    throw new LocalOcrError('ocr_failed', 'No pudimos procesar la imagen. Intenta nuevamente.');
  }
}

export async function runLocalOcr(uri: string, mimeType: string): Promise<LocalOcrResult> {
  const startedAt = Date.now();
  let text = '';
  let pageCount = 1;
  let processedPages = 1;

  if (!uri || !mimeType) {
    throw new LocalOcrError('file_invalid', 'El archivo no es válido.');
  }

  if (mimeType === 'application/pdf') {
    try {
      const info = await getPdfInfo(uri);
      pageCount = info.pageCount;
      const lastPage = Math.min(Math.max(info.pageCount - 1, 0), 7);
      const pages = await convertPages(uri, 0, lastPage, { format: 'jpeg', maxWidth: 2200, quality: .9, output: 'file' });
      processedPages = pages.length;
      const chunks: string[] = [];
      for (const page of pages) {
        const pageResult = await ocrImage(page.uri);
        if (pageResult.text) chunks.push(`--- Página ${page.page + 1} ---\n${pageResult.text}`);
      }
      text = compact(chunks.join('\n\n'));
    } catch (error) {
      if (error instanceof LocalOcrError) throw error;
      throw new LocalOcrError('pdf_read_failed', 'No pudimos convertir este PDF para leerlo. Prueba con una foto o un PDF más simple.');
    }
  } else if (mimeType.startsWith('image/')) {
    const recognition = await ocrImage(uri);
    text = recognition.text;
    const structured = parseCalendarLayout(recognition);
    if (structured.length) {
      return {
        text,
        candidates: structured,
        pageCount,
        processedPages,
        provider: 'on-device-mlkit',
        durationMs: Date.now() - startedAt,
      };
    }
  } else {
    throw new LocalOcrError('file_invalid', 'After sólo puede leer imágenes y PDF en este flujo.');
  }

  if (!text) {
    throw new LocalOcrError('no_text', 'No pudimos leer texto. Prueba una foto más clara, frontal y con buena luz.');
  }

  return {
    text,
    candidates: parseSchoolText(text),
    pageCount,
    processedPages,
    provider: 'on-device-mlkit',
    durationMs: Date.now() - startedAt,
  };
}
