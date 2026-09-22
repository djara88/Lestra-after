import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChoiceChips } from '@/components/after/ChoiceChips';
import { ScheduleField } from '@/components/ScheduleField';
import { cancelActivity, duplicateActivity, getActivityDetail, updateAcademic, updateEvent, type ActivityKind } from '@/lib/activities';
import { supabase } from '@/lib/supabase';

type Child = { id: string; first_name: string; preferred_name?: string | null };
type Context = { students?: Child[] };

const eventCategories = [
  { value: 'school', label: 'Colegio' }, { value: 'sport', label: 'Deporte' }, { value: 'study', label: 'Estudio' },
  { value: 'health', label: 'Salud' }, { value: 'social', label: 'Social' }, { value: 'family', label: 'Familia' }, { value: 'other', label: 'Otro' },
];
const academicTypes = [
  { value: 'task', label: 'Tarea' }, { value: 'test', label: 'Prueba' }, { value: 'exam', label: 'Examen' }, { value: 'project', label: 'Proyecto' },
];
const priorities = [
  { value: 'normal', label: 'Normal' }, { value: 'high', label: 'Alta' }, { value: 'urgent', label: 'Urgente' }, { value: 'low', label: 'Baja' },
];
const durations = [30, 45, 60, 90, 120].map(value => ({ value, label: `${value} min` }));
const estimates = [15, 25, 30, 45, 60, 90].map(value => ({ value, label: `${value} min` }));
const travelOptions = [0, 10, 20, 30, 45].map(value => ({ value, label: value === 0 ? 'Sin traslado' : `${value} min` }));

function firstParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function childName(child: Child) { return child.preferred_name || child.first_name; }

