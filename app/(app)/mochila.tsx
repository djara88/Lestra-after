import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AfterGlyph } from '@/components/AfterGlyph';
import {
  deleteScheduleEntry,
  getBackpackStudents,
  getBackpackWorkspace,
  saveScheduleEntry,
  setSubjectBackpackItems,
  shiftDate,
  shortTime,
  toggleBackpackItem,
  weekdayLabel,
  type BackpackStudent,
  type BackpackSubject,
  type BackpackWorkspace,
  type ScheduleEntry,
} from '@/lib/backpack';

type Mode = 'prepare' | 'schedule';

function childName(child: BackpackStudent) {
  return child.preferred_name || child.first_name;
}

function prettyDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function validTime(value: string) {
  if (!value.trim()) return true;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim())) return false;
  return true;
}

export default function Backpack() {
  const params = useLocalSearchParams<{ studentId?: string }>();
  const [students, setStudents] = useState<BackpackStudent[]>([]);
  const [studentId, setStudentId] = useState('');
  const [workspace, setWorkspace] = useState<BackpackWorkspace | null>(null);
  const [mode, setMode] = useState<Mode>('prepare');
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [weekday, setWeekday] = useState(1);
  const [showEntryEditor, setShowEntryEditor] = useState(false);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [periodOrder, setPeriodOrder] = useState('1');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [room, setRoom] = useState('');
  const [materialSubject, setMaterialSubject] = useState<BackpackSubject | null>(null);
  const [materialText, setMaterialText] = useState('');

  const loadWorkspace = useCallback(async (id: string, targetDate?: string | null) => {
    if (!id) return;
    setLoadError(false);
    try {
      const next = await getBackpackWorkspace(id, targetDate);
      setWorkspace(next);
      setWeekday(current => current || Math.min(next.target_weekday, 5));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    async function start() {
      setLoading(true);
      try {
        const list = await getBackpackStudents();
        if (!active) return;
        setStudents(list);
        const requested = typeof params.studentId === 'string' ? params.studentId : '';
        const selected = list.some(item => item.id === requested) ? requested : list[0]?.id || '';
        setStudentId(selected);
        if (selected) await loadWorkspace(selected, null);
        else setLoading(false);
      } catch {
        if (active) {
          setLoadError(true);
          setLoading(false);
        }
      }
    }
    void start();
    return () => { active = false; };
  }, [loadWorkspace, params.studentId]));

  const selectedChild = useMemo(() => students.find(item => item.id === studentId), [students, studentId]);
  const dayEntries = useMemo(() => (workspace?.schedule ?? []).filter(item => item.weekday === weekday).sort((a, b) => a.period_order - b.period_order), [workspace?.schedule, weekday]);
  const packedCount = workspace?.checklist.filter(item => item.packed).length ?? 0;
  const totalCount = workspace?.checklist.length ?? 0;
  const progress = totalCount ? Math.round((packedCount / totalCount) * 100) : 0;

  async function changeChild(id: string) {
    if (id === studentId) return;
    setStudentId(id);
    setLoading(true);
    setWorkspace(null);
    await loadWorkspace(id, null);
  }

  async function moveDate(days: number) {
    if (!workspace) return;
    setLoading(true);
    await loadWorkspace(studentId, shiftDate(workspace.target_date, days));
  }

  async function toggleItem(itemKey: string, packed: boolean) {
    if (!workspace || busyKey) return;
    setBusyKey(itemKey);
    setWorkspace(current => current ? { ...current, checklist: current.checklist.map(item => item.item_key === itemKey ? { ...item, packed } : item) } : current);
    try {
      await toggleBackpackItem(studentId, workspace.target_date, itemKey, packed);
    } catch (error) {
      setWorkspace(current => current ? { ...current, checklist: current.checklist.map(item => item.item_key === itemKey ? { ...item, packed: !packed } : item) } : current);
      Alert.alert('No pudimos actualizar', error instanceof Error ? error.message : 'Vuelve a intentar.');
    } finally {
      setBusyKey(null);
    }
  }

  function openNewEntry() {
    const nextBlock = dayEntries.length ? Math.min(20, Math.max(...dayEntries.map(item => item.period_order)) + 1) : 1;
    setEntryId(null);
    setSubjectName('');
    setPeriodOrder(String(nextBlock));
    setStartTime('');
    setEndTime('');
    setRoom('');
    setShowEntryEditor(true);
  }

  function openEditEntry(entry: ScheduleEntry) {
    setEntryId(entry.id);
    setSubjectName(entry.subject_name);
    setPeriodOrder(String(entry.period_order));
    setStartTime(shortTime(entry.start_time));
    setEndTime(shortTime(entry.end_time));
    setRoom(entry.room || '');
    setShowEntryEditor(true);
  }

  async function saveEntry() {
    const block = Number(periodOrder);
    if (!studentId || !subjectName.trim() || !Number.isInteger(block) || block < 1 || block > 20) {
      Alert.alert('Revisa el bloque', 'Escribe una asignatura y un número de bloque entre 1 y 20.');
      return;
    }
    if (!validTime(startTime) || !validTime(endTime)) {
      Alert.alert('Revisa la hora', 'Usa formato HH:MM, por ejemplo 08:00. También puedes dejarla vacía.');
      return;
    }
    if (startTime && endTime && startTime >= endTime) {
      Alert.alert('Revisa la hora', 'La hora de término debe ser posterior a la de inicio.');
      return;
    }
    setBusyKey('entry');
    try {
      await saveScheduleEntry({
        entryId,
        studentId,
        weekday,
        periodOrder: block,
        subjectName,
        startTime: startTime.trim() || null,
        endTime: endTime.trim() || null,
        room: room.trim() || null,
      });
      setShowEntryEditor(false);
      await loadWorkspace(studentId, workspace?.target_date || null);
    } catch (error) {
      Alert.alert('No pudimos guardar', error instanceof Error ? error.message : 'Vuelve a intentar.');
    } finally {
      setBusyKey(null);
    }
  }

  function confirmDelete(entry: ScheduleEntry) {
    Alert.alert('Eliminar bloque', `${entry.subject_name} dejará de aparecer los ${weekdayLabel(entry.weekday).toLowerCase()}.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void removeEntry(entry.id) },
    ]);
  }

  async function removeEntry(id: string) {
    setBusyKey(id);
    try {
      await deleteScheduleEntry(id);
      await loadWorkspace(studentId, workspace?.target_date || null);
    } catch (error) {
      Alert.alert('No pudimos eliminar', error instanceof Error ? error.message : 'Vuelve a intentar.');
    } finally {
      setBusyKey(null);
    }
  }

  function openMaterials(subject: BackpackSubject) {
    setMaterialSubject(subject);
    setMaterialText(subject.items.map(item => item.name).join(', '));
  }

  async function saveMaterials() {
    if (!materialSubject) return;
    const items = materialText.split(',').map(value => value.trim()).filter(Boolean).slice(0, 20);
    setBusyKey('materials');
    try {
      await setSubjectBackpackItems(studentId, materialSubject.id, items);
      setMaterialSubject(null);
      await loadWorkspace(studentId, workspace?.target_date || null);
    } catch (error) {
      Alert.alert('No pudimos guardar', error instanceof Error ? error.message : 'Vuelve a intentar.');
    } finally {
      setBusyKey(null);
    }
  }

  if (loading && !workspace) {
    return <SafeAreaView style={s.safe}><View style={s.center}><ActivityIndicator color="#F28B57"/><Text style={s.muted}>Preparando la mochila…</Text></View></SafeAreaView>;
  }

  if (loadError && !workspace) {
    return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.errorTitle}>No pudimos abrir la mochila</Text><Text style={s.mutedCenter}>Tu información no se perdió. Revisa la conexión y vuelve a intentar.</Text><Pressable style={s.primary} onPress={() => { setLoading(true); void loadWorkspace(studentId, null); }}><Text style={s.primaryText}>Reintentar</Text></Pressable></View></SafeAreaView>;
  }

  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={s.topRow}><Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹</Text></Pressable><View style={s.heroMark}><AfterGlyph kind="backpack" active size={38} surface={false}/></View></View>
      <Text style={s.eyebrow}>RUTINA ESCOLAR</Text>
      <Text style={s.title}>La mochila se prepara antes, no a última hora.</Text>
      <Text style={s.copy}>After combina el horario semanal con materiales habituales y lo extraordinario que mandó el colegio.</Text>

      {students.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.childChips}>{students.map(child => {
        const active = child.id === studentId;
        return <Pressable key={child.id} onPress={() => void changeChild(child.id)} style={[s.childChip, active && s.childChipActive]}><Text style={[s.childChipText, active && s.childChipTextActive]}>{childName(child)}</Text></Pressable>;
      })}</ScrollView> : selectedChild ? <View style={s.singleChild}><Text style={s.singleChildName}>{childName(selectedChild)}</Text><Text style={s.singleChildMeta}>{selectedChild.grade_level || 'Horario escolar'}{selectedChild.school_name ? ` · ${selectedChild.school_name}` : ''}</Text></View> : null}

      <View style={s.segment}>
        <Pressable onPress={() => setMode('prepare')} style={[s.segmentButton, mode === 'prepare' && s.segmentActive]}><Text style={[s.segmentText, mode === 'prepare' && s.segmentTextActive]}>Preparar mochila</Text></Pressable>
        <Pressable onPress={() => setMode('schedule')} style={[s.segmentButton, mode === 'schedule' && s.segmentActive]}><Text style={[s.segmentText, mode === 'schedule' && s.segmentTextActive]}>Horario semanal</Text></Pressable>
      </View>

      {mode === 'prepare' && workspace ? <>
        <View style={s.dateCard}>
          <Pressable accessibilityRole="button" accessibilityLabel="Día anterior" onPress={() => void moveDate(-1)} style={s.dateArrow}><Text style={s.dateArrowText}>‹</Text></Pressable>
          <View style={s.dateCenter}><Text style={s.dateKicker}>PREPARAR PARA</Text><Text style={s.dateTitle}>{prettyDate(workspace.target_date)}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Día siguiente" onPress={() => void moveDate(1)} style={s.dateArrow}><Text style={s.dateArrowText}>›</Text></Pressable>
        </View>

        <View style={s.progressCard}>
          <View style={s.progressHead}><View><Text style={s.sectionKicker}>MOCHILA</Text><Text style={s.sectionTitle}>{totalCount === 0 ? 'Todavía sin lista' : `${packedCount} de ${totalCount} listo${packedCount === 1 ? '' : 's'}`}</Text></View><Text style={s.progressPercent}>{progress}%</Text></View>
          <View style={s.progressTrack}><View style={[s.progressFill, { width: `${progress}%` }]}/></View>
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}><View><Text style={s.sectionKicker}>CLASES</Text><Text style={s.sectionTitle}>{weekdayLabel(workspace.target_weekday)}</Text></View><Text style={s.count}>{workspace.classes.length}</Text></View>
          {workspace.classes.length === 0 ? <View style={s.empty}><View style={s.emptySignal}><View style={s.emptyLine}/><View style={s.emptyDot}/></View><View style={s.flex}><Text style={s.emptyTitle}>No hay clases registradas para este día</Text><Text style={s.muted}>Configura el horario semanal para que After sepa qué preparar.</Text></View></View> : workspace.classes.map(item => <View key={item.id} style={s.classRow}><View style={s.classBlock}><Text style={s.classBlockText}>{item.period_order}</Text></View><View style={s.flex}><Text style={s.classTitle}>{item.subject_name}</Text><Text style={s.meta}>{shortTime(item.start_time) || 'Sin hora'}{item.end_time ? `–${shortTime(item.end_time)}` : ''}{item.room ? ` · ${item.room}` : ''}</Text></View></View>)}
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}><View><Text style={s.sectionKicker}>QUÉ LLEVAR</Text><Text style={s.sectionTitle}>Checklist del día</Text></View><Text style={s.count}>{totalCount}</Text></View>
          {workspace.checklist.length === 0 ? <View style={s.empty}><View style={s.emptySignal}><View style={s.emptyLine}/><View style={s.emptyDot}/></View><View style={s.flex}><Text style={s.emptyTitle}>No hay materiales configurados</Text><Text style={s.muted}>En “Horario semanal” agrega lo habitual de cada asignatura. Los materiales extraordinarios de tareas también aparecerán aquí.</Text></View></View> : workspace.checklist.map(item => <Pressable key={item.item_key} accessibilityRole="checkbox" accessibilityState={{ checked: item.packed, disabled: busyKey === item.item_key }} disabled={busyKey === item.item_key} onPress={() => void toggleItem(item.item_key, !item.packed)} style={[s.checkRow, item.packed && s.checkRowDone]}><View style={[s.checkBox, item.packed && s.checkBoxDone]}><View style={item.packed ? s.checkTickA : undefined}/><View style={item.packed ? s.checkTickB : undefined}/></View><View style={s.flex}><Text style={[s.checkTitle, item.packed && s.checkTitleDone]}>{item.name}</Text><Text style={s.meta}>{item.subject_name} · {item.source_type === 'academic' ? 'Pedido especial' : 'Habitual'}</Text></View></Pressable>)}
        </View>

        <Pressable accessibilityRole="button" onPress={() => setMode('schedule')} style={s.secondary}><AfterGlyph kind="week" active size={22} surface={false}/><View style={s.flex}><Text style={s.secondaryTitle}>Configurar horario y materiales</Text><Text style={s.secondaryCopy}>Define una vez qué clases tiene y qué suele llevar.</Text></View><Text style={s.chevron}>›</Text></Pressable>
      </> : null}

      {mode === 'schedule' && workspace ? <>
        <View style={s.weekdays}>{[1,2,3,4,5].map(day => <Pressable key={day} onPress={() => setWeekday(day)} style={[s.dayChip, weekday === day && s.dayChipActive]}><Text style={[s.dayChipText, weekday === day && s.dayChipTextActive]}>{weekdayLabel(day).slice(0,3)}</Text></Pressable>)}</View>

        <View style={s.section}>
          <View style={s.sectionHead}><View><Text style={s.sectionKicker}>HORARIO</Text><Text style={s.sectionTitle}>{weekdayLabel(weekday)}</Text></View><Pressable onPress={openNewEntry} style={s.addButton}><Text style={s.addButtonText}>＋ Bloque</Text></Pressable></View>
          {dayEntries.length === 0 ? <View style={s.empty}><View style={s.emptySignal}><View style={s.emptyLine}/><View style={s.emptyDot}/></View><View style={s.flex}><Text style={s.emptyTitle}>Todavía no hay bloques</Text><Text style={s.muted}>Agrega las asignaturas en el orden en que ocurren durante el día.</Text></View></View> : dayEntries.map(entry => <View key={entry.id} style={s.scheduleRow}><View style={s.classBlock}><Text style={s.classBlockText}>{entry.period_order}</Text></View><Pressable style={s.flex} onPress={() => openEditEntry(entry)}><Text style={s.classTitle}>{entry.subject_name}</Text><Text style={s.meta}>{shortTime(entry.start_time) || 'Sin hora'}{entry.end_time ? `–${shortTime(entry.end_time)}` : ''}{entry.room ? ` · ${entry.room}` : ''}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Eliminar ${entry.subject_name}`} disabled={busyKey === entry.id} onPress={() => confirmDelete(entry)} style={s.deleteButton}><Text style={s.deleteText}>×</Text></Pressable></View>)}
        </View>

        <View style={s.section}>
          <Text style={s.sectionKicker}>MOCHILA BASE</Text><Text style={s.sectionTitle}>Materiales habituales por asignatura</Text><Text style={s.sectionCopy}>Ejemplo: Matemática → cuaderno, libro y estuche. Esto se reutiliza automáticamente cada vez que esa asignatura aparece en el horario.</Text>
          {workspace.subjects.length === 0 ? <Text style={s.muted}>Primero agrega una asignatura al horario.</Text> : workspace.subjects.map(subject => <Pressable key={subject.id} onPress={() => openMaterials(subject)} style={s.subjectRow}><View style={s.subjectMark}><View style={s.subjectMarkLine}/><View style={s.subjectMarkDot}/></View><View style={s.flex}><Text style={s.subjectTitle}>{subject.name}</Text><Text numberOfLines={2} style={s.meta}>{subject.items.length ? subject.items.map(item => item.name).join(' · ') : 'Sin materiales habituales'}</Text></View><Text style={s.chevron}>›</Text></Pressable>)}
        </View>
      </> : null}
    </ScrollView>

    <Modal visible={showEntryEditor} transparent animationType="slide" onRequestClose={() => setShowEntryEditor(false)}>
      <KeyboardAvoidingView style={s.sheetHost} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.scrim} onPress={() => setShowEntryEditor(false)}/>
        <View style={s.sheet}><View style={s.sheetHandle}/><Text style={s.sheetKicker}>{weekdayLabel(weekday).toUpperCase()}</Text><Text style={s.sheetTitle}>{entryId ? 'Editar bloque' : 'Nuevo bloque'}</Text><TextInput style={s.input} value={subjectName} onChangeText={setSubjectName} maxLength={100} placeholder="Asignatura, ej. Matemática" placeholderTextColor="#A59689"/><View style={s.inputRow}><TextInput style={[s.input,s.half]} value={periodOrder} onChangeText={setPeriodOrder} keyboardType="number-pad" maxLength={2} placeholder="Bloque" placeholderTextColor="#A59689"/><TextInput style={[s.input,s.half]} value={room} onChangeText={setRoom} maxLength={80} placeholder="Sala (opcional)" placeholderTextColor="#A59689"/></View><View style={s.inputRow}><TextInput style={[s.input,s.half]} value={startTime} onChangeText={setStartTime} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="08:00" placeholderTextColor="#A59689"/><TextInput style={[s.input,s.half]} value={endTime} onChangeText={setEndTime} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="08:45" placeholderTextColor="#A59689"/></View><Text style={s.sheetHelp}>La hora es opcional. El número de bloque define el orden del día.</Text><Pressable disabled={busyKey === 'entry'} onPress={() => void saveEntry()} style={[s.primary, busyKey === 'entry' && s.disabled]}><Text style={s.primaryText}>{busyKey === 'entry' ? 'Guardando…' : 'Guardar bloque'}</Text></Pressable></View>
      </KeyboardAvoidingView>
    </Modal>

    <Modal visible={Boolean(materialSubject)} transparent animationType="slide" onRequestClose={() => setMaterialSubject(null)}>
      <KeyboardAvoidingView style={s.sheetHost} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.scrim} onPress={() => setMaterialSubject(null)}/>
        <View style={s.sheet}><View style={s.sheetHandle}/><Text style={s.sheetKicker}>MOCHILA BASE</Text><Text style={s.sheetTitle}>{materialSubject?.name}</Text><Text style={s.sheetHelp}>Escribe los materiales habituales separados por coma. Ej.: cuaderno, libro, estuche.</Text><TextInput style={[s.input,s.multiInput]} value={materialText} onChangeText={setMaterialText} multiline maxLength={1200} placeholder="Cuaderno, libro, estuche" placeholderTextColor="#A59689"/><Pressable disabled={busyKey === 'materials'} onPress={() => void saveMaterials()} style={[s.primary, busyKey === 'materials' && s.disabled]}><Text style={s.primaryText}>{busyKey === 'materials' ? 'Guardando…' : 'Guardar materiales'}</Text></Pressable></View>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#FFF8F1'},body:{paddingHorizontal:18,paddingTop:14,paddingBottom:70,gap:16},center:{flex:1,alignItems:'center',justifyContent:'center',padding:30,gap:12},flex:{flex:1},
  topRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},back:{width:44,height:44,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'#FFFDF9',borderWidth:1,borderColor:'#E9DED4'},backText:{fontSize:30,lineHeight:32,color:'#4D453E'},heroMark:{width:52,height:52,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#EEF3E9'},
  eyebrow:{fontSize:10.5,fontWeight:'900',letterSpacing:1.25,color:'#9A735B'},title:{fontSize:32,lineHeight:37,fontWeight:'900',letterSpacing:-.8,color:'#2D2A27'},copy:{fontSize:14.5,lineHeight:21,color:'#75695F'},
  childChips:{gap:8,paddingVertical:1},childChip:{minHeight:44,justifyContent:'center',paddingHorizontal:16,borderRadius:999,backgroundColor:'#FFFDF9',borderWidth:1,borderColor:'#E7DBCF'},childChipActive:{backgroundColor:'#597657',borderColor:'#597657'},childChipText:{fontSize:14,fontWeight:'800',color:'#655A51'},childChipTextActive:{color:'#FFF'},singleChild:{padding:13,borderRadius:17,backgroundColor:'#EEF3E9'},singleChildName:{fontSize:16,fontWeight:'900',color:'#314631'},singleChildMeta:{fontSize:12,color:'#6F7E6B',marginTop:2},
  segment:{flexDirection:'row',padding:5,borderRadius:18,backgroundColor:'#EDE8E1'},segmentButton:{flex:1,minHeight:46,alignItems:'center',justifyContent:'center',borderRadius:14},segmentActive:{backgroundColor:'#FFFDF9'},segmentText:{fontSize:13.5,fontWeight:'800',color:'#837970'},segmentTextActive:{color:'#314A38'},
  dateCard:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#F58B57',borderRadius:24,padding:13},dateArrow:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#FFF0E7'},dateArrowText:{fontSize:28,lineHeight:30,color:'#9A4D2A'},dateCenter:{flex:1,alignItems:'center'},dateKicker:{fontSize:9.5,fontWeight:'900',letterSpacing:1.1,color:'#FFE8DA'},dateTitle:{fontSize:17,lineHeight:23,fontWeight:'900',color:'#FFF',textTransform:'capitalize',textAlign:'center'},
  progressCard:{backgroundColor:'#314A38',borderRadius:22,padding:17,gap:12},progressHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end'},progressPercent:{fontSize:24,fontWeight:'900',color:'#F7D9C7'},progressTrack:{height:8,borderRadius:999,backgroundColor:'#49634F',overflow:'hidden'},progressFill:{height:8,borderRadius:999,backgroundColor:'#F58B57'},
  section:{gap:8},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},sectionKicker:{fontSize:10,fontWeight:'900',letterSpacing:1.1,color:'#859178'},sectionTitle:{fontSize:20,lineHeight:25,fontWeight:'900',color:'#302D29'},sectionCopy:{fontSize:12.5,lineHeight:18,color:'#81756B',marginTop:4},count:{minWidth:28,textAlign:'center',paddingHorizontal:8,paddingVertical:5,borderRadius:999,overflow:'hidden',backgroundColor:'#EFE9E2',fontSize:12,fontWeight:'900',color:'#75695F'},
  classRow:{minHeight:58,flexDirection:'row',alignItems:'center',gap:11,paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#EDE1D7'},classBlock:{width:36,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#FFE3D1'},classBlockText:{fontSize:13,fontWeight:'900',color:'#9B512F'},classTitle:{fontSize:15,fontWeight:'900',color:'#302D29'},meta:{fontSize:11.5,lineHeight:17,color:'#887B70',marginTop:2},
  empty:{flexDirection:'row',gap:12,alignItems:'center',padding:14,borderRadius:18,backgroundColor:'#FFFDF9',borderWidth:1,borderColor:'#EBE0D6'},emptySignal:{width:34,height:34,position:'relative'},emptyLine:{position:'absolute',width:24,height:2,borderRadius:2,backgroundColor:'#B8C3B0',left:4,top:16},emptyDot:{position:'absolute',width:8,height:8,borderRadius:4,backgroundColor:'#F58B57',right:2,top:13},emptyTitle:{fontSize:14.5,fontWeight:'900',color:'#3E3934'},muted:{fontSize:12.5,lineHeight:18,color:'#82776D',marginTop:2},mutedCenter:{fontSize:13,lineHeight:19,color:'#82776D',textAlign:'center'},errorTitle:{fontSize:20,fontWeight:'900',color:'#302D29',textAlign:'center'},
  checkRow:{minHeight:60,flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:17,backgroundColor:'#FFFDF9',borderWidth:1,borderColor:'#E9DED4'},checkRowDone:{backgroundColor:'#EFF5EB',borderColor:'#D6E2D0'},checkBox:{width:30,height:30,borderRadius:10,borderWidth:1.5,borderColor:'#A8B59F',backgroundColor:'#FFFDF9',position:'relative'},checkBoxDone:{backgroundColor:'#597657',borderColor:'#597657'},checkTickA:{position:'absolute',width:3,height:8,borderRadius:2,backgroundColor:'#FFF',left:9,top:12,transform:[{rotate:'-42deg'}]},checkTickB:{position:'absolute',width:3,height:13,borderRadius:2,backgroundColor:'#FFF',left:17,top:7,transform:[{rotate:'42deg'}]},checkTitle:{fontSize:14.5,fontWeight:'850',color:'#332F2B'},checkTitleDone:{textDecorationLine:'line-through',color:'#71806C'},
  secondary:{minHeight:70,flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:19,backgroundColor:'#FFFDF9',borderWidth:1,borderColor:'#E9DED4'},secondaryTitle:{fontSize:14.5,fontWeight:'900',color:'#302D29'},secondaryCopy:{fontSize:11.5,lineHeight:16,color:'#887B70',marginTop:2},chevron:{fontSize:25,color:'#9A8E84'},
  weekdays:{flexDirection:'row',gap:7},dayChip:{flex:1,minHeight:46,alignItems:'center',justifyContent:'center',borderRadius:14,backgroundColor:'#FFFDF9',borderWidth:1,borderColor:'#E8DDD2'},dayChipActive:{backgroundColor:'#314A38',borderColor:'#314A38'},dayChipText:{fontSize:12.5,fontWeight:'900',color:'#74685E'},dayChipTextActive:{color:'#FFF'},
  addButton:{minHeight:42,justifyContent:'center',paddingHorizontal:13,borderRadius:13,backgroundColor:'#FFE7D7'},addButtonText:{fontSize:12.5,fontWeight:'900',color:'#99502F'},scheduleRow:{minHeight:62,flexDirection:'row',alignItems:'center',gap:11,paddingVertical:9,borderBottomWidth:1,borderBottomColor:'#EDE1D7'},deleteButton:{width:44,height:44,alignItems:'center',justifyContent:'center'},deleteText:{fontSize:23,color:'#A96B5F'},
  subjectRow:{minHeight:64,flexDirection:'row',alignItems:'center',gap:11,paddingVertical:9,borderBottomWidth:1,borderBottomColor:'#EDE1D7'},subjectMark:{width:36,height:36,borderRadius:12,backgroundColor:'#EEF3E9',position:'relative'},subjectMarkLine:{position:'absolute',width:17,height:2,borderRadius:2,backgroundColor:'#5B7457',left:9,top:17},subjectMarkDot:{position:'absolute',width:6,height:6,borderRadius:3,backgroundColor:'#F58B57',left:15,top:8},subjectTitle:{fontSize:14.5,fontWeight:'900',color:'#332F2B'},
  primary:{minHeight:50,alignItems:'center',justifyContent:'center',borderRadius:15,backgroundColor:'#F58B57',paddingHorizontal:18},primaryText:{fontSize:14,fontWeight:'900',color:'#FFF'},disabled:{opacity:.55},
  sheetHost:{flex:1,justifyContent:'flex-end'},scrim:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(35,31,28,.38)'},sheet:{backgroundColor:'#FFF9F3',borderTopLeftRadius:28,borderTopRightRadius:28,paddingHorizontal:18,paddingTop:11,paddingBottom:Platform.OS==='ios'?34:22,gap:12},sheetHandle:{width:44,height:5,borderRadius:999,backgroundColor:'#D8CEC5',alignSelf:'center',marginBottom:5},sheetKicker:{fontSize:10,fontWeight:'900',letterSpacing:1.1,color:'#8A7A6E'},sheetTitle:{fontSize:24,fontWeight:'900',color:'#302D29'},sheetHelp:{fontSize:12.5,lineHeight:18,color:'#82766C'},input:{minHeight:50,borderRadius:15,borderWidth:1,borderColor:'#E1D6CB',backgroundColor:'#FFFDF9',paddingHorizontal:14,fontSize:14,color:'#332F2B'},inputRow:{flexDirection:'row',gap:9},half:{flex:1},multiInput:{minHeight:100,textAlignVertical:'top',paddingTop:14},
});