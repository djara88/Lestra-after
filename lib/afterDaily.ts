import { supabase } from '@/lib/supabase';

export type AfterChild = {
  id: string;
  first_name: string;
  preferred_name?: string | null;
  relationship_label?: string | null;
  school_name?: string | null;
  grade_level?: string | null;
};

export type AfterContext = {
  display_name?: string;
  family_name?: string;
  students?: AfterChild[];
};

export type FlowItem = {
  kind: 'academic' | 'event' | 'study';
  id: string;
  student_id?: string | null;
  title: string;
  category: string;
  starts_at?: string | null;
  ends_at?: string | null;
  status?: string | null;
  priority?: string | null;
  subject?: string | null;
  location?: string | null;
  study_plan_id?: string | null;
  academic_item_id?: string | null;
  planned_minutes?: number | null;
  objective?: string | null;
  academic_title?: string | null;
};

export type MaterialItem = {
  id: string;
  academic_item_id?: string;
  student_id: string;
  name: string;
  packed: boolean;
  task_title: string;
};

export type DailyOverview = {
  overdue: FlowItem[];
  today: FlowItem[];
  tomorrow: FlowItem[];
  week: FlowItem[];
  tomorrow_materials: MaterialItem[];
};

export type DailyFlow = {
  context: AfterContext;
  overview: DailyOverview;
};

export class AfterDailyError extends Error {
  readonly code: 'load_failed' | 'save_failed';

  constructor(code: 'load_failed' | 'save_failed', message: string) {
    super(message);
    this.name = 'AfterDailyError';
    this.code = code;
  }
}

const emptyOverview: DailyOverview = {
  overdue: [],
  today: [],
  tomorrow: [],
  week: [],
  tomorrow_materials: [],
};

function normalizeItem(value: unknown, fallbackKind: 'academic' | 'event' | 'study' = 'academic'): FlowItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const id = typeof item.id === 'string' ? item.id : '';
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  if (!id || !title) return null;

  const kind = item.kind === 'event' ? 'event' : item.kind === 'study' ? 'study' : item.kind === 'academic' ? 'academic' : fallbackKind;
  const category = typeof item.category === 'string'
    ? item.category
    : typeof item.type === 'string'
      ? item.type
      : kind === 'event'
        ? 'other'
        : kind === 'study'
          ? 'study'
          : 'task';

  return {
    kind,
    id,
    student_id: typeof item.student_id === 'string' ? item.student_id : null,
    title,
    category,
    starts_at: typeof item.starts_at === 'string'
      ? item.starts_at
      : typeof item.due_at === 'string'
        ? item.due_at
        : null,
    ends_at: typeof item.ends_at === 'string' ? item.ends_at : null,
    status: typeof item.status === 'string' ? item.status : null,
    priority: typeof item.priority === 'string' ? item.priority : null,
    subject: typeof item.subject === 'string' ? item.subject : null,
    location: typeof item.location === 'string' ? item.location : null,
    study_plan_id: typeof item.study_plan_id === 'string' ? item.study_plan_id : null,
    academic_item_id: typeof item.academic_item_id === 'string' ? item.academic_item_id : null,
    planned_minutes: typeof item.planned_minutes === 'number' ? item.planned_minutes : null,
    objective: typeof item.objective === 'string' ? item.objective : null,
    academic_title: typeof item.academic_title === 'string' ? item.academic_title : null,
  };
}

function normalizeItems(value: unknown, fallbackKind: 'academic' | 'event' | 'study' = 'academic'): FlowItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => normalizeItem(item, fallbackKind)).filter((item): item is FlowItem => Boolean(item));
}

function normalizeMaterials(value: unknown): MaterialItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string' || typeof item.student_id !== 'string' || typeof item.name !== 'string') return [];
    return [{
      id: item.id,
      academic_item_id: typeof item.academic_item_id === 'string' ? item.academic_item_id : undefined,
      student_id: item.student_id,
      name: item.name,
      packed: item.packed === true,
      task_title: typeof item.task_title === 'string' ? item.task_title : 'Pendiente de mañana',
    }];
  });
}

function normalizeOverview(value: unknown): DailyOverview {
  if (!value || typeof value !== 'object') return emptyOverview;
  const raw = value as Record<string, unknown>;
  return {
    overdue: normalizeItems(raw.overdue, 'academic'),
    today: normalizeItems(raw.today),
    tomorrow: normalizeItems(raw.tomorrow),
    week: normalizeItems(raw.week, 'academic'),
    tomorrow_materials: normalizeMaterials(raw.tomorrow_materials),
  };
}

export async function getTodayFlow(): Promise<DailyFlow> {
  const [{ data: context, error: contextError }, { data: overview, error: overviewError }] = await Promise.all([
    supabase.rpc('after_my_context'),
    supabase.rpc('after_school_overview'),
  ]);

  if (contextError || overviewError) {
    throw new AfterDailyError('load_failed', 'No pudimos cargar el día de tu familia.');
  }

  return {
    context: (context ?? {}) as AfterContext,
    overview: normalizeOverview(overview),
  };
}

export async function markAcademicDone(itemId: string): Promise<void> {
  const { error } = await supabase.rpc('after_update_academic_status', {
    p_item_id: itemId,
    p_status: 'done',
  });
  if (error) throw new AfterDailyError('save_failed', 'No pudimos marcarlo como listo.');
}

export async function completeStudySession(sessionId: string): Promise<void> {
  const { data, error } = await supabase.rpc('after_complete_study_session_v2', {
    p_session_id: sessionId,
  });
  if (error || data !== true) throw new AfterDailyError('save_failed', 'No pudimos completar el momento de estudio.');
}

export async function setMaterialPacked(materialId: string, packed: boolean): Promise<void> {
  const { error } = await supabase.rpc('after_set_material_packed', {
    p_material_id: materialId,
    p_packed: packed,
  });
  if (error) throw new AfterDailyError('save_failed', 'No pudimos actualizar la mochila.');
}

export function selectNowAndNext(items: FlowItem[], now = new Date()): { current: FlowItem | null; next: FlowItem | null } {
  const nowMs = now.getTime();
  const timed = items
    .filter(item => item.starts_at && !Number.isNaN(new Date(item.starts_at).getTime()))
    .slice()
    .sort((a, b) => new Date(a.starts_at as string).getTime() - new Date(b.starts_at as string).getTime());

  const current = timed.find(item => {
    if (!item.starts_at || !item.ends_at) return false;
    const start = new Date(item.starts_at).getTime();
    const end = new Date(item.ends_at).getTime();
    return start <= nowMs && nowMs < end;
  }) ?? null;

  const next = timed.find(item => new Date(item.starts_at as string).getTime() >= nowMs && item.id !== current?.id) ?? null;
  return { current, next };
}