export default function EditActivity() {
  const params = useLocalSearchParams<{ kind?: string | string[]; id?: string | string[] }>();
  const rawKind = firstParam(params.kind);
  const id = firstParam(params.id) ?? '';
  const kind: ActivityKind = rawKind === 'academic' ? 'academic' : 'event';

  const [context, setContext] = useState<Context>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [childId, setChildId] = useState('');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(new Date());
  const [category, setCategory] = useState(kind === 'event' ? 'school' : 'task');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [travelMinutes, setTravelMinutes] = useState(0);
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [priority, setPriority] = useState('normal');
  const [subject, setSubject] = useState('');
  const [materials, setMaterials] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [sensitivity, setSensitivity] = useState<'normal' | 'private'>('normal');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setLoadError(false);
      if (!id) { setLoadError(true); setLoading(false); return; }
      try {
        const [detail, contextResult] = await Promise.all([
          getActivityDetail(kind, id),
          supabase.rpc('after_my_context'),
        ]);
        if (!active) return;
        if (contextResult.error) throw contextResult.error;
        setContext((contextResult.data ?? {}) as Context);
        setChildId(detail.student_id ?? '');
        setTitle(detail.title);
        setCategory(detail.category);
        const start = detail.starts_at ? new Date(detail.starts_at) : new Date();
        setWhen(Number.isNaN(start.getTime()) ? new Date() : start);
        setLocation(detail.location ?? '');
        setNotes(detail.notes ?? detail.description ?? '');
        setTravelMinutes(Number(detail.travel_minutes ?? 0));
        setEstimatedMinutes(Number(detail.estimated_minutes ?? 30));
        setPriority(detail.priority ?? 'normal');
        setSubject(detail.subject ?? '');
        setMaterials((detail.materials ?? []).join(', '));
        setSensitivity(detail.sensitivity === 'private' ? 'private' : 'normal');
        if (kind === 'event' && detail.starts_at && detail.ends_at) {
          const startMs = new Date(detail.starts_at).getTime();
          const endMs = new Date(detail.ends_at).getTime();
          if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) setDurationMinutes(Math.max(5, Math.round((endMs - startMs) / 60000)));
        }
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [id, kind]);

  const children = context.students ?? [];
  const canSave = useMemo(() => Boolean(id && childId && title.trim() && !busy), [id, childId, title, busy]);

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      if (kind === 'event') {
        await updateEvent(id, {
          studentId: childId,
          category,
          title,
          startsAt: when,
          durationMinutes,
          travelMinutes,
          location,
          notes,
          sensitivity,
        });
      } else {
        await updateAcademic(id, {
          studentId: childId,
          type: category,
          title,
          description: notes,
          dueAt: when,
          priority,
          subject,
          materials: materials.split(',').map(item => item.trim()).filter(Boolean).slice(0, 20),
          estimatedMinutes,
        });
      }
      Alert.alert('Actualizado', 'After ya usa el nuevo horario y los nuevos datos.');
      router.replace('/(app)/agenda');
    } catch (error) {
      Alert.alert('No pudimos actualizar', error instanceof Error ? error.message : 'Vuelve a intentar.');
    } finally {
      setBusy(false);
    }
  }

  function confirmCancel() {
    Alert.alert(kind === 'event' ? 'Cancelar actividad' : 'Cancelar pendiente', 'Dejará de aparecer en el flujo diario, pero no se eliminará el registro.', [
      { text: 'Volver', style: 'cancel' },
      { text: 'Cancelar actividad', style: 'destructive', onPress: () => void performCancel() },
    ]);
  }

  async function performCancel() {
    if (busy) return;
    setBusy(true);
    try {
      await cancelActivity(kind, id);
      router.replace('/(app)/agenda');
    } catch (error) {
      Alert.alert('No pudimos cancelarla', error instanceof Error ? error.message : 'Vuelve a intentar.');
    } finally { setBusy(false); }
  }

  async function duplicate() {
    if (busy) return;
    setBusy(true);
    try {
      const copy = await duplicateActivity(kind, id);
      Alert.alert('Duplicada', 'Creamos una copia. Ajusta su fecha u hora para reutilizarla.');
      router.replace({ pathname: '/(app)/editar', params: { kind: copy.kind, id: copy.id } });
    } catch (error) {
      Alert.alert('No pudimos duplicarla', error instanceof Error ? error.message : 'Vuelve a intentar.');
    } finally { setBusy(false); }
  }

  if (loading) return <SafeAreaView style={s.safe}><View style={s.center}><ActivityIndicator /><Text style={s.muted}>Abriendo actividad…</Text></View></SafeAreaView>;
  if (loadError) return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.errorTitle}>No pudimos abrir esta actividad</Text><Text style={s.muted}>Puede haberse movido o tu conexión puede estar interrumpida.</Text><Pressable onPress={() => router.back()} style={s.primary}><Text style={s.primaryText}>Volver</Text></Pressable></View></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹ Volver</Text></Pressable>
        <Text style={s.kicker}>EDITAR</Text><Text style={s.title}>{kind === 'event' ? 'Ajusta la actividad' : 'Ajusta el pendiente'}</Text>
        <Text style={s.copy}>Cambiar una hora no debería obligarte a crear todo de nuevo.</Text>

        <View style={s.group}><Text style={s.label}>¿Para quién?</Text><View style={s.chips}>{children.map(child => { const selected = childId === child.id; return <Pressable key={child.id} onPress={() => setChildId(child.id)} style={[s.personChip, selected && s.personActive]}><Text style={[s.personText, selected && s.personTextActive]}>{childName(child)}</Text></Pressable>; })}</View></View>

        {kind === 'event' ? <ChoiceChips label="Tipo" value={category} onChange={setCategory} options={eventCategories} /> : <ChoiceChips label="Tipo" value={category} onChange={setCategory} options={academicTypes} />}
        <View style={s.group}><Text style={s.label}>Título</Text><TextInput value={title} onChangeText={setTitle} maxLength={180} style={s.input} /></View>
        <ScheduleField value={when} onChange={setWhen} label={kind === 'event' ? '¿Cuándo empieza?' : '¿Para cuándo?'} />

        {kind === 'event' ? (
          <>
            <ChoiceChips label="Duración" value={durationMinutes} onChange={setDurationMinutes} options={durations} />
            <ChoiceChips label="Traslado antes" value={travelMinutes} onChange={setTravelMinutes} options={travelOptions} />
            <View style={s.group}><Text style={s.label}>Lugar</Text><TextInput value={location} onChangeText={setLocation} maxLength={240} placeholder="Opcional" placeholderTextColor="#A69A90" style={s.input} /></View>
          </>
        ) : (
          <>
            <ChoiceChips label="Tiempo estimado" value={estimatedMinutes} onChange={setEstimatedMinutes} options={estimates} />
            <ChoiceChips label="Prioridad" value={priority} onChange={setPriority} options={priorities} />
            <View style={s.group}><Text style={s.label}>Asignatura</Text><TextInput value={subject} onChangeText={setSubject} maxLength={100} placeholder="Opcional" placeholderTextColor="#A69A90" style={s.input} /></View>
            <View style={s.group}><Text style={s.label}>Materiales</Text><TextInput value={materials} onChangeText={setMaterials} placeholder="Separados por coma" placeholderTextColor="#A69A90" style={s.input} /></View>
          </>
        )}

        <View style={s.group}><Text style={s.label}>Nota</Text><TextInput value={notes} onChangeText={setNotes} multiline maxLength={2000} style={[s.input, s.note]} /></View>

        <Pressable disabled={!canSave} onPress={() => void save()} style={[s.save, !canSave && s.disabled]}><Text style={s.saveText}>{busy ? 'Guardando…' : 'Guardar cambios'}</Text></Pressable>
        <View style={s.secondaryRow}>
          <Pressable disabled={busy} onPress={() => void duplicate()} style={s.secondary}><Text style={s.secondaryText}>Duplicar</Text></Pressable>
          <Pressable disabled={busy} onPress={confirmCancel} style={s.danger}><Text style={s.dangerText}>Cancelar</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF8F1' }, body: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 70, gap: 18 },
  back: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: 12 }, backText: { fontSize: 14, fontWeight: '900', color: '#6B655D' },
  kicker: { fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2, color: '#9A765D' }, title: { fontSize: 30, lineHeight: 35, fontWeight: '900', color: '#2B2926', marginTop: -12 }, copy: { fontSize: 14.5, lineHeight: 21, color: '#756B62', marginTop: -11 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28 }, muted: { fontSize: 13, lineHeight: 19, color: '#81756A', textAlign: 'center' }, errorTitle: { fontSize: 19, fontWeight: '900', color: '#302D29', textAlign: 'center' },
  group: { gap: 8 }, label: { fontSize: 13, fontWeight: '800', color: '#5E5A52' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  personChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: '#E7DCD1', backgroundColor: '#FFFDF9' }, personActive: { backgroundColor: '#F58B57', borderColor: '#F58B57' }, personText: { fontSize: 13, fontWeight: '900', color: '#655B52' }, personTextActive: { color: '#FFFFFF' },
  input: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: '#E7DCD1', backgroundColor: '#FFFDF9', paddingHorizontal: 14, fontSize: 15, color: '#2B2926' }, note: { minHeight: 92, textAlignVertical: 'top', paddingTop: 13 },
  save: { minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#597657' }, disabled: { opacity: .45 }, saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  secondaryRow: { flexDirection: 'row', gap: 10 }, secondary: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#D8CDC3', backgroundColor: '#FFFDF9' }, secondaryText: { fontSize: 13, fontWeight: '900', color: '#625A53' }, danger: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#FBE4E0' }, dangerText: { fontSize: 13, fontWeight: '900', color: '#A94E45' }, primary: { minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 15, backgroundColor: '#597657' }, primaryText: { color: '#FFFFFF', fontWeight: '900' },
});
