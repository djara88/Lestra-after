import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

type Context = {
  family_id?: string;
  students?: Array<{ id: string; first_name: string; preferred_name?: string | null }>;
};
type Mode = 'academic' | 'event';
type PickerMode = 'date' | 'time' | null;
type SourceDocument = {
  id: string;
  student_id: string | null;
  student_name: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  processing_status: string;
  ocr_error?: string | null;
  candidate_count?: number;
  created_at: string;
};
type Candidate = {
  id: string;
  candidate_type: 'academic_item' | 'calendar_event' | 'material' | 'payment' | 'note';
  title: string;
  description?: string | null;
  starts_at?: string | null;
  due_at?: string | null;
  confidence?: number | null;
  status: string;
  payload?: {
    academic_type?: string;
    subject?: string;
    priority?: string;
    materials?: string[];
  };
};
type Review = {
  document?: {
    id: string;
    original_name: string;
    processing_status: string;
    ocr_text?: string | null;
    ocr_error?: string | null;
  };
  candidates?: Candidate[];
};

const titleSchema = z.string().trim().min(1).max(180);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const academicTypes = [['task', 'Tarea'], ['test', 'Prueba'], ['exam', 'Examen'], ['project', 'Proyecto'], ['material', 'Material']] as const;
const eventCategories = [['sport', 'Deporte'], ['health', 'Salud'], ['social', 'Social'], ['family', 'Familia'], ['school', 'Colegio'], ['study', 'Estudio'], ['other', 'Otro']] as const;
const priorities = [['low', 'Baja'], ['normal', 'Normal'], ['high', 'Alta'], ['urgent', 'Urgente']] as const;
const allowedMime = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const timeOptions = Array.from({ length: 34 }, (_, index) => {
  const total = 6 * 60 + index * 30;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
});

