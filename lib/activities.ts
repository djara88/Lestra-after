import { supabase } from '@/lib/supabase';

export type ActivityKind = 'event' | 'academic';

export type Conflict = {
  type: 'overlap' | 'travel';
  student_id: string;
  first_id: string;
  second_id: string;
  first_title: string;
  second_title: string;
  conflict_at: string;
  message: string;
};

export type ActivityDetail = {
  kind: ActivityKind;
  id: string;
  family_id?: string;
  student_id?: string | null;
  title: string;
  category: string;
  starts_at?: string | null;
  ends_at?: string | null;
  location?: string | null;
  notes?: string | null;
  description?: string | null;
  sensitivity?: string | null;
  status?: string | null;
  travel_minutes?: number | null;
  estimated_minutes?: number | null;
  priority?: string | null;
  subject?: string | null;
  materials?: string[];
};

export type EventDraft = {
  familyId: string;
  studentId: string | null;
  category: string;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  travelMinutes: number;
  location?: string;
  notes?: string;
  sensitivity?: 'normal' | 'private';
  repeat?: 'none' | 'daily' | 'weekly';
  repeatCount?: number;
};

export type AcademicDraft = {
  studentId: string;
  type: string;
  title: string;
  description?: string;
  dueAt: Date;
  priority: string;
  subject?: string;
  materials?: string[];
  estimatedMinutes?: number | null;
};

function message(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}

export async function createEvent(draft: EventDraft) {
  const { data, error } = await supabase.rpc('after_create_calendar_event_v2', {
    p_family_id: draft.familyId,
    p_student_id: draft.studentId,
    p_category: draft.category,
    p_title: draft.title.trim(),
    p_starts_at: draft.startsAt.toISOString(),
    p_duration_minutes: draft.durationMinutes,
    p_travel_minutes: draft.travelMinutes,
    p_location: draft.location?.trim() || null,
    p_notes: draft.notes?.trim() || null,
    p_sensitivity: draft.sensitivity ?? 'normal',
    p_repeat: draft.repeat ?? 'none',
    p_repeat_count: draft.repeat === 'none' ? 1 : Math.max(1, draft.repeatCount ?? 1),
  });
  if (error) throw new Error(message(error, 'No pudimos guardar la actividad.'));
  return data as { ids?: string[]; series_id?: string | null; count?: number } | null;
}

export async function createAcademic(draft: AcademicDraft) {
  const { data, error } = await supabase.rpc('after_create_school_item_v2', {
    p_student_id: draft.studentId,
    p_type: draft.type,
    p_title: draft.title.trim(),
    p_description: draft.description?.trim() || null,
    p_due_at: draft.dueAt.toISOString(),
    p_priority: draft.priority,
    p_subject_name: draft.subject?.trim() || null,
    p_materials: draft.materials ?? [],
    p_estimated_minutes: draft.estimatedMinutes ?? null,
  });
  if (error) throw new Error(message(error, 'No pudimos guardar el pendiente.'));
  return String(data ?? '');
}

export async function getActivityDetail(kind: ActivityKind, id: string): Promise<ActivityDetail> {
  const { data, error } = await supabase.rpc('after_activity_detail', { p_kind: kind, p_id: id });
  if (error || !data) throw new Error(message(error, 'No pudimos abrir esta actividad.'));
  return data as ActivityDetail;
}

export async function updateEvent(id: string, draft: Omit<EventDraft, 'familyId' | 'repeat' | 'repeatCount'>) {
  const { error } = await supabase.rpc('after_update_calendar_event_v2', {
    p_event_id: id,
    p_student_id: draft.studentId,
    p_category: draft.category,
    p_title: draft.title.trim(),
    p_starts_at: draft.startsAt.toISOString(),
    p_duration_minutes: draft.durationMinutes,
    p_travel_minutes: draft.travelMinutes,
    p_location: draft.location?.trim() || null,
    p_notes: draft.notes?.trim() || null,
    p_sensitivity: draft.sensitivity ?? 'normal',
  });
  if (error) throw new Error(message(error, 'No pudimos actualizar la actividad.'));
}

export async function updateAcademic(id: string, draft: AcademicDraft) {
  const { error } = await supabase.rpc('after_update_school_item_v2', {
    p_item_id: id,
    p_type: draft.type,
    p_title: draft.title.trim(),
    p_description: draft.description?.trim() || null,
    p_due_at: draft.dueAt.toISOString(),
    p_priority: draft.priority,
    p_subject_name: draft.subject?.trim() || null,
    p_materials: draft.materials ?? [],
    p_estimated_minutes: draft.estimatedMinutes ?? null,
  });
  if (error) throw new Error(message(error, 'No pudimos actualizar el pendiente.'));
}

export async function cancelActivity(kind: ActivityKind, id: string) {
  if (kind === 'event') {
    const { error } = await supabase.rpc('after_cancel_calendar_event', { p_event_id: id, p_cancelled: true });
    if (error) throw new Error(message(error, 'No pudimos cancelar la actividad.'));
    return;
  }
  const { error } = await supabase.rpc('after_update_academic_status', { p_item_id: id, p_status: 'cancelled' });
  if (error) throw new Error(message(error, 'No pudimos cancelar el pendiente.'));
}

export async function duplicateActivity(kind: ActivityKind, id: string): Promise<{ kind: ActivityKind; id: string }> {
  const { data, error } = await supabase.rpc('after_duplicate_activity', { p_kind: kind, p_id: id });
  if (error || !data) throw new Error(message(error, 'No pudimos duplicar la actividad.'));
  return data as { kind: ActivityKind; id: string };
}

export async function getConflicts(days = 14): Promise<Conflict[]> {
  const { data, error } = await supabase.rpc('after_event_conflicts', { p_days: days });
  if (error) throw new Error(message(error, 'No pudimos revisar conflictos.'));
  return Array.isArray(data) ? data as Conflict[] : [];
}
