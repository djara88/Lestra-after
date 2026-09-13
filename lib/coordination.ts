import { supabase } from '@/lib/supabase';

export type FamilyMember = { id: string; display_name: string; role: string; is_me: boolean };
export type FamilyStudent = {
  id: string;
  name: string;
  first_name?: string | null;
  preferred_name?: string | null;
  relationship_label?: string | null;
  school_name?: string | null;
  grade_level?: string | null;
};
export type Responsibility = {
  id: string;
  family_id?: string;
  student_id?: string | null;
  assigned_member_id?: string | null;
  assigned_name?: string | null;
  title: string;
  status: string;
  due_at?: string | null;
  context_text?: string | null;
  created_at?: string | null;
};
export type FamilyWorkspace = {
  family_id?: string;
  members?: FamilyMember[];
  students?: FamilyStudent[];
  responsibilities?: Responsibility[];
};

function message(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}

export async function getFamilyWorkspace(): Promise<FamilyWorkspace> {
  const { data, error } = await supabase.rpc('after_family_workspace');
  if (error) throw new Error(message(error, 'No pudimos cargar la coordinación familiar.'));
  return (data ?? {}) as FamilyWorkspace;
}

export async function createResponsibility(input: {
  familyId: string;
  studentId?: string | null;
  title: string;
  assignedMemberId?: string | null;
  dueAt: Date;
  contextText?: string;
}) {
  const { data, error } = await supabase.rpc('after_create_responsibility_v2', {
    p_family_id: input.familyId,
    p_student_id: input.studentId || null,
    p_title: input.title.trim(),
    p_assigned_member_id: input.assignedMemberId || null,
    p_due_at: input.dueAt.toISOString(),
    p_context_text: input.contextText?.trim() || null,
  });
  if (error) throw new Error(message(error, 'No pudimos guardar la responsabilidad.'));
  return String(data ?? '');
}

export async function getResponsibility(id: string): Promise<Responsibility> {
  const { data, error } = await supabase.rpc('after_responsibility_detail', { p_responsibility_id: id });
  if (error || !data || typeof data !== 'object' || !('id' in data)) throw new Error(message(error, 'No pudimos abrir la responsabilidad.'));
  return data as Responsibility;
}

export async function updateResponsibility(id: string, input: {
  studentId?: string | null;
  title: string;
  assignedMemberId?: string | null;
  dueAt: Date;
  contextText?: string;
}) {
  const { data, error } = await supabase.rpc('after_update_responsibility_v2', {
    p_responsibility_id: id,
    p_student_id: input.studentId || null,
    p_title: input.title.trim(),
    p_assigned_member_id: input.assignedMemberId || null,
    p_due_at: input.dueAt.toISOString(),
    p_context_text: input.contextText?.trim() || null,
  });
  if (error || data !== true) throw new Error(message(error, 'No pudimos actualizar la responsabilidad.'));
}

export async function respondResponsibility(id: string, action: 'accepted' | 'declined' | 'completed') {
  const { error } = await supabase.rpc('after_respond_responsibility', {
    p_responsibility_id: id,
    p_action: action,
  });
  if (error) throw new Error(message(error, 'No pudimos actualizar la responsabilidad.'));
}
