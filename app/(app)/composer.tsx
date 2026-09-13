import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ChoiceChips } from '@/components/after/ChoiceChips';
import { ScheduleField } from '@/components/ScheduleField';
import { createAcademic, createEvent, getConflicts } from '@/lib/activities';
import { supabase } from '@/lib/supabase';

type Child = { id: string; first_name: string; preferred_name?: string | null };
type Context = { family_id?: string; students?: Child[] };
type Mode = 'event' | 'academic';

type Repeat = 'none' | 'daily' | 'weekly';

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
const repeats: Array<{ value: Repeat; label: string }> = [
  { value: 'none', label: 'No' }, { value: 'weekly', label: 'Cada semana' }, { value: 'daily', label: 'Cada día' },
];
const repeatCounts = [2, 4, 8, 12].map(value => ({ value, label: `${value} veces` }));

function childName(child: Child) { return child.preferred_name || child.first_name; }
function defaultWhen() { const date = new Date(); date.setMinutes(date.getMinutes() < 30 ? 30 : 0, 0, 0); if (date.getMinutes() === 0) date.setHours(date.getHours() + 1); return date; }

export default function Composer() {
  const [context, setContext] = useState<Context>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>('event');
  const [childId, setChildId] = useState('');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(defaultWhen);
  const [category, setCategory] = useState('school');
  const [academicType, setAcademicType] = useState('task');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [travelMinutes, setTravelMinutes] = useState(0);
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [repeatCount, setRepeatCount] = useState(4);
  const [priority, setPriority] = useState('normal');
  const [subject, setSubject] = useState('');
  const [materials, setMaterials] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error } = await supabase.rpc('after_my_context');
      if (!active) return;
      if (error) {
        setLoading(false);
        Alert.alert('No pudimos abrir el formulario', 'Revisa tu conexión e intenta nuevamente.');
        return;
      }
      const next = (data ?? {}) as Context;
      setContext(next);
      const first = next.students?.[0];
      if (first) setChildId(first.id);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  const children = context.students ?? [];
  const canSave = useMemo(() => Boolean(context.family_id && childId && title.trim() && !saving), [context.family_id, childId, title, saving]);

  async function save() {
    if (!context.family_id || !childId || !title.trim() || saving) return;
    setSaving(true);
    try {
      if (mode === 'event') {
        const created = await createEvent({
          familyId: context.family_id,
          studentId: childId,
          category,
          title,
          startsAt: when,
          durationMinutes,
          travelMinutes,
          location,
          notes,
          sensitivity: category === 'health' ? 'private' : 'normal',
          repeat,
          repeatCount,
        });
        const ids = created?.ids ?? [];
        let warning = false;
        try {
          const conflicts = await getConflicts(14);
          warning = conflicts.some(item => ids.includes(item.first_id) || ids.includes(item.second_id));
        } catch {
          warning = false;
        }
        Alert.alert(warning ? 'Guardado con un aviso' : 'Guardado', warning ? 'La actividad quedó registrada, pero detectamos un cruce de horario o traslado. Revísalo en Semana.' : 'La actividad ya forma parte del día.');
      } else {
        await createAcademic({
          studentId: childId,
          type: academicType,
          title,
          description: notes,
          dueAt: when,
          priority,
          subject,
          materials: materials.split(',').map(item => item.trim()).filter(Boolean).slice(0, 20),
          estimatedMinutes,
        });
        Alert.alert('Guardado', 'El pendiente quedó incorporado a After.');
      }
      router.replace('/(app)/agenda');
    } catch (error) {
      Alert.alert('No pudimos guardar', error instanceof Error ? error.message : 'Revisa los datos e intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SafeAreaView style={s.safe}><View style={s.loading}><ActivityIndicator /><Text style={s.muted}>Preparando un formulario corto…</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.topRow}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹ Volver</Text></Pressable>
        </View>
        <Text style={s.kicker}>AGREGAR</Text>
        <Text style={s.title}>Que tome segundos, no minutos.</Text>
        <Text style={s.copy}>Primero lo esencial. Los detalles aparecen sólo si los necesitas.</Text>

        <ChoiceChips<Mode> label="¿Qué vas a agregar?" value={mode} onChange={setMode} options={[{ value: 'event', label: 'Actividad' }, { value: 'academic', label: 'Tarea o prueba' }]} />

        <View style={s.fieldGroup}>
          <Text style={s.label}>¿Para quién?</Text>
          <View style={s.chipRow}>
            {children.map(child => {
              const selected = childId === child.id;
              return <Pressable key={child.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setChildId(child.id)} style={[s.personChip, selected && s.personChipActive]}><Text style={[s.personText, selected && s.personTextActive]}>{childName(child)}</Text></Pressable>;
            })}
          </View>
        </View>

        {mode === 'event' ? <ChoiceChips label="Tipo" value={category} onChange={setCategory} options={eventCategories} /> : <ChoiceChips label="Tipo" value={academicType} onChange={setAcademicType} options={academicTypes} />}

        <View style={s.fieldGroup}>
          <Text style={s.label}>¿Qué es?</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={180} placeholder={mode === 'event' ? 'Ej. Entrenamiento' : 'Ej. Prueba de Ciencias'} placeholderTextColor="#A69A90" style={s.input} returnKeyType="done" />
        </View>

        <ScheduleField value={when} onChange={setWhen} label={mode === 'event' ? '¿Cuándo empieza?' : '¿Para cuándo?'} />

        {mode === 'event' ? (
          <>
            <ChoiceChips label="¿Cuánto dura?" value={durationMinutes} onChange={setDurationMinutes} options={durations} />
            <ChoiceChips<Repeat> label="¿Se repite?" value={repeat} onChange={setRepeat} options={repeats} />
            {repeat !== 'none' ? <ChoiceChips label="¿Cuántas veces?" value={repeatCount} onChange={setRepeatCount} options={repeatCounts} /> : null}
          </>
        ) : <ChoiceChips label="Tiempo estimado" value={estimatedMinutes} onChange={setEstimatedMinutes} options={estimates} />}

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(value => !value)} style={s.detailsToggle}>
          <Text style={s.detailsText}>{showDetails ? 'Ocultar detalles' : 'Agregar detalles opcionales'}</Text><Text style={s.detailsArrow}>{showDetails ? '−' : '+'}</Text>
        </Pressable>

        {showDetails ? (
          <View style={s.detailsBox}>
            {mode === 'event' ? (
              <>
                <ChoiceChips label="Tiempo de traslado antes" value={travelMinutes} onChange={setTravelMinutes} options={travelOptions} />
                <View style={s.fieldGroup}><Text style={s.label}>Lugar</Text><TextInput value={location} onChangeText={setLocation} maxLength={240} placeholder="Opcional" placeholderTextColor="#A69A90" style={s.input} /></View>
              </>
            ) : (
              <>
                <ChoiceChips label="Prioridad" value={priority} onChange={setPriority} options={priorities} />
                <View style={s.fieldGroup}><Text style={s.label}>Asignatura</Text><TextInput value={subject} onChangeText={setSubject} maxLength={100} placeholder="Ej. Matemática" placeholderTextColor="#A69A90" style={s.input} /></View>
                <View style={s.fieldGroup}><Text style={s.label}>Materiales</Text><TextInput value={materials} onChangeText={setMaterials} placeholder="Ej. cartulina, cuaderno" placeholderTextColor="#A69A90" style={s.input} /></View>
              </>
            )}
            <View style={s.fieldGroup}><Text style={s.label}>Nota</Text><TextInput value={notes} onChangeText={setNotes} maxLength={2000} multiline placeholder="Sólo si hace falta contexto" placeholderTextColor="#A69A90" style={[s.input, s.note]} /></View>
          </View>
        ) : null}

        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSave }} disabled={!canSave} onPress={() => void save()} style={[s.save, !canSave && s.saveDisabled]}>
          <Text style={s.saveText}>{saving ? 'Guardando…' : 'Guardar'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF8F1' },
  body: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 70, gap: 18 },
  topRow: { flexDirection: 'row' }, back: { minHeight: 44, justifyContent: 'center', paddingRight: 12 }, backText: { fontSize: 14, fontWeight: '900', color: '#6B655D' },
  kicker: { fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2, color: '#9A765D' },
  title: { fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -.8, color: '#2B2926' },
  copy: { fontSize: 14.5, lineHeight: 21, color: '#756B62', marginTop: -10 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 }, muted: { fontSize: 13, color: '#81756A' },
  fieldGroup: { gap: 8 }, label: { fontSize: 13, fontWeight: '800', color: '#5E5A52' },
  input: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: '#E7DCD1', backgroundColor: '#FFFDF9', paddingHorizontal: 14, fontSize: 15, color: '#2B2926' },
  note: { minHeight: 92, paddingTop: 13, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  personChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: '#E7DCD1', backgroundColor: '#FFFDF9' },
  personChipActive: { backgroundColor: '#F58B57', borderColor: '#F58B57' }, personText: { fontSize: 13, fontWeight: '900', color: '#655B52' }, personTextActive: { color: '#FFFFFF' },
  detailsToggle: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E9DED4' },
  detailsText: { fontSize: 14, fontWeight: '900', color: '#5D5A55' }, detailsArrow: { fontSize: 22, color: '#8B7B6E' },
  detailsBox: { gap: 18, backgroundColor: '#FFFDF9', borderRadius: 20, borderWidth: 1, borderColor: '#EEE2D8', padding: 15 },
  save: { minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#597657' }, saveDisabled: { opacity: .45 }, saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
