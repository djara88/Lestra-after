import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChildSwitcher } from '@/components/after/ChildSwitcher';
import { NowBlock } from '@/components/after/NowBlock';
import { PreparationChecklist } from '@/components/after/PreparationChecklist';
import {
  completeStudySession,
  getTodayFlow,
  markAcademicDone,
  respondDailyResponsibility,
  selectNowAndNext,
  setMaterialPacked,
  type AfterChild,
  type DailyFlow,
  type FlowItem,
  type MaterialItem,
} from '@/lib/afterDaily';

const labels: Record<string, string> = {
  task: 'Tarea', test: 'Prueba', exam: 'Examen', project: 'Proyecto', material: 'Material',
  school_event: 'Colegio', school: 'Colegio', study: 'Estudio', sport: 'Deporte', health: 'Salud',
  social: 'Actividad', family: 'Familia', other: 'Otro',
};

const icons: Record<string, string> = {
  task: '📝', test: '📚', exam: '📚', project: '🧩', material: '🎒', school_event: '🏫', school: '🏫',
  study: '🌱', sport: '⚽', health: '💛', social: '🎈', family: '🏡', other: '•',
};

const responsibilityStatus: Record<string, string> = {
  unassigned: 'Por definir', proposed: 'Esperando respuesta', accepted: 'En curso', declined: 'No disponible', completed: 'Listo',
};

function timeLabel(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
}

function displayChild(child: AfterChild) {
  return child.preferred_name || child.first_name;
}

function canPlanStudy(item: FlowItem) {
  return item.kind === 'academic' && ['task', 'test', 'exam', 'project'].includes(item.category);
}

type LoadState = 'loading' | 'ready' | 'error';

