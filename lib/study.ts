import { supabase } from '@/lib/supabase';

export type StudyTarget = {
  id: string;
  student_id: string;
  student_name: string;
  title: string;
  type: string;
  subject?: string | null;
  due_at?: string | null;
  priority: string;
  estimated_minutes?: number | null;
  has_study_plan: boolean;
};

export type StudyPlan = {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  academic_item_id?: string | null;
  academic_title?: string | null;
  academic_due_at?: string | null;
  title: string;
  objective?: string | null;
  status: string;
  scheduled_start?: string | null;
  planned_minutes?: number | null;
  completed_at?: string | null;
};

function message(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}

export async function getStudyFlow(days = 30): Promise<{ targets: StudyTarget[]; plans: StudyPlan[] }> {
  const [{ data: targets, error: targetsError }, { data: plans, error: plansError }] = await Promise.all([
    supabase.rpc('after_study_targets', { p_days: days }),
    supabase.rpc('after_study_plans'),
  ]);
  if (targetsError || plansError) throw new Error(message(targetsError ?? plansError, 'No pudimos cargar el estudio.'));
  return {
    targets: Array.isArray(targets) ? targets as StudyTarget[] : [],
    plans: Array.isArray(plans) ? plans as StudyPlan[] : [],
  };
}

export async function planStudyForAcademicItem(itemId: string, scheduledStart: Date, plannedMinutes: number, objective?: string) {
  const { data, error } = await supabase.rpc('after_plan_study_for_item', {
    p_academic_item_id: itemId,
    p_scheduled_start: scheduledStart.toISOString(),
    p_planned_minutes: plannedMinutes,
    p_objective: objective?.trim() || null,
  });
  if (error) throw new Error(message(error, 'No pudimos reservar ese tiempo.'));
  return data as { plan_id?: string; session_id?: string } | null;
}

export async function completeStudySession(sessionId: string) {
  const { data, error } = await supabase.rpc('after_complete_study_session_v2', { p_session_id: sessionId });
  if (error || data !== true) throw new Error(message(error, 'No pudimos marcar ese momento como listo.'));
}

export async function rescheduleStudySession(sessionId: string, scheduledStart: Date, plannedMinutes: number, objective?: string) {
  const { data, error } = await supabase.rpc('after_reschedule_study_session', {
    p_session_id: sessionId,
    p_scheduled_start: scheduledStart.toISOString(),
    p_planned_minutes: plannedMinutes,
    p_objective: objective?.trim() || null,
  });
  if (error || data !== true) throw new Error(message(error, 'No pudimos reprogramar ese momento.'));
}
