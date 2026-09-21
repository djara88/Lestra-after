import { isSupported, recognizeText } from 'expo-mlkit-ocr';
export type ScheduleOcrEntry={weekday:number;periodOrder:number;subjectName:string};
const DAYS:Array<[RegExp,number]>=[[/^lunes$/i,1],[/^martes$/i,2],[/^mi[eé]rcoles$/i,3],[/^jueves$/i,4],[/^viernes$/i,5]];
const SUBJECTS:Array<[RegExp,string]>=[[/matem[aá]tic/i,'Matemática'],[/lenguaje|lengua y literatura|comunicaci[oó]n/i,'Lenguaje'],[/ciencias? naturales|ciencias?/i,'Ciencias'],[/historia|geograf/i,'Historia'],[/ingl[eé]s|english/i,'Inglés'],[/tecnolog/i,'Tecnología'],[/m[uú]sica/i,'Música'],[/arte/i,'Artes'],[/educaci[oó]n f[ií]sica|ed\.?\s*f[ií]sica/i,'Educación Física'],[/relig/i,'Religión'],[/computaci[oó]n|inform[aá]tica/i,'Computación'],[/orientaci[oó]n/i,'Orientación']];
export async function readScheduleFromImage(uri:string):Promise<ScheduleOcrEntry[]>{
 if(!isSupported())throw new Error('OCR no está disponible en este dispositivo.');
 const result=await recognizeText(uri);const lines=(result.blocks??[]).flatMap(block=>block.lines??[]);
 const headers=lines.map(line=>{const hit=DAYS.find(([p])=>p.test(line.text.trim()));return hit?{weekday:hit[1],x:line.boundingBox.x+line.boundingBox.width/2,y:line.boundingBox.y+line.boundingBox.height}:null;}).filter((v):v is {weekday:number;x:number;y:number}=>Boolean(v));
 if(headers.length<4)throw new Error('No pude reconocer las columnas de lunes a viernes. Usa una foto frontal del horario completo.');
 const sorted=[...headers].sort((a,b)=>a.x-b.x);const boundaries=[-Infinity,...sorted.slice(0,-1).map((h,i)=>(h.x+sorted[i+1]!.x)/2),Infinity];const top=Math.max(...headers.map(h=>h.y));
 const raw=lines.map(line=>{const subject=SUBJECTS.find(([p])=>p.test(line.text.trim()))?.[1];if(!subject)return null;const x=line.boundingBox.x+line.boundingBox.width/2;const col=boundaries.findIndex((_,i)=>i<sorted.length&&x>=boundaries[i]!&&x<boundaries[i+1]!);if(col<0||line.boundingBox.y<=top)return null;return{weekday:sorted[col]!.weekday,subjectName:subject,y:line.boundingBox.y};}).filter((v):v is {weekday:number;subjectName:string;y:number}=>Boolean(v));
 const out:ScheduleOcrEntry[]=[];for(const weekday of [1,2,3,4,5])raw.filter(v=>v.weekday===weekday).sort((a,b)=>a.y-b.y).forEach((v,i)=>out.push({weekday,periodOrder:i+1,subjectName:v.subjectName}));
 if(!out.length)throw new Error('Reconocí el horario, pero no pude identificar asignaturas.');return out;
}