export default function Today() {
  const [flow, setFlow] = useState<DailyFlow | null>(null);
  const flowRef = useRef<DailyFlow | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [childId, setChildId] = useState('all');

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else if (!flowRef.current) setLoadState('loading');

    try {
      const next = await getTodayFlow();
      flowRef.current = next;
      setFlow(next);
      setLoadState('ready');
      setStale(false);
      setChildId(current => current === 'all' || next.context.students?.some(child => child.id === current) ? current : 'all');
    } catch {
      if (flowRef.current) {
        setStale(true);
        setLoadState('ready');
      } else {
        setLoadState('error');
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load('initial');
  }, [load]));

  const children = flow?.context.students ?? [];
  const overview = flow?.overview;
  const showChild = childId === 'all' && children.length > 1;

  const childName = useCallback((studentId?: string | null) => {
    const child = children.find(item => item.id === studentId);
    return child ? displayChild(child) : 'Familia';
  }, [children]);

  const filterItems = useCallback((items: FlowItem[] | undefined) => {
    return items?.filter(item => childId === 'all' || !item.student_id || item.student_id === childId) ?? [];
  }, [childId]);

  const today = useMemo(() => filterItems(overview?.today), [filterItems, overview?.today]);
  const tomorrow = useMemo(() => filterItems(overview?.tomorrow), [filterItems, overview?.tomorrow]);
  const overdue = useMemo(() => filterItems(overview?.overdue), [filterItems, overview?.overdue]);
  const week = useMemo(() => filterItems(overview?.week), [filterItems, overview?.week]);
  const materials = useMemo(() => overview?.tomorrow_materials.filter(item => childId === 'all' || item.student_id === childId) ?? [], [overview?.tomorrow_materials, childId]);
  const { current, next } = useMemo(() => selectNowAndNext(today), [today]);
  const alsoToday = useMemo(() => today.filter(item => item.id !== current?.id && item.id !== next?.id), [today, current?.id, next?.id]);

  async function complete(item: FlowItem) {
    if ((item.kind !== 'academic' && item.kind !== 'study') || busyId) return;
    setBusyId(item.id);
    try {
      if (item.kind === 'study') await completeStudySession(item.id);
      else await markAcademicDone(item.id);
      await load('refresh');
    } catch {
      Alert.alert('No pudimos marcarlo como listo', 'Tu información no se perdió. Vuelve a intentar.');
    } finally {
      setBusyId(null);
    }
  }

  async function actOnResponsibility(item: FlowItem) {
    if (item.kind !== 'responsibility' || busyId) return;
    const mine = Boolean(item.assigned_member_id && item.assigned_member_id === flow?.context.member_id);
    if (!mine || !['proposed', 'accepted'].includes(item.status ?? '')) {
      router.push({ pathname: '/(app)/responsabilidad', params: { id: item.id } });
      return;
    }
    setBusyId(item.id);
    try {
      await respondDailyResponsibility(item.id, item.status === 'proposed' ? 'accepted' : 'completed');
      await load('refresh');
    } catch {
      Alert.alert('No pudimos actualizar la responsabilidad', 'Tu información no se perdió. Vuelve a intentar.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleMaterial(material: MaterialItem) {
    if (busyId) return;
    setBusyId(material.id);
    try {
      await setMaterialPacked(material.id, !material.packed);
      await load('refresh');
    } catch {
      Alert.alert('No pudimos actualizar la mochila', 'Tu información no se perdió. Vuelve a intentar.');
    } finally {
      setBusyId(null);
    }
  }

  function FlowRow({ item }: { item: FlowItem }) {
    const responsibility = item.kind === 'responsibility';
    const mine = Boolean(responsibility && item.assigned_member_id && item.assigned_member_id === flow?.context.member_id);
    const responsibilityAction = mine && item.status === 'proposed' ? 'Me encargo' : mine && item.status === 'accepted' ? '✓' : '›';

    return <View style={s.rowItem}>
      <View style={[s.iconBubble, item.kind === 'study' && s.studyBubble, responsibility && s.familyBubble]}><Text style={s.icon}>{icons[item.category] ?? '•'}</Text></View>
      <Pressable
        accessibilityRole={responsibility ? 'button' : undefined}
        disabled={!responsibility}
        onPress={() => responsibility && router.push({ pathname: '/(app)/responsabilidad', params: { id: item.id } })}
        style={s.rowContent}
      >
        <Text style={s.rowTitle}>{item.title}</Text>
        <Text style={s.meta}>
          {timeLabel(item.starts_at) || 'Sin hora'} · {labels[item.category] ?? item.category}
          {item.subject ? ` · ${item.subject}` : ''}
          {item.kind === 'study' && item.planned_minutes ? ` · ${item.planned_minutes} min` : ''}
          {responsibility ? ` · ${item.assigned_name || 'Sin responsable'} · ${responsibilityStatus[item.status ?? ''] || item.status || 'Pendiente'}` : ''}
          {showChild ? ` · ${childName(item.student_id)}` : ''}
        </Text>
        {responsibility && item.context_text ? <Text style={s.context} numberOfLines={1}>{item.context_text}</Text> : null}
      </Pressable>
      {canPlanStudy(item) ? <View style={s.rowActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Preparar estudio para ${item.title}`} onPress={() => router.push({ pathname: '/(app)/estudio', params: { itemId: item.id } })} style={s.studyButton}><Text style={s.studyButtonText}>🌱</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Marcar ${item.title} como listo`} disabled={busyId === item.id} onPress={() => void complete(item)} style={s.doneButton}><Text style={s.doneText}>{busyId === item.id ? '…' : '✓'}</Text></Pressable>
      </View> : item.kind === 'academic' || item.kind === 'study' ? <Pressable accessibilityRole="button" accessibilityLabel={`Marcar ${item.title} como listo`} disabled={busyId === item.id} onPress={() => void complete(item)} style={s.doneButton}><Text style={s.doneText}>{busyId === item.id ? '…' : '✓'}</Text></Pressable> : responsibility ? <Pressable accessibilityRole="button" accessibilityLabel={responsibilityAction === 'Me encargo' ? `Aceptar ${item.title}` : responsibilityAction === '✓' ? `Marcar ${item.title} como listo` : `Abrir ${item.title}`} disabled={busyId === item.id} onPress={() => void actOnResponsibility(item)} style={[s.responsibilityButton, mine && item.status === 'accepted' && s.responsibilityDone]}><Text style={s.responsibilityButtonText}>{busyId === item.id ? '…' : responsibilityAction}</Text></Pressable> : null}
    </View>;
  }

  const firstName = flow?.context.display_name?.split(' ')[0];

  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} />}>
      <View style={s.greeting}>
        <Text style={s.kicker}>{new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}</Text>
        <Text style={s.title}>Hola{firstName ? `, ${firstName}` : ''}</Text>
        <Text style={s.copy}>Lo importante primero: qué ocurre ahora, qué viene después y qué conviene dejar preparado.</Text>
      </View>

      {children.length > 0 ? <ChildSwitcher children={children} value={childId} onChange={setChildId} /> : null}

      {stale ? <View style={s.stale} accessibilityRole="alert"><Text style={s.staleTitle}>Mostrando el último estado disponible</Text><Text style={s.staleCopy}>No pudimos actualizar la información. Revisa la conexión y vuelve a intentar.</Text><Pressable onPress={() => void load('refresh')} style={s.retryLink}><Text style={s.retryText}>Reintentar</Text></Pressable></View> : null}

      {loadState === 'loading' && !flow ? <View style={s.loading}><ActivityIndicator/><Text style={s.muted}>Ordenando el día…</Text></View> : loadState === 'error' && !flow ? <View style={s.stateBox} accessibilityRole="alert"><Text style={s.stateTitle}>No pudimos cargar tu día</Text><Text style={s.muted}>No lo mostraremos como una agenda vacía. Revisa la conexión y vuelve a intentar.</Text><Pressable onPress={() => void load('initial')} style={s.primary}><Text style={s.primaryText}>Reintentar</Text></Pressable></View> : flow ? <>
        <NowBlock current={current} next={next} childName={childName} showChild={showChild} onImportSchool={() => router.push('/(app)/agregar')}/>

        {overdue.length > 0 ? <View style={s.section}><View style={s.sectionHead}><Text style={s.sectionTitle}>Necesita atención</Text><Text style={s.warning}>{overdue.length}</Text></View>{overdue.map(item => <FlowRow key={`late-${item.kind}-${item.id}`} item={item}/>)}</View> : null}

        <View style={s.section}><View style={s.sectionHead}><Text style={s.sectionTitle}>También hoy</Text><Text style={s.sectionHint}>{alsoToday.length} pendiente(s)</Text></View>{alsoToday.length > 0 ? alsoToday.map(item => <FlowRow key={`${item.kind}-${item.id}`} item={item}/>) : <View style={s.empty}><Text style={s.emptyEmoji}>🌿</Text><View style={s.rowContent}><Text style={s.emptyTitle}>No hay más pendientes registrados para hoy</Text><Text style={s.muted}>Puedes revisar mañana o incorporar algo que mandó el colegio.</Text></View></View>}</View>

        <View style={s.tomorrowCard}><View style={s.sectionHead}><View><Text style={s.cardKicker}>PREPARAR</Text><Text style={s.sectionTitle}>Mañana</Text></View><Pressable accessibilityRole="button" onPress={() => router.push('/(app)/agenda')}><Text style={s.link}>Ver semana</Text></Pressable></View>{tomorrow.length > 0 ? tomorrow.map(item => <FlowRow key={`tomorrow-${item.kind}-${item.id}`} item={item}/>) : <Text style={s.muted}>No hay actividades, tareas, estudio, responsabilidades o pruebas registradas para mañana.</Text>}<PreparationChecklist materials={materials} busyId={busyId} childName={childName} showChild={showChild} onToggle={material => void toggleMaterial(material)}/></View>

        <View style={s.actionRow}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/composer')} style={s.quickAction}><Text style={s.quickEmoji}>＋</Text><View style={s.rowContent}><Text style={s.quickTitle}>Agregar algo</Text><Text style={s.quickCopy}>Actividad, tarea o prueba en pocos pasos.</Text></View></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/coordinar')} style={s.quickAction}><Text style={s.quickEmoji}>🏡</Text><View style={s.rowContent}><Text style={s.quickTitle}>Coordinar familia</Text><Text style={s.quickCopy}>Define responsable, plazo y confirmación.</Text></View></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/estudio')} style={s.quickAction}><Text style={s.quickEmoji}>🌱</Text><View style={s.rowContent}><Text style={s.quickTitle}>Preparar estudio</Text><Text style={s.quickCopy}>Convierte una obligación en un momento concreto de preparación.</Text></View></Pressable>
        </View>

        {week.length > 0 ? <View style={s.section}><Text style={s.sectionTitle}>Después</Text>{week.slice(0, 6).map(item => <Pressable key={`week-${item.kind}-${item.id}`} disabled={item.kind !== 'responsibility'} onPress={() => item.kind === 'responsibility' && router.push({ pathname: '/(app)/responsabilidad', params: { id: item.id } })} style={s.weekRow}><Text style={s.weekDate}>{dayLabel(item.starts_at)}</Text><View style={s.rowContent}><Text style={s.rowTitle}>{item.title}</Text><Text style={s.meta}>{item.kind === 'responsibility' ? `${item.assigned_name || 'Sin responsable'} · ${responsibilityStatus[item.status ?? ''] || item.status || 'Pendiente'}` : item.subject || labels[item.category] || item.category}{item.kind === 'study' && item.planned_minutes ? ` · ${item.planned_minutes} min` : ''}{showChild ? ` · ${childName(item.student_id)}` : ''}</Text></View>{item.kind === 'responsibility' ? <Text style={s.weekChevron}>›</Text> : null}</Pressable>)}</View> : null}
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF8F1' },
  body: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 64, gap: 18 },
  greeting: { gap: 4 },
  kicker: { fontSize: 10.5, fontWeight: '900', letterSpacing: 1.1, color: '#9A7A60' },
  title: { fontSize: 34, lineHeight: 39, fontWeight: '900', letterSpacing: -1, color: '#2B2926' },
  copy: { fontSize: 15, lineHeight: 22, color: '#71665C', maxWidth: 560 },
  loading: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  muted: { fontSize: 13, lineHeight: 19, color: '#81756A' },
  stale: { backgroundColor: '#FFF1D6', borderRadius: 17, padding: 14, gap: 4, borderWidth: 1, borderColor: '#ECD5A9' },
  staleTitle: { fontSize: 14, fontWeight: '900', color: '#765A28' },
  staleCopy: { fontSize: 12.5, lineHeight: 18, color: '#806C43' },
  retryLink: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  retryText: { fontSize: 13, fontWeight: '900', color: '#7B5B20' },
  stateBox: { backgroundColor: '#FFFDF9', borderWidth: 1, borderColor: '#E8DDD1', borderRadius: 20, padding: 18, gap: 10 },
  stateTitle: { fontSize: 19, fontWeight: '900', color: '#302D29' },
  primary: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', backgroundColor: '#597657', borderRadius: 12, paddingHorizontal: 15 },
  primaryText: { color: '#FFFFFF', fontWeight: '900' },
  section: { gap: 4 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 5 },
  sectionTitle: { fontSize: 21, fontWeight: '900', color: '#302D29' },
  sectionHint: { fontSize: 12, fontWeight: '800', color: '#9A8C80' },
  warning: { minWidth: 28, textAlign: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', backgroundColor: '#FBE4E0', fontSize: 12, fontWeight: '900', color: '#A94E45' },
  rowItem: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EDE1D7' },
  iconBubble: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#FFF0E4', alignItems: 'center', justifyContent: 'center' },
  studyBubble: { backgroundColor: '#EEF1FB' },
  familyBubble: { backgroundColor: '#EEF3E9' },
  icon: { fontSize: 16 },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '800', color: '#302D29' },
  meta: { fontSize: 11.5, lineHeight: 17, color: '#8A7E72', marginTop: 3 },
  context: { fontSize: 11.5, lineHeight: 16, color: '#9A8171', marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: 5 },
  studyButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#EEF1FB', alignItems: 'center', justifyContent: 'center' },
  studyButtonText: { fontSize: 15 },
  doneButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#EAF4E5', alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 15, fontWeight: '900', color: '#50704D' },
  responsibilityButton: { minWidth: 44, minHeight: 44, borderRadius: 13, paddingHorizontal: 9, backgroundColor: '#FFF0E4', alignItems: 'center', justifyContent: 'center' },
  responsibilityDone: { backgroundColor: '#EAF4E5' },
  responsibilityButtonText: { fontSize: 11.5, fontWeight: '900', color: '#6A5A4D' },
  empty: { flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: '#FFFDF9', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#EEE3D9' },
  emptyEmoji: { fontSize: 24 },
  emptyTitle: { fontSize: 15.5, fontWeight: '900', color: '#302D29' },
  tomorrowCard: { backgroundColor: '#EEF4EA', borderRadius: 24, padding: 17, gap: 4 },
  cardKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: '#7D9676' },
  link: { minHeight: 40, textAlignVertical: 'center', fontSize: 12, fontWeight: '900', color: '#567050' },
  actionRow: { gap: 9 },
  quickAction: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFDF9', borderWidth: 1, borderColor: '#E9DED4', borderRadius: 18, padding: 14 },
  quickEmoji: { fontSize: 20 },
  quickTitle: { fontSize: 15, fontWeight: '900', color: '#302D29' },
  quickCopy: { fontSize: 12, lineHeight: 17, color: '#867A70', marginTop: 2 },
  weekRow: { flexDirection: 'row', gap: 13, alignItems: 'flex-start', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#EDE1D7' },
  weekDate: { width: 72, fontSize: 11.5, lineHeight: 17, fontWeight: '900', textTransform: 'capitalize', color: '#8B6F5B' },
  weekChevron: { fontSize: 22, lineHeight: 24, color: '#927C6B' },
});
