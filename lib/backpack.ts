import { supabase } from '@/lib/supabase';

export type BackpackStudent = {
  id: string;
  first_name: string;
  preferred_name?: string | null;
  relationship_label?: string | null;
  school_name?: string | null;
  grade_level?: string | null;
};

export type ScheduleEntry = {
  id: string;
  weekday: number;
  period_order: number;
  start_time?: string | null;
  end_time?: string | null;
  room?: string | null;
  subject_id: string;
  subject_name: string;
};

export type BackpackSubject = {
  id: string;
  name: string;
  items: Array<{ id: string; name: string }>;
};

export type BackpackChecklistItem = {
  item_key: string;
  source_id: string;
  source_type: 'kit' | 'subject' | 'academic' | 'manual';
  name: string;
  subject_id?: string | null;
  subject_name: string;
  academic_item_id?: string | null;
  packed: boolean;
};

export type BackpackWorkspace = {
  student: BackpackStudent;
  target_date: string;
  target_weekday: number;
  schedule: ScheduleEntry[];
  classes: ScheduleEntry[];
  subjects: BackpackSubject[];
  checklist: BackpackChecklistItem[];
  kit_items: Array<{ id: string; name: string }>;
  manual_items: Array<{ id: string; name: string; target_date: string; subject_id?: string | null; subject_name?: string | null }>;
};

export type SaveScheduleInput = {
  entryId?: string | null;
  studentId: string;
  weekday: number;
  periodOrder: number;
  subjectName: string;
  startTime?: string | null;
  endTime?: string | null;
  room?: string | null;
};

export class BackpackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackpackError';
  }
}

export async function getBackpackStudents(): Promise<BackpackStudent[]> {
  const { data, error } = await supabase.rpc('after_my_context');
  if (error) throw new BackpackError('No pudimos cargar a tu familia.');
  const context = (data ?? {}) as { students?: BackpackStudent[] };
  return Array.isArray(context.students) ? context.students : [];
}

export async function getBackpackWorkspace(studentId: string, targetDate?: string | null): Promise<BackpackWorkspace> {
  const { data, error } = await supabase.rpc('after_backpack_workspace', {
    p_student_id: studentId,
    p_target_date: targetDate || null,
  });
  if (error) throw new BackpackError('No pudimos abrir la mochila.');
  const raw = (data ?? {}) as Partial<BackpackWorkspace>;
  return {
    student: (raw.student ?? { id: studentId, first_name: '' }) as BackpackStudent,
    target_date: typeof raw.target_date === 'string' ? raw.target_date : targetDate || new Date().toISOString().slice(0, 10),
    target_weekday: typeof raw.target_weekday === 'number' ? raw.target_weekday : 1,
    schedule: Array.isArray(raw.schedule) ? raw.schedule : [],
    classes: Array.isArray(raw.classes) ? raw.classes : [],
    subjects: Array.isArray(raw.subjects) ? raw.subjects : [],
    checklist: Array.isArray(raw.checklist) ? raw.checklist : [],
    kit_items: Array.isArray(raw.kit_items) ? raw.kit_items : [],
    manual_items: Array.isArray(raw.manual_items) ? raw.manual_items : [],
  };
}

export async function saveScheduleEntry(input: SaveScheduleInput): Promise<string> {
  const { data, error } = await supabase.rpc('after_save_school_schedule_entry', {
    p_entry_id: input.entryId || null,
    p_student_id: input.studentId,
    p_weekday: input.weekday,
    p_period_order: input.periodOrder,
    p_subject_name: input.subjectName.trim(),
    p_start_time: input.startTime || null,
    p_end_time: input.endTime || null,
    p_room: input.room?.trim() || null,
  });
  if (error || typeof data !== 'string') {
    const message = String(error?.message ?? '');
    if (message.includes('school_schedule_student_day_period_uidx')) {
      throw new BackpackError('Ese bloque ya está ocupado en ese día. Edita el bloque existente o usa otro número.');
    }
    if (message.includes('invalid_time_range')) throw new BackpackError('La hora de término debe ser posterior a la de inicio.');
    throw new BackpackError('No pudimos guardar ese bloque del horario.');
  }
  return data;
}

export async function deleteScheduleEntry(entryId: string): Promise<void> {
  const { error } = await supabase.rpc('after_delete_school_schedule_entry', { p_entry_id: entryId });
  if (error) throw new BackpackError('No pudimos eliminar ese bloque del horario.');
}

export async function setSubjectBackpackItems(studentId: string, subjectId: string, items: string[]): Promise<void> {
  const { error } = await supabase.rpc('after_set_subject_backpack_items', {
    p_student_id: studentId,
    p_subject_id: subjectId,
    p_items: items,
  });
  if (error) throw new BackpackError('No pudimos guardar los materiales de esa asignatura.');
}

export async function toggleBackpackItem(studentId: string, targetDate: string, itemKey: string, packed: boolean): Promise<void> {
  const { error } = await supabase.rpc('after_toggle_backpack_item', {
    p_student_id: studentId,
    p_target_date: targetDate,
    p_item_key: itemKey,
    p_packed: packed,
  });
  if (error) throw new BackpackError('No pudimos actualizar la mochila.');
}

export function weekdayLabel(day: number) {
  return ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][day] || 'Día';
}

export function shortTime(value?: string | null) {
  if (!value) return '';
  return value.slice(0, 5);
}

export function shiftDate(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateIso;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function saveDailyBackpackItem(studentId:string,targetDate:string,name:string,subjectId?:string|null){const {data,error}=await supabase.rpc('after_save_backpack_daily_item',{p_item_id:null,p_student_id:studentId,p_target_date:targetDate,p_name:name.trim(),p_subject_id:subjectId||null});if(error)throw new BackpackError('No pudimos agregar ese material.');return data as string;}
export async function deleteDailyBackpackItem(itemId:string){const {error}=await supabase.rpc('after_delete_backpack_daily_item',{p_item_id:itemId});if(error)throw new BackpackError('No pudimos eliminar ese material.');}
export async function setBackpackKitItems(studentId:string,items:string[]){const {error}=await supabase.rpc('after_set_backpack_kit_items',{p_student_id:studentId,p_items:items});if(error)throw new BackpackError('No pudimos guardar el estuche.');}
