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
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { FamilySignal } from '@/components/AfterGlyph';
import {
  getFamilyWorkspace,
  respondResponsibility,
  type FamilyStudent,
  type FamilyWorkspace,
  type Responsibility,
} from '@/lib/coordination';
import { supabase } from '@/lib/supabase';

const statusLabel: Record<string, string> = {
  unassigned: 'Por definir',
  proposed: 'Esperando respuesta',
  accepted: 'En curso',
  declined: 'No disponible',
  completed: 'Listo',
};
const relationOptions = ['Hijo', 'Hija', 'Niño', 'Niña', 'Estudiante', 'Otro'];

function dueLabel(value?: string | null) {
  if (!value) return 'Falta fecha límite';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha por revisar';
  return date.toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function EmptySignal() {
  return <View style={s.emptySignal}><View style={s.emptyRail}/><View style={s.emptyDot}/><View style={s.emptyDotSoft}/></View>;
}

export default function Family() {
  const { width } = useWindowDimensions();
  const compact = width < 370;
  const wide = width >= 720;
  const [workspace, setWorkspace] = useState<FamilyWorkspace>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preferred, setPreferred] = useState('');
  const [relation, setRelation] = useState('Hijo');
  const [customRelation, setCustomRelation] = useState('');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');

  const members = workspace.members ?? [];
  const children = workspace.students ?? [];
  const responsibilities = workspace.responsibilities ?? [];
  const me = useMemo(() => members.find(member => member.is_me), [members]);
  const legacyWithoutDue = useMemo(() => responsibilities.filter(item => !item.due_at).length, [responsibilities]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const next = await getFamilyWorkspace();
      setWorkspace(next);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
  }, [load]));

  async function invite() {
    if (!workspace.family_id || !/^\S+@\S+\.\S+$/.test(inviteEmail.trim())) {
      Alert.alert('Correo inválido', 'Ingresa el correo de Google de la otra persona.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('after_invite_member', {
      p_family_id: workspace.family_id,
      p_email: inviteEmail.trim().toLowerCase(),
      p_display_name: inviteName.trim() || null,
      p_role: 'parent',
    });
    setBusy(false);
    if (error) {
      Alert.alert('No pudimos invitar', 'Solo el propietario de la familia puede enviar invitaciones.');
      return;
    }
    setInviteEmail('');
    setInviteName('');
    setShowInvite(false);
    Alert.alert('Invitación lista', 'Cuando esa persona ingrese con la misma cuenta Google podrá unirse.');
  }

  async function respond(item: Responsibility, action: 'accepted' | 'declined' | 'completed') {
    if (busy) return;
    setBusy(true);
    try {
      await respondResponsibility(item.id, action);
      await load();
    } catch (error) {
      Alert.alert('No pudimos actualizar', error instanceof Error ? error.message : 'Vuelve a intentar.');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(child: FamilyStudent) {
    setEditingId(child.id);
    setPreferred(child.preferred_name ?? '');
    const current = child.relationship_label || 'Hijo';
    if (relationOptions.includes(current)) {
      setRelation(current);
      setCustomRelation('');
    } else {
      setRelation('Otro');
      setCustomRelation(current);
    }
    setSchool(child.school_name ?? '');
    setGrade(child.grade_level ?? '');
  }

  async function saveChild() {
    if (!editingId) return;
    const relationship = relation === 'Otro' ? customRelation.trim() : relation;
    if (!relationship) {
      Alert.alert('Falta un dato', 'Elige cómo quieres referirte a esta persona.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('after_update_student_identity', {
      p_student_id: editingId,
      p_preferred_name: preferred.trim() || null,
      p_relationship_label: relationship,
      p_school_name: school.trim() || null,
      p_grade_level: grade.trim() || null,
    });
    setBusy(false);
    if (error) {
      Alert.alert('No pudimos guardar', 'Revisa los datos e intenta nuevamente.');
      return;
    }
    setEditingId(null);
    await load();
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Error', 'No pudimos cerrar la sesión.');
      return;
    }
    router.replace('/login');
  }

  if (loading && !workspace.family_id) {
    return <SafeAreaView style={s.safe}><View style={s.center}><ActivityIndicator color="#F58B57"/><Text style={s.muted}>Abriendo tu familia…</Text></View></SafeAreaView>;
  }

  if (loadError && !workspace.family_id) {
    return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.errorTitle}>No pudimos abrir tu familia</Text><Text style={s.muted}>Tu información sigue protegida. Revisa la conexión y vuelve a intentar.</Text><Pressable onPress={() => { setLoading(true); void load(); }} style={s.primary}><Text style={s.primaryText}>Reintentar</Text></Pressable></View></SafeAreaView>;
  }

  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={[s.body, compact && s.bodyCompact, wide && s.bodyWide]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <View style={s.heroMark}><FamilySignal size={39}/></View>
        <Text style={s.eyebrow}>FAMILIA</Text>
        <Text style={[s.title, compact && s.titleCompact]}>Que todos sepan qué sigue.</Text>
        <Text style={s.copy}>Responsable, plazo y confirmación en un solo lugar. Sin cadenas de mensajes ni pendientes ambiguos.</Text>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push('/(app)/coordinar')} style={({ pressed }) => [s.coordinateCard, pressed && s.pressed]}>
        <View style={s.coordinateMark}><Text style={s.coordinateMarkText}>＋</Text></View>
        <View style={s.flex}><Text style={s.coordinateKicker}>COORDINAR</Text><Text style={s.coordinateTitle}>Nueva responsabilidad</Text><Text style={s.sectionCopy}>Define qué hay que resolver, quién se encarga y para cuándo.</Text></View>
        <Text style={s.chevron}>›</Text>
      </Pressable>

      <View style={s.peopleSection}>
        <View style={s.sectionHead}><View><Text style={s.heading}>A quienes acompañamos</Text><Text style={s.sectionCopy}>La información se adapta a cada persona.</Text></View><Text style={s.countLabel}>{children.length}</Text></View>
        <View style={s.peopleList}>{children.map(child => <Pressable accessibilityRole="button" accessibilityLabel={`Editar datos de ${child.name}`} key={child.id} onPress={() => startEdit(child)} style={s.childRow}>
          <View style={s.personRail}/><View style={s.avatar}><Text style={s.avatarText}>{(child.name || '?').slice(0, 1).toUpperCase()}</Text></View>
          <View style={s.flex}><Text style={s.childName}>{child.name}</Text><Text style={s.meta}>{child.relationship_label || 'Niño/a'}{child.grade_level ? ` · ${child.grade_level}` : ''}{child.school_name ? ` · ${child.school_name}` : ''}</Text></View>
          <View style={s.editHint}><View style={s.editLine}/><View style={s.editLineShort}/></View>
        </Pressable>)}</View>
      </View>

      <View style={s.pendingSection}>
        <View style={s.sectionHead}><View><Text style={s.heading}>En marcha</Text><Text style={s.sectionCopy}>Solo lo que todavía necesita atención.</Text></View><Text style={s.countLabel}>{responsibilities.length}</Text></View>
        {legacyWithoutDue > 0 ? <View style={s.legacyNotice}><Text style={s.legacyTitle}>{legacyWithoutDue} pendiente{legacyWithoutDue === 1 ? '' : 's'} sin fecha límite</Text><Text style={s.legacyCopy}>Son registros anteriores. Ábrelos y asigna un plazo para que aparezcan correctamente en Hoy y Semana.</Text></View> : null}
        {responsibilities.length === 0 ? <View style={s.empty}><EmptySignal/><View style={s.flex}><Text style={s.emptyTitle}>Todo está coordinado</Text><Text style={s.mutedLeft}>No hay responsabilidades pendientes por ahora.</Text></View></View> : <View style={s.itemList}>{responsibilities.map(item => {
          const mine = Boolean(item.assigned_member_id && item.assigned_member_id === me?.id);
          const child = children.find(value => value.id === item.student_id);
          return <View key={item.id} style={s.item}>
            <View style={s.itemTrack}><View style={[s.itemNode, item.status === 'accepted' && s.itemNodeActive]}/><View style={s.itemStem}/></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Abrir responsabilidad ${item.title}`} onPress={() => router.push({ pathname: '/(app)/responsabilidad', params: { id: item.id } })} style={s.itemMain}>
              <Text style={s.itemTitle}>{item.title}</Text>
              <Text style={s.meta}>{child?.name ? `${child.name} · ` : ''}{item.assigned_name || 'Sin responsable'}</Text>
              <Text style={[s.due, !item.due_at && s.dueMissing]}>{dueLabel(item.due_at)}</Text>
              {item.context_text ? <Text style={s.context} numberOfLines={2}>{item.context_text}</Text> : null}
              <Text style={[s.status, item.status === 'accepted' && s.statusActive, item.status === 'declined' && s.statusDeclined]}>{statusLabel[item.status] || item.status}</Text>
            </Pressable>
            {mine && item.status === 'proposed' ? <View style={s.itemActions}><Pressable disabled={busy} onPress={() => void respond(item, 'accepted')} style={s.softButton}><Text style={s.softButtonText}>Me encargo</Text></Pressable><Pressable disabled={busy} onPress={() => void respond(item, 'declined')} style={s.declineButton}><Text style={s.decline}>No puedo</Text></Pressable></View> : null}
            {mine && item.status === 'accepted' ? <Pressable disabled={busy} onPress={() => void respond(item, 'completed')} style={s.softButton}><Text style={s.softButtonText}>✓ Listo</Text></Pressable> : <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/(app)/responsabilidad', params: { id: item.id } })} style={s.openButton}><Text style={s.openButtonText}>›</Text></Pressable>}
          </View>;
        })}</View>}
      </View>

      {me?.role === 'owner' ? <View style={s.inviteSection}>
        <Pressable onPress={() => setShowInvite(value => !value)} style={s.inviteHeader}><View style={s.inviteMark}><View style={s.inviteNodeA}/><View style={s.inviteNodeB}/><View style={s.inviteLink}/></View><View style={s.flex}><Text style={s.heading}>Sumar a otro adulto</Text><Text style={s.sectionCopy}>{showInvite ? 'Completa los datos de la invitación.' : 'Comparte la coordinación sin compartir contraseñas.'}</Text></View><Text style={s.inviteAction}>{showInvite ? 'Cerrar' : 'Invitar'}</Text></Pressable>
        {showInvite ? <View style={s.inviteForm}><TextInput style={s.input} value={inviteEmail} onChangeText={setInviteEmail} autoCapitalize="none" keyboardType="email-address" maxLength={254} placeholder="correo@gmail.com" placeholderTextColor="#A89C92"/><TextInput style={s.input} value={inviteName} onChangeText={setInviteName} maxLength={100} placeholder="Nombre (opcional)" placeholderTextColor="#A89C92"/><Pressable disabled={busy} onPress={() => void invite()} style={[s.inviteButton, busy && s.disabled]}><Text style={s.inviteButtonText}>Enviar invitación</Text></Pressable></View> : null}
      </View> : null}

      <Pressable onPress={() => void logout()} style={s.logout}><Text style={s.logoutText}>Cerrar sesión</Text></Pressable>
    </ScrollView>

    <Modal visible={Boolean(editingId)} transparent animationType="slide" onRequestClose={() => setEditingId(null)}>
      <KeyboardAvoidingView style={s.sheetHost} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.scrim} onPress={() => setEditingId(null)}/>
        <View style={[s.sheet, wide && s.sheetWide]}>
          <View style={s.sheetHandle}/><View style={s.sheetHeader}><View><Text style={s.heading}>Cómo habla tu familia</Text><Text style={s.sectionCopy}>Personaliza sin cambiar la identidad de la persona.</Text></View><Pressable onPress={() => setEditingId(null)} style={s.closeButton}><View style={s.closeLineA}/><View style={s.closeLineB}/></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetContent}>
            <TextInput style={s.input} value={preferred} onChangeText={setPreferred} maxLength={80} placeholder="Cómo le dicen en casa" placeholderTextColor="#A89C92"/>
            <Text style={s.label}>Cómo quieres referirte a esta persona</Text><View style={s.wrapChoices}>{relationOptions.map(value => <Pressable key={value} onPress={() => setRelation(value)} style={[s.choice, relation === value && s.choiceActive]}><View style={[s.choiceDot, relation === value && s.choiceDotActive]}/><Text style={[s.choiceText, relation === value && s.choiceTextActive]}>{value}</Text></Pressable>)}</View>
            {relation === 'Otro' ? <TextInput style={s.input} value={customRelation} onChangeText={setCustomRelation} maxLength={40} placeholder="Ej. Sobrino, nieta, ahijado…" placeholderTextColor="#A89C92"/> : null}
            <TextInput style={s.input} value={school} onChangeText={setSchool} maxLength={160} placeholder="Colegio (opcional)" placeholderTextColor="#A89C92"/>
            <TextInput style={s.input} value={grade} onChangeText={setGrade} maxLength={80} placeholder="Curso (opcional)" placeholderTextColor="#A89C92"/>
            <View style={s.sheetActions}><Pressable onPress={() => setEditingId(null)} style={s.secondaryButton}><Text style={s.secondaryButtonText}>Cancelar</Text></Pressable><Pressable disabled={busy} onPress={() => void saveChild()} style={[s.saveButton, busy && s.disabled]}><Text style={s.saveButtonText}>{busy ? 'Guardando…' : 'Guardar cambios'}</Text></Pressable></View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF9F3' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28 },
  errorTitle: { fontSize: 20, fontWeight: '900', color: '#302D29', textAlign: 'center' },
  primary: { minHeight: 44, justifyContent: 'center', backgroundColor: '#597657', borderRadius: 12, paddingHorizontal: 15 },
  primaryText: { color: '#FFF', fontWeight: '900' },
  body: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, gap: 26 },
  bodyCompact: { paddingHorizontal: 14 },
  bodyWide: { paddingHorizontal: 30, paddingTop: 26, gap: 30 },
  hero: { position: 'relative', paddingRight: 58, minHeight: 112 },
  heroMark: { position: 'absolute', right: 0, top: 2, width: 52, height: 52, borderRadius: 18, backgroundColor: '#EEF3E9', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: '#A36C50', marginBottom: 9 },
  title: { fontSize: 32, lineHeight: 36, fontWeight: '900', letterSpacing: -.9, color: '#2C2926', maxWidth: 520 },
  titleCompact: { fontSize: 28, lineHeight: 32 },
  copy: { fontSize: 14.5, lineHeight: 21, color: '#74695F', marginTop: 10, maxWidth: 560 },
  flex: { flex: 1 },
  muted: { fontSize: 13, lineHeight: 19, color: '#81756A', textAlign: 'center' },
  mutedLeft: { fontSize: 13, lineHeight: 19, color: '#81756A' },
  coordinateCard: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 22, backgroundColor: '#FFF0E4', borderWidth: 1, borderColor: '#F0D8C5', padding: 16 },
  coordinateMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#F58B57', alignItems: 'center', justifyContent: 'center' },
  coordinateMarkText: { fontSize: 24, lineHeight: 26, color: '#FFF', fontWeight: '500' },
  coordinateKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: '#A6613E' },
  coordinateTitle: { fontSize: 18, fontWeight: '900', color: '#332C27', marginTop: 2 },
  chevron: { fontSize: 28, color: '#A66B4D' },
  pressed: { opacity: .8 },
  peopleSection: { gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  heading: { fontSize: 18, fontWeight: '900', letterSpacing: -.25, color: '#302D29' },
  sectionCopy: { fontSize: 12.5, lineHeight: 18, color: '#8B7E73', marginTop: 3 },
  countLabel: { fontSize: 11, fontWeight: '900', color: '#9B8D82', paddingTop: 4 },
  peopleList: { gap: 8 },
  childRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 18, backgroundColor: '#FFFDF9', borderWidth: 1, borderColor: '#EDE3DA', paddingHorizontal: 13, paddingVertical: 10, overflow: 'hidden' },
  personRail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#E8B89A' },
  avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#EEF3E9', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '900', color: '#52694F' },
  childName: { fontSize: 15.5, fontWeight: '900', color: '#302D29' },
  meta: { fontSize: 11.5, lineHeight: 17, color: '#8A7E72', marginTop: 3 },
  editHint: { width: 20, gap: 4 },
  editLine: { height: 2, borderRadius: 2, backgroundColor: '#C2B4A8' },
  editLineShort: { width: 13, height: 2, borderRadius: 2, backgroundColor: '#D4C7BC' },
  pendingSection: { gap: 12 },
  legacyNotice: { borderRadius: 16, padding: 13, backgroundColor: '#FFF1D6', borderWidth: 1, borderColor: '#ECD5A9', gap: 3 },
  legacyTitle: { fontSize: 13, fontWeight: '900', color: '#765A28' },
  legacyCopy: { fontSize: 12, lineHeight: 17, color: '#806C43' },
  itemList: { gap: 6 },
  item: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EDE3DA' },
  itemTrack: { width: 14, alignSelf: 'stretch', alignItems: 'center' },
  itemNode: { width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: '#D7C9BE' },
  itemNodeActive: { backgroundColor: '#6F8F68' },
  itemStem: { width: 1, flex: 1, marginTop: 4, backgroundColor: '#E1D6CD' },
  itemMain: { flex: 1, minHeight: 48, justifyContent: 'center' },
  itemTitle: { fontSize: 15, fontWeight: '900', color: '#302D29' },
  due: { fontSize: 11.5, fontWeight: '800', color: '#80634D', marginTop: 4 },
  dueMissing: { color: '#A94E45' },
  context: { fontSize: 11.5, lineHeight: 16, color: '#8A7E72', marginTop: 3 },
  status: { alignSelf: 'flex-start', marginTop: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: '#EEE8E2', paddingHorizontal: 8, paddingVertical: 3, fontSize: 10, fontWeight: '900', color: '#786C62' },
  statusActive: { backgroundColor: '#EAF4E5', color: '#50704D' },
  statusDeclined: { backgroundColor: '#FBE4E0', color: '#A94E45' },
  itemActions: { gap: 5 },
  softButton: { minHeight: 40, minWidth: 68, borderRadius: 11, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF4E5' },
  softButtonText: { fontSize: 11, fontWeight: '900', color: '#50704D' },
  declineButton: { minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  decline: { fontSize: 11, fontWeight: '900', color: '#A94E45' },
  openButton: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  openButtonText: { fontSize: 27, color: '#927C6B' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 18, backgroundColor: '#FFFDF9', borderWidth: 1, borderColor: '#EDE3DA', padding: 15 },
  emptyTitle: { fontSize: 15.5, fontWeight: '900', color: '#302D29' },
  emptySignal: { width: 42, height: 42, position: 'relative' },
  emptyRail: { position: 'absolute', left: 20, top: 6, bottom: 6, width: 2, backgroundColor: '#DCE7D8' },
  emptyDot: { position: 'absolute', left: 14, top: 5, width: 14, height: 14, borderRadius: 7, backgroundColor: '#7E9C76' },
  emptyDotSoft: { position: 'absolute', left: 16, bottom: 5, width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5B193' },
  inviteSection: { gap: 12, borderTopWidth: 1, borderTopColor: '#EDE3DA', paddingTop: 20 },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inviteMark: { width: 38, height: 38, position: 'relative' },
  inviteNodeA: { position: 'absolute', left: 3, top: 9, width: 12, height: 12, borderRadius: 6, backgroundColor: '#71906B' },
  inviteNodeB: { position: 'absolute', right: 3, bottom: 7, width: 12, height: 12, borderRadius: 6, backgroundColor: '#E7A47D' },
  inviteLink: { position: 'absolute', left: 13, top: 18, width: 14, height: 2, backgroundColor: '#CFC4BA', transform: [{ rotate: '35deg' }] },
  inviteAction: { fontSize: 12, fontWeight: '900', color: '#A36040' },
  inviteForm: { gap: 9 },
  input: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: '#E7DCD1', backgroundColor: '#FFFDF9', paddingHorizontal: 14, fontSize: 15, color: '#2B2926' },
  inviteButton: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#597657' },
  inviteButtonText: { fontSize: 13, fontWeight: '900', color: '#FFF' },
  disabled: { opacity: .45 },
  logout: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 2 },
  logoutText: { fontSize: 12.5, fontWeight: '800', color: '#9A8171' },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(45,40,35,.28)' },
  sheet: { maxHeight: '86%', backgroundColor: '#FFF9F3', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24 },
  sheetWide: { width: 620, alignSelf: 'center', borderRadius: 28, marginBottom: 30 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#D5C9BE', alignSelf: 'center', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  closeButton: { width: 40, height: 40, position: 'relative' },
  closeLineA: { position: 'absolute', left: 9, top: 19, width: 22, height: 2, backgroundColor: '#806F61', transform: [{ rotate: '45deg' }] },
  closeLineB: { position: 'absolute', left: 9, top: 19, width: 22, height: 2, backgroundColor: '#806F61', transform: [{ rotate: '-45deg' }] },
  sheetContent: { paddingTop: 18, gap: 13, paddingBottom: 20 },
  label: { fontSize: 12.5, fontWeight: '900', color: '#665D55' },
  wrapChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, borderWidth: 1, borderColor: '#E2D7CE', backgroundColor: '#FFFDF9', paddingHorizontal: 12 },
  choiceActive: { borderColor: '#6F8F68', backgroundColor: '#EEF3E9' },
  choiceDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#D5C9BE' },
  choiceDotActive: { backgroundColor: '#6F8F68' },
  choiceText: { fontSize: 12, fontWeight: '800', color: '#7A6E63' },
  choiceTextActive: { color: '#4F674D' },
  sheetActions: { flexDirection: 'row', gap: 9, marginTop: 4 },
  secondaryButton: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DED2C8' },
  secondaryButtonText: { fontSize: 13, fontWeight: '900', color: '#75695F' },
  saveButton: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#597657' },
  saveButtonText: { fontSize: 13, fontWeight: '900', color: '#FFF' },
});