function localIso(date: string, time: string) {
  const value = new Date(`${date}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function dateValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function displayDate(value: string) {
  const parsed = parseDateValue(value);
  return parsed.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function addDays(base: Date, days: number) {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function monthCells(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const value = addDays(start, index);
    return {
      day: value.getDate(),
      value: dateValue(value),
      inMonth: value.getMonth() === cursor.getMonth(),
    };
  });
}

function prettyBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFileName(name: string) {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(-120) || 'documento';
}

function candidateLabel(candidate: Candidate) {
  if (candidate.candidate_type === 'calendar_event') return 'Evento escolar';
  if (candidate.candidate_type === 'material') return 'Material';
  if (candidate.candidate_type === 'payment') return 'Pago / cobro';
  if (candidate.candidate_type === 'note') return 'Aviso';
  const labels: Record<string, string> = {
    task: 'Tarea', test: 'Prueba', exam: 'Examen', project: 'Proyecto', material: 'Material', school_event: 'Evento escolar',
  };
  return labels[candidate.payload?.academic_type ?? ''] ?? 'Pendiente escolar';
}

function candidateDate(candidate: Candidate) {
  const raw = candidate.due_at || candidate.starts_at;
  if (!raw) return 'Fecha por confirmar';
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) return 'Fecha por confirmar';
  return value.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Add() {
  const [context, setContext] = useState<Context>({});
  const [mode, setMode] = useState<Mode>('academic');
  const [studentId, setStudentId] = useState('');
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [candidateBusyId, setCandidateBusyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => dateValue(new Date()));
  const [time, setTime] = useState('18:00');
  const [detail, setDetail] = useState('');
  const [subject, setSubject] = useState('');
  const [materials, setMaterials] = useState('');
  const [priority, setPriority] = useState('normal');
  const [academicType, setAcademicType] = useState('task');
  const [category, setCategory] = useState('sport');
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());

  const students = context.students ?? [];
  const selected = useMemo(() => students.find((student) => student.id === studentId), [students, studentId]);
  const calendar = useMemo(() => monthCells(calendarCursor), [calendarCursor]);

  useEffect(() => {
    void loadContext();
    void loadDocuments();
  }, []);

  async function loadContext() {
    const { data } = await supabase.rpc('after_my_context');
    const next = (data ?? {}) as Context;
    setContext(next);
    const first = next.students?.[0];
    if (first) setStudentId((current) => current || first.id);
  }

  async function loadDocuments() {
    const { data, error } = await supabase.rpc('after_source_documents');
    if (!error) setDocuments((data ?? []) as SourceDocument[]);
  }

  async function openReview(documentId: string) {
    const { data, error } = await supabase.rpc('after_document_review', { p_document_id: documentId });
    if (error) {
      Alert.alert('No pudimos abrir la revisión', 'Vuelve a intentar.');
      return;
    }
    setReview((data ?? {}) as Review);
  }

  async function processOcr(documentId: string, showSuccess = true) {
    if (processingId) return;
    setProcessingId(documentId);
    try {
      const { data, error } = await supabase.functions.invoke('after-school-ocr', { body: { documentId } });
      if (error || !data?.ok) throw new Error('No pudimos leer el documento. Revisa la configuración del OCR o vuelve a intentar.');
      await loadDocuments();
      await openReview(documentId);
      if (showSuccess) {
        const count = Number(data.candidateCount ?? 0);
        Alert.alert('Documento leído', count > 0 ? `Encontramos ${count} elemento(s) para revisar.` : 'El documento fue leído, pero no encontramos tareas o eventos claros.');
      }
    } catch (error) {
      await loadDocuments();
      Alert.alert('OCR no disponible', error instanceof Error ? error.message : 'No pudimos procesar el documento.');
    } finally {
      setProcessingId(null);
    }
  }

  async function uploadDocument() {
    if (!context.family_id || !studentId) {
      Alert.alert('Selecciona un alumno', 'El documento del colegio debe quedar asociado a un alumno.');
      return;
    }

    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets[0]) return;

    const asset = picked.assets[0];
    const mime = asset.mimeType || '';
    const size = asset.size ?? 0;
    if (!allowedMime.has(mime)) {
      Alert.alert('Formato no permitido', 'Puedes adjuntar PDF, JPG, PNG o WEBP.');
      return;
    }
    if (size <= 0 || size > MAX_FILE_BYTES) {
      Alert.alert('Archivo demasiado grande', 'El máximo permitido es 8 MB.');
      return;
    }

    setUploading(true);
    let storagePath: string | null = null;
    let registered = false;
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('session');

      const file = new File(asset.uri);
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('size');

      storagePath = `${context.family_id}/${user.id}/${Crypto.randomUUID()}-${safeFileName(asset.name)}`;
      const { error: uploadError } = await supabase.storage
        .from('after-source-documents')
        .upload(storagePath, bytes, { contentType: mime, upsert: false, cacheControl: '3600' });
      if (uploadError) throw uploadError;

      const { data: documentId, error: registerError } = await supabase.rpc('after_register_source_document', {
        p_family_id: context.family_id,
        p_student_id: studentId,
        p_storage_path: storagePath,
        p_original_name: asset.name,
        p_mime_type: mime,
        p_size_bytes: size,
      });
      if (registerError || !documentId) throw registerError ?? new Error('register');
      registered = true;

      await loadDocuments();
      setUploading(false);
      await processOcr(String(documentId), false);
    } catch {
      if (storagePath && !registered) await supabase.storage.from('after-source-documents').remove([storagePath]);
      Alert.alert('No pudimos subir el documento', 'Revisa tu sesión, el formato y el tamaño e intenta nuevamente.');
    } finally {
      setUploading(false);
    }
  }

  async function resolveCandidate(candidate: Candidate, action: 'accept' | 'reject') {
    if (candidateBusyId) return;
    setCandidateBusyId(candidate.id);
    const rpc = action === 'accept' ? 'after_accept_document_candidate' : 'after_reject_document_candidate';
    const { error } = await supabase.rpc(rpc, { p_candidate_id: candidate.id });
    setCandidateBusyId(null);

    if (error) {
      const missingDate = String(error.message ?? '').includes('candidate_date_required');
      Alert.alert(
        'Revisión pendiente',
        missingDate
          ? 'Este evento no tiene una fecha suficientemente clara. Verifica el documento y agrégalo manualmente.'
          : 'No pudimos guardar esta decisión. Vuelve a intentar.',
      );
      return;
    }

    if (review?.document?.id) await openReview(review.document.id);
    await loadDocuments();
  }

  async function deleteDocument(documentId: string) {
    if (deletingId) return;
    setDeletingId(documentId);
    try {
      const { data: path, error: pathError } = await supabase.rpc('after_get_source_document_delete_path', { p_document_id: documentId });
      if (pathError || typeof path !== 'string' || !path) throw new Error('not_allowed');
      const { error: storageError } = await supabase.storage.from('after-source-documents').remove([path]);
      if (storageError) throw storageError;
      const { data: deleted, error: deleteError } = await supabase.rpc('after_delete_source_document', { p_document_id: documentId, p_storage_path: path });
      if (deleteError || deleted !== true) throw new Error('metadata');
      if (review?.document?.id === documentId) setReview(null);
      await loadDocuments();
    } catch {
      Alert.alert('No pudimos eliminar el documento', 'Solo quien lo subió puede eliminarlo. Vuelve a intentar.');
    } finally {
      setDeletingId(null);
    }
  }

  function confirmDelete(document: SourceDocument) {
    Alert.alert('Eliminar documento', 'Se eliminará el archivo privado, su OCR y sus candidatos. Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void deleteDocument(document.id) },
    ]);
  }

  function openDatePicker() {
    setCalendarCursor(parseDateValue(date));
    setPickerMode('date');
  }

  function quickDate(days: number) {
    setDate(dateValue(addDays(new Date(), days)));
  }

  async function saveManual() {
    const parsedTitle = titleSchema.safeParse(title);
    const parsedDate = dateSchema.safeParse(date);
    const parsedTime = timeSchema.safeParse(time);
    if (!studentId || !parsedTitle.success || !parsedDate.success || !parsedTime.success) {
      Alert.alert('Revisa los datos', 'Selecciona alumno, título, fecha y hora válidos.');
      return;
    }
    const when = localIso(parsedDate.data, parsedTime.data);
    if (!when) {
      Alert.alert('Fecha inválida', 'Revisa la fecha y hora.');
      return;
    }

    setBusy(true);
    const materialList = materials.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 20);
    const result = mode === 'academic'
      ? await supabase.rpc('after_create_school_item', {
          p_student_id: studentId,
          p_type: academicType,
          p_title: parsedTitle.data,
          p_description: detail.trim() || null,
          p_due_at: when,
          p_priority: priority,
          p_subject_name: subject.trim() || null,
          p_materials: materialList,
          p_source_document_id: null,
        })
      : await supabase.rpc('after_create_calendar_event', {
          p_family_id: context.family_id,
          p_student_id: studentId,
          p_category: category,
          p_title: parsedTitle.data,
          p_starts_at: when,
          p_ends_at: null,
          p_location: null,
          p_notes: detail.trim() || null,
          p_sensitivity: category === 'health' ? 'private' : 'normal',
        });
    setBusy(false);

    if (result.error) {
      Alert.alert('No pudimos guardar', 'Tu sesión o permisos no permiten esta operación. Intenta nuevamente.');
      return;
    }

    setTitle('');
    setDetail('');
    setSubject('');
    setMaterials('');
    setPriority('normal');
    Alert.alert('Guardado', mode === 'academic' ? 'Quedó incorporado a la preparación escolar.' : 'El compromiso quedó agregado.', [
      { text: 'Ver semana', onPress: () => router.push('/(app)/agenda') },
      { text: 'Agregar otro' },
    ]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={s.kicker}>AGREGAR</Text>
        <Text style={s.title}>Lo que manda el colegio, sin copiarlo a mano.</Text>
        <Text style={s.copy}>Sube una circular, guía, captura o PDF. After la lee, propone tareas, pruebas, materiales y eventos, y tú confirmas antes de guardar.</Text>

        <Text style={s.label}>¿Para quién?</Text>
        <View style={s.chips}>
          {students.map((student) => (
            <Pressable key={student.id} onPress={() => setStudentId(student.id)} style={[s.chip, studentId === student.id && s.chipActive]}>
              <Text style={[s.chipText, studentId === student.id && s.chipTextActive]}>{student.preferred_name || student.first_name}</Text>
            </Pressable>
          ))}
        </View>

        <View style={s.ocrBox}>
          <View style={s.flex}>
            <Text style={s.heading}>Importar desde el colegio</Text>
            <Text style={s.muted}>PDF, JPG, PNG o WEBP · máximo 8 MB · archivo privado · revisión humana obligatoria.</Text>
          </View>
          <Pressable disabled={uploading || !selected} onPress={() => void uploadDocument()} style={[s.secondaryButton, (uploading || !selected) && s.disabled]}>
            <Text style={s.secondaryText}>{uploading ? 'Subiendo…' : 'Subir y leer'}</Text>
          </Pressable>
        </View>

        {documents.length > 0 ? (
          <View style={s.panel}>
            <Text style={s.heading}>Documentos recientes</Text>
            {documents.slice(0, 6).map((document) => {
              const processing = processingId === document.id || document.processing_status === 'processing';
              const ready = document.processing_status === 'ready' || document.processing_status === 'reviewed';
              const status = processing ? 'Leyendo…' : ready ? 'OCR listo' : document.processing_status === 'failed' ? 'OCR con error' : 'Pendiente';
              return (
                <View key={document.id} style={s.documentRow}>
                  <Text numberOfLines={1} style={s.documentName}>{document.original_name}</Text>
                  <Text style={s.meta}>{document.student_name || 'Alumno'} · {prettyBytes(Number(document.size_bytes))} · {status}</Text>
                  {document.ocr_error ? <Text style={s.errorText}>{document.ocr_error}</Text> : null}
                  <View style={s.actions}>
                    {!processing && document.processing_status !== 'reviewed' ? (
                      <Pressable onPress={() => void processOcr(document.id)} style={s.actionButton}>
                        <Text style={s.actionText}>{ready ? 'Leer de nuevo' : 'Procesar OCR'}</Text>
                      </Pressable>
                    ) : null}
                    {ready ? (
                      <Pressable onPress={() => void openReview(document.id)} style={s.actionButton}>
                        <Text style={s.actionText}>Revisar{Number(document.candidate_count) > 0 ? ` (${document.candidate_count})` : ''}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable disabled={deletingId === document.id} onPress={() => confirmDelete(document)} style={s.actionButton}>
                      <Text style={s.deleteText}>{deletingId === document.id ? 'Eliminando…' : 'Eliminar'}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {review?.document ? (
          <View style={s.reviewBox}>
            <Text style={s.kicker}>REVISIÓN DEL OCR</Text>
            <Text style={s.reviewTitle}>{review.document.original_name}</Text>
            {review.document.ocr_text ? <Text numberOfLines={12} style={s.ocrText}>{review.document.ocr_text}</Text> : null}
            <Text style={s.heading}>Lo que After encontró</Text>
            {(review.candidates ?? []).length === 0 ? (
              <Text style={s.muted}>No encontramos elementos claros para crear. Conservamos el texto para que puedas revisarlo.</Text>
            ) : (review.candidates ?? []).map((candidate) => (
              <View key={candidate.id} style={s.candidate}>
                <View style={s.candidateHead}>
                  <Text style={s.candidateType}>{candidateLabel(candidate)}</Text>
                  <Text style={s.confidence}>{candidate.confidence == null ? '' : `${Math.round(Number(candidate.confidence) * 100)}%`}</Text>
                </View>
                <Text style={s.candidateTitle}>{candidate.title}</Text>
                <Text style={s.meta}>{candidateDate(candidate)}{candidate.payload?.subject ? ` · ${candidate.payload.subject}` : ''}</Text>
                {candidate.description ? <Text style={s.candidateCopy}>{candidate.description}</Text> : null}
                {candidate.payload?.materials?.length ? <Text style={s.materialText}>Llevar: {candidate.payload.materials.join(', ')}</Text> : null}
                {candidate.status === 'pending' ? (
                  <View style={s.actions}>
                    {candidate.candidate_type === 'academic_item' || candidate.candidate_type === 'calendar_event' || candidate.candidate_type === 'material' ? (
                      <Pressable disabled={candidateBusyId === candidate.id} onPress={() => void resolveCandidate(candidate, 'accept')} style={s.acceptButton}>
                        <Text style={s.acceptText}>{candidateBusyId === candidate.id ? 'Guardando…' : 'Confirmar'}</Text>
                      </Pressable>
                    ) : <Text style={s.muted}>Aviso informativo: revísalo antes de crear algo manualmente.</Text>}
                    <Pressable disabled={candidateBusyId === candidate.id} onPress={() => void resolveCandidate(candidate, 'reject')} style={s.actionButton}>
                      <Text style={s.deleteText}>Descartar</Text>
                    </Pressable>
                  </View>
                ) : <Text style={s.resolved}>{candidate.status === 'accepted' ? 'Guardado en After' : 'Descartado'}</Text>}
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.divider} />
        <Text style={s.heading}>O agregarlo manualmente</Text>
        <View style={s.segment}>
          <Pressable onPress={() => setMode('academic')} style={[s.segmentButton, mode === 'academic' && s.segmentActive]}>
            <Text style={[s.segmentText, mode === 'academic' && s.segmentTextActive]}>Colegio</Text>
          </Pressable>
          <Pressable onPress={() => setMode('event')} style={[s.segmentButton, mode === 'event' && s.segmentActive]}>
            <Text style={[s.segmentText, mode === 'event' && s.segmentTextActive]}>Actividad</Text>
          </Pressable>
        </View>

        <Text style={s.label}>{mode === 'academic' ? 'Tipo' : 'Categoría'}</Text>
        <View style={s.chips}>
          {(mode === 'academic' ? academicTypes : eventCategories).map(([value, label]) => {
            const active = (mode === 'academic' ? academicType : category) === value;
            return (
              <Pressable key={value} onPress={() => mode === 'academic' ? setAcademicType(value) : setCategory(value)} style={[s.chip, active && s.chipActive]}>
                <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput style={s.input} value={title} onChangeText={setTitle} maxLength={180} placeholder={mode === 'academic' ? 'Ej. Prueba de Ciencias' : 'Ej. Entrenamiento de fútbol'} />
        {mode === 'academic' ? (
          <>
            <TextInput style={s.input} value={subject} onChangeText={setSubject} maxLength={100} placeholder="Asignatura (opcional)" />
            <TextInput style={s.input} value={materials} onChangeText={setMaterials} maxLength={600} placeholder="Materiales, separados por coma" />
            <Text style={s.label}>Prioridad</Text>
            <View style={s.chips}>
              {priorities.map(([value, label]) => (
                <Pressable key={value} onPress={() => setPriority(value)} style={[s.chip, priority === value && s.chipActive]}>
                  <Text style={[s.chipText, priority === value && s.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Text style={s.label}>¿Cuándo?</Text>
        <View style={s.selectorRow}>
          <Pressable onPress={openDatePicker} style={[s.selector, s.dateSelector]}>
            <Text style={s.selectorLabel}>Fecha</Text>
            <Text numberOfLines={1} style={s.selectorValue}>{displayDate(date)}</Text>
          </Pressable>
          <Pressable onPress={() => setPickerMode('time')} style={[s.selector, s.timeSelector]}>
            <Text style={s.selectorLabel}>Hora</Text>
            <Text style={s.selectorValue}>{time}</Text>
          </Pressable>
        </View>
        <View style={s.quickRow}>
          <Pressable onPress={() => quickDate(0)} style={s.quickButton}><Text style={s.quickText}>Hoy</Text></Pressable>
          <Pressable onPress={() => quickDate(1)} style={s.quickButton}><Text style={s.quickText}>Mañana</Text></Pressable>
          <Pressable onPress={() => setTime('18:00')} style={s.quickButton}><Text style={s.quickText}>18:00</Text></Pressable>
        </View>

        <TextInput style={[s.input, s.notes]} value={detail} onChangeText={setDetail} maxLength={2000} multiline placeholder="Detalle opcional" />
        {category === 'health' && mode === 'event' ? <Text style={s.private}>Los eventos de salud se guardan como privados por defecto. After solo recuerda; no entrega indicaciones médicas.</Text> : null}
        <Pressable disabled={busy || !selected} onPress={() => void saveManual()} style={[s.primaryButton, (busy || !selected) && s.disabled]}>
          <Text style={s.primaryText}>{busy ? 'Guardando…' : 'Guardar'}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={pickerMode !== null} transparent animationType="fade" onRequestClose={() => setPickerMode(null)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerMode(null)} />
          <View style={s.modalCard}>
            <View style={s.modalHead}>
              <View>
                <Text style={s.modalKicker}>{pickerMode === 'date' ? 'FECHA' : 'HORA'}</Text>
                <Text style={s.modalTitle}>{pickerMode === 'date' ? displayDate(date) : time}</Text>
              </View>
              <Pressable onPress={() => setPickerMode(null)} style={s.closeButton}><Text style={s.closeText}>Cerrar</Text></Pressable>
            </View>

            {pickerMode === 'date' ? (
              <>
                <View style={s.monthHead}>
                  <Pressable onPress={() => setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} style={s.monthButton}><Text style={s.monthButtonText}>‹</Text></Pressable>
                  <Text style={s.monthTitle}>{calendarCursor.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}</Text>
                  <Pressable onPress={() => setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} style={s.monthButton}><Text style={s.monthButtonText}>›</Text></Pressable>
                </View>
                <View style={s.weekdays}>{weekdays.map((weekday, index) => <Text key={`${weekday}-${index}`} style={s.weekday}>{weekday}</Text>)}</View>
                <View style={s.calendarGrid}>
                  {calendar.map((cell) => {
                    const active = cell.value === date;
                    return (
                      <Pressable key={cell.value} onPress={() => { setDate(cell.value); setPickerMode(null); }} style={[s.dayCell, active && s.dayCellActive]}>
                        <Text style={[s.dayText, !cell.inMonth && s.dayTextMuted, active && s.dayTextActive]}>{cell.day}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={s.modalQuickRow}>
                  <Pressable onPress={() => { quickDate(0); setPickerMode(null); }} style={s.modalQuick}><Text style={s.modalQuickText}>Hoy</Text></Pressable>
                  <Pressable onPress={() => { quickDate(1); setPickerMode(null); }} style={s.modalQuick}><Text style={s.modalQuickText}>Mañana</Text></Pressable>
                </View>
              </>
            ) : (
              <ScrollView style={s.timeScroll} contentContainerStyle={s.timeGrid}>
                {timeOptions.map((value) => (
                  <Pressable key={value} onPress={() => { setTime(value); setPickerMode(null); }} style={[s.timeOption, time === value && s.timeOptionActive]}>
                    <Text style={[s.timeOptionText, time === value && s.timeOptionTextActive]}>{value}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F7F5' },
  body: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 56, gap: 12 },
  kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.35, color: '#6F756F' },
  title: { fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8, color: '#171A18' },
  copy: { fontSize: 15, lineHeight: 22, color: '#5C626D', marginBottom: 5 },
  heading: { fontSize: 17, fontWeight: '900', color: '#171A18' },
  muted: { fontSize: 12, lineHeight: 18, color: '#6D737C' },
  label: { fontSize: 13, fontWeight: '800', marginTop: 5, color: '#434943' },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#D9DBD7', backgroundColor: '#FFF' },
  chipActive: { backgroundColor: '#171A18', borderColor: '#171A18' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#4F5660' },
  chipTextActive: { color: '#FFF' },
  ocrBox: { gap: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DEE2DC', borderRadius: 18, padding: 16 },
  secondaryButton: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 13, backgroundColor: '#171A18', alignItems: 'center' },
  secondaryText: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  panel: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E3DF', borderRadius: 18, padding: 15, gap: 3 },
  documentRow: { borderTopWidth: 1, borderTopColor: '#EEEFEA', paddingVertical: 12, gap: 6 },
  documentName: { fontSize: 14, fontWeight: '800', color: '#171A18' },
  meta: { fontSize: 12, lineHeight: 17, color: '#747B86', marginTop: 3 },
  errorText: { fontSize: 12, lineHeight: 17, color: '#9B3B3B', marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center', marginTop: 7 },
  actionButton: { borderWidth: 1, borderColor: '#D9DDD7', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 },
  actionText: { fontSize: 12, fontWeight: '800', color: '#242925' },
  deleteText: { fontSize: 12, fontWeight: '800', color: '#A64242' },
  reviewBox: { backgroundColor: '#F0F3EE', borderRadius: 20, padding: 16, gap: 12 },
  reviewTitle: { fontSize: 20, fontWeight: '900', color: '#171A18' },
  ocrText: { fontSize: 13, lineHeight: 19, color: '#4F5650', backgroundColor: '#FFF', borderRadius: 14, padding: 13 },
  candidate: { backgroundColor: '#FFF', borderRadius: 15, padding: 14, borderWidth: 1, borderColor: '#DDE2DA' },
  candidateHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  candidateType: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase', color: '#657066' },
  confidence: { fontSize: 11, fontWeight: '800', color: '#7B817B' },
  candidateTitle: { fontSize: 16, fontWeight: '900', marginTop: 5, color: '#171A18' },
  candidateCopy: { fontSize: 13, lineHeight: 18, color: '#565D57', marginTop: 6 },
  materialText: { fontSize: 12, lineHeight: 18, fontWeight: '700', color: '#495A4A', marginTop: 6 },
  acceptButton: { backgroundColor: '#171A18', borderRadius: 11, paddingVertical: 9, paddingHorizontal: 12 },
  acceptText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  resolved: { fontSize: 12, fontWeight: '800', color: '#4E6C54', marginTop: 8 },
  divider: { height: 1, backgroundColor: '#DDDFDA', marginVertical: 7 },
  segment: { flexDirection: 'row', backgroundColor: '#E9EAE7', padding: 4, borderRadius: 14 },
  segmentButton: { flex: 1, padding: 11, alignItems: 'center', borderRadius: 11 },
  segmentActive: { backgroundColor: '#FFF' },
  segmentText: { fontWeight: '700', color: '#6D737C' },
  segmentTextActive: { color: '#111318' },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDE1DC', borderRadius: 15, padding: 14, fontSize: 16, color: '#171A18' },
  notes: { minHeight: 88, textAlignVertical: 'top' },
  private: { fontSize: 12, lineHeight: 18, color: '#6E5560' },
  primaryButton: { backgroundColor: '#171A18', borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  selectorRow: { flexDirection: 'row', gap: 10 },
  selector: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDE1DC', borderRadius: 15, paddingHorizontal: 14, paddingVertical: 12 },
  dateSelector: { flex: 1, minWidth: 0 },
  timeSelector: { width: 104 },
  selectorLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', color: '#838983' },
  selectorValue: { fontSize: 14, lineHeight: 20, fontWeight: '800', color: '#1B1F1B', marginTop: 3 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  quickButton: { borderWidth: 1, borderColor: '#D9DDD7', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#FFF' },
  quickText: { fontSize: 12, fontWeight: '800', color: '#4B534C' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,18,16,0.42)' },
  modalCard: { backgroundColor: '#FAFAF8', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 30, maxHeight: '82%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  modalKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: '#808680' },
  modalTitle: { fontSize: 19, lineHeight: 25, fontWeight: '900', color: '#181C19', textTransform: 'capitalize' },
  closeButton: { borderWidth: 1, borderColor: '#D8DDD7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFF' },
  closeText: { fontSize: 12, fontWeight: '900', color: '#313832' },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  monthButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#EEF0EB' },
  monthButtonText: { fontSize: 28, lineHeight: 30, fontWeight: '500', color: '#303630' },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '900', color: '#303630', textTransform: 'capitalize' },
  weekdays: { flexDirection: 'row', marginBottom: 4 },
  weekday: { width: '14.2857%', textAlign: 'center', fontSize: 11, fontWeight: '900', color: '#838983' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  dayCellActive: { backgroundColor: '#1A1E1A' },
  dayText: { fontSize: 13, fontWeight: '800', color: '#303630' },
  dayTextMuted: { color: '#B0B4AF' },
  dayTextActive: { color: '#FFF' },
  modalQuickRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  modalQuick: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 13, backgroundColor: '#EEF0EB' },
  modalQuickText: { fontSize: 13, fontWeight: '900', color: '#333A34' },
  timeScroll: { maxHeight: 420 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  timeOption: { width: '23%', minWidth: 68, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#DDE1DC', backgroundColor: '#FFF' },
  timeOptionActive: { backgroundColor: '#1A1E1A', borderColor: '#1A1E1A' },
  timeOptionText: { fontSize: 13, fontWeight: '800', color: '#3A403A' },
  timeOptionTextActive: { color: '#FFF' },
});