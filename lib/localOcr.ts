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
};

const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11,
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

function stripAccents(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function compact(value: string) { return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); }
function titleFromLine(line: string, fallback: string) { const cleaned=line.replace(/^[•\-*–—\s]+/,'').replace(/\s+/g,' ').trim(); if(!cleaned)return fallback; return cleaned.length>150?`${cleaned.slice(0,147)}…`:cleaned; }
function subjectFromText(text:string){for(const [pattern,label] of SUBJECTS)if(pattern.test(text))return label;const explicit=text.match(/(?:asignatura|ramo|materia)\s*[:\-]\s*([^\n,.;]{2,45})/i);return explicit?.[1]?.trim()??null;}
function nextWeekday(target:number){const now=new Date();let diff=target-now.getDay();if(diff<=0)diff+=7;const result=new Date(now);result.setDate(result.getDate()+diff);return result;}

function dateFromText(text:string):Date|null{
  const numeric=text.match(/\b([0-3]?\d)[\/\-.]([01]?\d)(?:[\/\-.](20\d{2}|\d{2}))?\b/);
  if(numeric?.[1]&&numeric[2]){const day=Number(numeric[1]);const month=Number(numeric[2])-1;let year=numeric[3]?Number(numeric[3]):new Date().getFullYear();if(year<100)year+=2000;const d=new Date(year,month,day,18,0,0,0);if(!Number.isNaN(d.getTime())&&d.getDate()===day&&d.getMonth()===month){if(!numeric[3]&&d.getTime()<Date.now()-86_400_000)d.setFullYear(d.getFullYear()+1);return d;}}
  const named=stripAccents(text.toLowerCase()).match(/\b([0-3]?\d)\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(20\d{2}))?/);
  if(named?.[1]&&named[2]){const day=Number(named[1]);const month=MONTHS[named[2]];if(month!==undefined){const year=named[3]?Number(named[3]):new Date().getFullYear();const d=new Date(year,month,day,18,0,0,0);if(!named[3]&&d.getTime()<Date.now()-86_400_000)d.setFullYear(d.getFullYear()+1);return d;}}
  const normalized=stripAccents(text.toLowerCase());const weekdays:Array<[string,number]>=[['domingo',0],['lunes',1],['martes',2],['miercoles',3],['jueves',4],['viernes',5],['sabado',6]];for(const [word,day] of weekdays)if(new RegExp(`\\b${word}\\b`).test(normalized))return nextWeekday(day);if(/\bma[nñ]ana\b/i.test(text)){const d=new Date();d.setDate(d.getDate()+1);d.setHours(18,0,0,0);return d;}return null;
}

function timeFromText(text:string){const match=text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:hrs?|h)?\b/i);if(!match?.[1]||!match[2])return null;return{hour:Number(match[1]),minute:Number(match[2])};}
function applyTime(date:Date|null,text:string){if(!date)return null;const t=timeFromText(text);if(t)date.setHours(t.hour,t.minute,0,0);return date.toISOString();}
function materialsFromText(text:string){const match=text.match(/(?:traer|llevar|material(?:es)?|necesita(?:n)?|con)\s*[:\-]?\s*([^\n.;]{3,220})/i);const raw=match?.[1];if(!raw)return[];return raw.split(/,|\by\b|\+|\//i).map(item=>item.replace(/^(un|una|el|la|los|las)\s+/i,'').trim()).filter(item=>item.length>=2&&item.length<=120).slice(0,12);}

export function parseSchoolText(rawText:string):LocalCandidate[]{
  const text=compact(rawText);if(!text)return[];const lines=text.split('\n').map(line=>line.trim()).filter(Boolean);const candidates:LocalCandidate[]=[];const seen=new Set<string>();
  for(let index=0;index<lines.length;index+=1){const line=lines[index];if(!line)continue;const context=[lines[index-1],line,lines[index+1]].filter((value):value is string=>Boolean(value)).join(' · ');const subject=subjectFromText(context)??subjectFromText(text);const when=applyTime(dateFromText(context)??dateFromText(text),context);const materials=materialsFromText(context);
    let academicType:string|null=null;for(const [pattern,type] of ACADEMIC_KEYWORDS)if(pattern.test(line)){academicType=type;break;}
    if(academicType){const title=titleFromLine(line,academicType==='test'?'Prueba del colegio':'Pendiente del colegio');const key=`a:${title.toLowerCase()}:${when??''}`;if(!seen.has(key)){seen.add(key);candidates.push({candidate_type:'academic_item',title,description:context===line?null:context,due_at:when,confidence:when?.88:.76,academic_type:academicType,subject,priority:academicType==='test'||academicType==='exam'?'high':'normal',materials});}continue;}
    let eventCategory:string|null=null;for(const [pattern,category] of EVENT_KEYWORDS)if(pattern.test(line)){eventCategory=category;break;}
    if(eventCategory){const title=titleFromLine(line,'Actividad del colegio');const key=`e:${title.toLowerCase()}:${when??''}`;if(!seen.has(key)){seen.add(key);candidates.push({candidate_type:'calendar_event',title,description:context===line?null:context,starts_at:when,confidence:when?.86:.7,subject:eventCategory});}}
  }
  if(candidates.length===0){const subject=subjectFromText(text);const when=applyTime(dateFromText(text),text);const materials=materialsFromText(text);candidates.push({candidate_type:'note',title:subject?`Aviso de ${subject}`:'Aviso del colegio',description:text.slice(0,1800),due_at:when,confidence:.58,subject,materials});}
  return candidates.slice(0,20);
}

async function ocrImage(uri:string){if(!isSupported())throw new Error('Este dispositivo no admite OCR local.');const result=await recognizeText(uri);return compact(result.text??'');}
export async function runLocalOcr(uri:string,mimeType:string):Promise<LocalOcrResult>{let text='';let pageCount=1;let processedPages=1;if(mimeType==='application/pdf'){const info=await getPdfInfo(uri);pageCount=info.pageCount;const lastPage=Math.min(Math.max(info.pageCount-1,0),7);const pages=await convertPages(uri,0,lastPage,{format:'jpeg',maxWidth:2200,quality:.9,output:'file'});processedPages=pages.length;const chunks:string[]=[];for(const page of pages){const pageText=await ocrImage(page.uri);if(pageText)chunks.push(`--- Página ${page.page+1} ---\n${pageText}`);}text=compact(chunks.join('\n\n'));}else{text=await ocrImage(uri);}if(!text)throw new Error('No encontramos texto legible en el archivo. Intenta con una foto más clara.');return{text,candidates:parseSchoolText(text),pageCount,processedPages,provider:'on-device-mlkit'};}
