import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

type Context = { family_id?: string; students?: Array<{ id:string; first_name:string; preferred_name?:string|null }> };
type Mode = 'academic'|'event';
type SourceDocument = {
  id:string; student_id:string|null; student_name:string|null; original_name:string; mime_type:string;
  size_bytes:number; processing_status:string; ocr_error?:string|null; ocr_excerpt?:string|null;
  candidate_count?:number; created_at:string;
};
type Candidate = {
  id:string; candidate_type:'academic_item'|'calendar_event'|'material'|'payment'|'note'; title:string;
  description?:string|null; starts_at?:string|null; due_at?:string|null; confidence?:number|null;
  status:string; payload?:{ academic_type?:string; subject?:string; priority?:string; materials?:string[] };
};
type Review = {
  document?:{ id:string; original_name:string; processing_status:string; ocr_text?:string|null; ocr_error?:string|null };
  candidates?:Candidate[];
};

const titleSchema=z.string().trim().min(1).max(180);
const dateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const academicTypes=[['task','Tarea'],['test','Prueba'],['exam','Examen'],['project','Proyecto'],['material','Material']] as const;
const eventCategories=[['sport','Deporte'],['health','Salud'],['social','Social'],['family','Familia'],['school','Colegio'],['study','Estudio'],['other','Otro']] as const;
const priorities=[['low','Baja'],['normal','Normal'],['high','Alta'],['urgent','Urgente']] as const;
const allowedMime=new Set(['application/pdf','image/jpeg','image/png','image/webp']);
const MAX_FILE_BYTES=8*1024*1024;

function localIso(date:string,time:string){const d=new Date(`${date}T${time}:00`);return Number.isNaN(d.getTime())?null:d.toISOString();}
function prettyBytes(value:number){if(value<1024)return `${value} B`; if(value<1024*1024)return `${Math.round(value/1024)} KB`; return `${(value/(1024*1024)).toFixed(1)} MB`;}
function safeFileName(name:string){return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'_').replace(/_+/g,'_').slice(-120)||'documento';}
function candidateLabel(c:Candidate){if(c.candidate_type==='calendar_event')return 'Evento escolar';if(c.candidate_type==='material')return 'Material';if(c.candidate_type==='payment')return 'Pago / cobro';if(c.candidate_type==='note')return 'Aviso';const map:Record<string,string>={task:'Tarea',test:'Prueba',exam:'Examen',project:'Proyecto',material:'Material',school_event:'Evento escolar'};return map[c.payload?.academic_type??'']??'Pendiente escolar';}
function formatCandidateDate(c:Candidate){const raw=c.due_at||c.starts_at;if(!raw)return 'Fecha por confirmar';const d=new Date(raw);return Number.isNaN(d.getTime())?'Fecha por confirmar':d.toLocaleString('es-CL',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}

export default function Add(){
  const [context,setContext]=useState<Context>({});
  const [mode,setMode]=useState<Mode>('academic');
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [processingId,setProcessingId]=useState<string|null>(null);
  const [deletingId,setDeletingId]=useState<string|null>(null);
  const [candidateBusyId,setCandidateBusyId]=useState<string|null>(null);
  const [studentId,setStudentId]=useState('');
  const [title,setTitle]=useState('');
  const [date,setDate]=useState('');
  const [time,setTime]=useState('18:00');
  const [detail,setDetail]=useState('');
  const [subject,setSubject]=useState('');
  const [materials,setMaterials]=useState('');
  const [priority,setPriority]=useState('normal');
  const [academicType,setAcademicType]=useState('task');
  const [category,setCategory]=useState('sport');
  const [documents,setDocuments]=useState<SourceDocument[]>([]);
  const [review,setReview]=useState<Review|null>(null);

  useEffect(()=>{void loadContext();void loadDocuments();},[]);
  const students=context.students??[];
  const selected=useMemo(()=>students.find(s=>s.id===studentId),[students,studentId]);

  async function loadContext(){const {data}=await supabase.rpc('after_my_context');const ctx=(data??{}) as Context;setContext(ctx);const first=ctx.students?.[0];if(first)setStudentId(current=>current||first.id);}
  async function loadDocuments(){const {data,error}=await supabase.rpc('after_source_documents');if(!error)setDocuments((data??[]) as SourceDocument[]);}

  async function openReview(documentId:string){
    const {data,error}=await supabase.rpc('after_document_review',{p_document_id:documentId});
    if(error)return Alert.alert('No pudimos abrir la revisión','Vuelve a intentar.');
    setReview((data??{}) as Review);
  }

  async function processOcr(documentId:string,showAlert=true){
    if(processingId)return;
    setProcessingId(documentId);
    try{
      const {data,error}=await supabase.functions.invoke('after-school-ocr',{body:{documentId}});
      if(error||!data?.ok){
        const providerMissing=data?.error==='ocr_provider_not_configured';
        throw new Error(providerMissing?'OCR pendiente de configurar en el servidor.':'No pudimos leer el documento.');
      }
      await loadDocuments();
      await openReview(documentId);
      if(showAlert)Alert.alert('Documento leído',data.candidateCount?`Encontramos ${data.candidateCount} elemento(s) para que los revises.`:'El texto fue leído, pero no encontramos tareas o eventos claros.');
    }catch(error){
      await loadDocuments();
      Alert.alert('OCR no disponible',error instanceof Error?error.message:'No pudimos procesar el archivo.');
    }finally{setProcessingId(null);}
  }

  async function uploadDocument(){
    if(!context.family_id||!studentId)return Alert.alert('Selecciona un alumno','El documento del colegio debe quedar asociado a un alumno.');
    const picked=await DocumentPicker.getDocumentAsync({type:['application/pdf','image/jpeg','image/png','image/webp'],copyToCacheDirectory:true,multiple:false});
    if(picked.canceled||!picked.assets[0])return;
    const asset=picked.assets[0]; const mime=asset.mimeType||''; const size=asset.size??0;
    if(!allowedMime.has(mime))return Alert.alert('Formato no permitido','Puedes adjuntar PDF, JPG, PNG o WEBP.');
    if(size<=0||size>MAX_FILE_BYTES)return Alert.alert('Archivo demasiado grande','El máximo permitido es 8 MB.');

    setUploading(true);
    let storagePath:string|null=null;
    try{
      const {data:{user},error:userError}=await supabase.auth.getUser();
      if(userError||!user)throw new Error('session');
      const file=new File(asset.uri); const bytes=await file.arrayBuffer();
      if(bytes.byteLength>MAX_FILE_BYTES)throw new Error('size');
      storagePath=`${context.family_id}/${user.id}/${Crypto.randomUUID()}-${safeFileName(asset.name)}`;
      const {error:uploadError}=await supabase.storage.from('after-source-documents').upload(storagePath,bytes,{contentType:mime,upsert:false,cacheControl:'3600'});
      if(uploadError)throw uploadError;
      const {data:documentId,error:registerError}=await supabase.rpc('after_register_source_document',{p_family_id:context.family_id,p_student_id:studentId,p_storage_path:storagePath,p_original_name:asset.name,p_mime_type:mime,p_size_bytes:size});
      if(registerError||!documentId){await supabase.storage.from('after-source-documents').remove([storagePath]);throw registerError??new Error('register');}
      await loadDocuments();
      setUploading(false);
      await processOcr(String(documentId),false);
    }catch{
      if(storagePath)await supabase.storage.from('after-source-documents').remove([storagePath]);
      Alert.alert('No pudimos subir el documento','Revisa tu sesión, el formato y el tamaño e intenta nuevamente.');
    }finally{setUploading(false);}
  }

  async function reviewCandidate(candidate:Candidate,action:'accept'|'reject'){
    if(candidateBusyId)return;
    setCandidateBusyId(candidate.id);
    const rpc=action==='accept'?'after_accept_document_candidate':'after_reject_document_candidate';
    const args=action==='accept'?{p_candidate_id:candidate.id}:{p_candidate_id:candidate.id};
    const {error}=await supabase.rpc(rpc,args);
    setCandidateBusyId(null);
    if(error){
      const missingDate=String(error.message??'').includes('candidate_date_required');
      return Alert.alert('Revisión pendiente',missingDate?'Este evento no tiene una fecha suficientemente clara. Agrégalo manualmente después de verificar el documento.':'No pudimos guardar esta decisión. Vuelve a intentar.');
    }
    if(review?.document?.id)await openReview(review.document.id);
    await loadDocuments();
  }

  async function deleteDocument(documentId:string){
    if(deletingId)return;
    setDeletingId(documentId);
    try{
      const {data:path,error:pathError}=await supabase.rpc('after_get_source_document_delete_path',{p_document_id:documentId});
      if(pathError||typeof path!=='string'||!path)throw new Error('not_allowed');
      const {error:storageError}=await supabase.storage.from('after-source-documents').remove([path]);
      if(storageError)throw storageError;
      const {data:deleted,error:deleteError}=await supabase.rpc('after_delete_source_document',{p_document_id:documentId,p_storage_path:path});
      if(deleteError||deleted!==true)throw new Error('metadata');
      if(review?.document?.id===documentId)setReview(null);
      await loadDocuments();
    }catch{
      Alert.alert('No pudimos eliminar el documento','Solo quien lo subió puede eliminarlo. Vuelve a intentar.');
    }finally{setDeletingId(null);}
  }

  function confirmDelete(doc:SourceDocument){Alert.alert('Eliminar documento','Se eliminará el archivo privado, su OCR y sus candidatos. Esta acción no se puede deshacer.',[{text:'Cancelar',style:'cancel'},{text:'Eliminar',style:'destructive',onPress:()=>void deleteDocument(doc.id)}]);}

  async function save(){
    const parsedTitle=titleSchema.safeParse(title); const parsedDate=dateSchema.safeParse(date); const parsedTime=timeSchema.safeParse(time);
    if(!studentId||!parsedTitle.success||!parsedDate.success||!parsedTime.success)return Alert.alert('Revisa los datos','Selecciona alumno, título, fecha y hora válidos.');
    const when=localIso(parsedDate.data,parsedTime.data); if(!when)return Alert.alert('Fecha inválida','Revisa la fecha y hora.');
    setBusy(true);
    const materialList=materials.split(',').map(x=>x.trim()).filter(Boolean).slice(0,20);
    const result=mode==='academic'
      ? await supabase.rpc('after_create_school_item',{p_student_id:studentId,p_type:academicType,p_title:parsedTitle.data,p_description:detail.trim()||null,p_due_at:when,p_priority:priority,p_subject_name:subject.trim()||null,p_materials:materialList,p_source_document_id:null})
      : await supabase.rpc('after_create_calendar_event',{p_family_id:context.family_id,p_student_id:studentId,p_category:category,p_title:parsedTitle.data,p_starts_at:when,p_ends_at:null,p_location:null,p_notes:detail.trim()||null,p_sensitivity:category==='health'?'private':'normal'});
    setBusy(false);
    if(result.error)return Alert.alert('No pudimos guardar','Tu sesión o permisos no permiten esta operación. Intenta nuevamente.');
    setTitle('');setDate('');setDetail('');setSubject('');setMaterials('');setPriority('normal');
    Alert.alert('Guardado',mode==='academic'?'Quedó incorporado a la preparación escolar.':'El compromiso quedó agregado.',[{text:'Ver semana',onPress:()=>router.push('/(app)/agenda')},{text:'Agregar otro'}]);
  }

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
    <Text style={s.kicker}>AGREGAR</Text><Text style={s.title}>Lo que manda el colegio, sin copiarlo a mano.</Text>
    <Text style={s.copy}>Sube una circular, guía, captura o PDF. After lo lee con OCR, propone tareas, pruebas, materiales y eventos, y tú confirmas antes de guardar.</Text>
    <Text style={s.label}>¿Para quién?</Text><View style={s.chips}>{students.map(st=><Pressable key={st.id} onPress={()=>setStudentId(st.id)} style={[s.chip,studentId===st.id&&s.chipActive]}><Text style={[s.chipText,studentId===st.id&&s.chipTextActive]}>{st.preferred_name||st.first_name}</Text></Pressable>)}</View>

    <View style={s.ocrBox}><View style={s.flex}><Text style={s.heading}>Importar desde el colegio</Text><Text style={s.muted}>PDF, JPG, PNG o WEBP · máximo 8 MB · archivo privado · revisión humana obligatoria.</Text></View><Pressable disabled={uploading||!selected} onPress={uploadDocument} style={[s.secondaryButton,(uploading||!selected)&&s.disabled]}><Text style={s.secondaryText}>{uploading?'Subiendo…':'Subir y leer'}</Text></Pressable></View>

    {documents.length>0?<View style={s.history}><Text style={s.heading}>Documentos recientes</Text>{documents.slice(0,6).map(doc=>{const processing=processingId===doc.id||doc.processing_status==='processing';const ready=doc.processing_status==='ready'||doc.processing_status==='reviewed';return <View key={doc.id} style={s.docBlock}><View style={s.docRow}><View style={s.flex}><Text numberOfLines={1} style={s.docName}>{doc.original_name}</Text><Text style={s.meta}>{doc.student_name||'Alumno'} · {prettyBytes(Number(doc.size_bytes))} · {processing?'Leyendo…':ready?'OCR listo':doc.processing_status==='failed'?'OCR con error':'Pendiente'}</Text>{doc.ocr_error?<Text style={s.errorText}>{doc.ocr_error}</Text>:null}</View></View><View style={s.docButtons}>{!processing&&doc.processing_status!=='reviewed'?<Pressable onPress={()=>void processOcr(doc.id)} style={s.linkButton}><Text style={s.linkText}>{ready?'Leer de nuevo':'Procesar OCR'}</Text></Pressable>:null}{ready?<Pressable onPress={()=>void openReview(doc.id)} style={s.linkButton}><Text style={s.linkText}>Revisar{Number(doc.candidate_count)>0?` (${doc.candidate_count})`:''}</Text></Pressable>:null}<Pressable disabled={deletingId===doc.id} onPress={()=>confirmDelete(doc)} style={s.linkButton}><Text style={s.deleteText}>{deletingId===doc.id?'Eliminando…':'Eliminar'}</Text></Pressable></View></View>})}</View>:null}

    {review?.document?<View style={s.reviewBox}><Text style={s.kicker}>REVISIÓN DEL OCR</Text><Text style={s.reviewTitle}>{review.document.original_name}</Text>{review.document.ocr_text?<Text numberOfLines={12} style={s.ocrText}>{review.document.ocr_text}</Text>:null}<Text style={s.heading}>Lo que After encontró</Text>{(review.candidates??[]).length===0?<Text style={s.muted}>No encontramos elementos claros para crear. Conservamos el texto para que puedas revisarlo.</Text>:(review.candidates??[]).map(c=><View key={c.id} style={s.candidate}><View style={s.candidateHead}><Text style={s.candidateType}>{candidateLabel(c)}</Text><Text style={s.confidence}>{c.confidence==null?'':`${Math.round(Number(c.confidence)*100)}%`}</Text></View><Text style={s.candidateTitle}>{c.title}</Text><Text style={s.meta}>{formatCandidateDate(c)}{c.payload?.subject?` · ${c.payload.subject}`:''}</Text>{c.description?<Text style={s.candidateCopy}>{c.description}</Text>:null}{c.payload?.materials?.length?<Text style={s.materialText}>Llevar: {c.payload.materials.join(', ')}</Text>:null}{c.status==='pending'?<View style={s.candidateActions}>{c.candidate_type==='academic_item'||c.candidate_type==='calendar_event'||c.candidate_type==='material'?<Pressable disabled={candidateBusyId===c.id} onPress={()=>void reviewCandidate(c,'accept')} style={s.acceptButton}><Text style={s.acceptText}>{candidateBusyId===c.id?'Guardando…':'Confirmar'}</Text></Pressable>:<Text style={s.muted}>Aviso informativo: revísalo antes de crear algo manualmente.</Text>}<Pressable disabled={candidateBusyId===c.id} onPress={()=>void reviewCandidate(c,'reject')} style={s.rejectButton}><Text style={s.rejectText}>Descartar</Text></Pressable></View>:<Text style={s.resolved}>{c.status==='accepted'?'Guardado en After':'Descartado'}</Text>}</View>)}</View>:null}

    <View style={s.divider}/><Text style={s.heading}>O agregarlo manualmente</Text>
    <View style={s.segment}><Pressable onPress={()=>setMode('academic')} style={[s.segmentButton,mode==='academic'&&s.segmentActive]}><Text style={[s.segmentText,mode==='academic'&&s.segmentTextActive]}>Colegio</Text></Pressable><Pressable onPress={()=>setMode('event')} style={[s.segmentButton,mode==='event'&&s.segmentActive]}><Text style={[s.segmentText,mode==='event'&&s.segmentTextActive]}>Actividad</Text></Pressable></View>
    <Text style={s.label}>{mode==='academic'?'Tipo':'Categoría'}</Text><View style={s.chips}>{(mode==='academic'?academicTypes:eventCategories).map(([value,label])=><Pressable key={value} onPress={()=>mode==='academic'?setAcademicType(value):setCategory(value)} style={[s.chip,(mode==='academic'?academicType:category)===value&&s.chipActive]}><Text style={[s.chipText,(mode==='academic'?academicType:category)===value&&s.chipTextActive]}>{label}</Text></Pressable>)}</View>
    <TextInput style={s.input} value={title} onChangeText={setTitle} maxLength={180} placeholder={mode==='academic'?'Ej. Prueba de Ciencias':'Ej. Entrenamiento de fútbol'}/>
    {mode==='academic'?<><TextInput style={s.input} value={subject} onChangeText={setSubject} maxLength={100} placeholder="Asignatura (opcional)"/><TextInput style={s.input} value={materials} onChangeText={setMaterials} maxLength={600} placeholder="Materiales, separados por coma"/><Text style={s.label}>Prioridad</Text><View style={s.chips}>{priorities.map(([value,label])=><Pressable key={value} onPress={()=>setPriority(value)} style={[s.chip,priority===value&&s.chipActive]}><Text style={[s.chipText,priority===value&&s.chipTextActive]}>{label}</Text></Pressable>)}</View></>:null}
    <View style={s.row}><TextInput style={[s.input,s.flex]} value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation"/><TextInput style={[s.input,s.time]} value={time} onChangeText={setTime} placeholder="HH:MM" keyboardType="numbers-and-punctuation"/></View>
    <TextInput style={[s.input,s.notes]} value={detail} onChangeText={setDetail} maxLength={2000} multiline placeholder="Detalle opcional"/>
    {category==='health'&&mode==='event'?<Text style={s.private}>Los eventos de salud se guardan como privados por defecto. After solo recuerda; no entrega indicaciones médicas.</Text>:null}
    <Pressable disabled={busy||!selected} onPress={save} style={[s.button,(busy||!selected)&&s.disabled]}><Text style={s.buttonText}>{busy?'Guardando…':'Guardar'}</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F7F5'},body:{padding:22,paddingBottom:48,gap:12},kicker:{fontSize:11,fontWeight:'900',letterSpacing:1.35,color:'#6F756F'},title:{fontSize:31,lineHeight:36,fontWeight:'900',letterSpacing:-.8,color:'#171A18'},copy:{fontSize:15,lineHeight:22,color:'#5C626D',marginBottom:5},heading:{fontSize:17,fontWeight:'900',color:'#171A18'},muted:{fontSize:12,lineHeight:18,color:'#6D737C'},flex:{flex:1},ocrBox:{flexDirection:'row',gap:12,alignItems:'center',backgroundColor:'#FFF',borderWidth:1,borderColor:'#DEE2DC',borderRadius:18,padding:16},secondaryButton:{paddingVertical:11,paddingHorizontal:14,borderRadius:13,backgroundColor:'#171A18'},secondaryText:{color:'#FFF',fontWeight:'900',fontSize:13},history:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E0E3DF',borderRadius:18,padding:15,gap:3},docBlock:{borderTopWidth:1,borderTopColor:'#EEEFEA',paddingVertical:12,gap:8},docRow:{flexDirection:'row',alignItems:'center',gap:10},docName:{fontSize:14,fontWeight:'850',color:'#171A18'},meta:{fontSize:12,color:'#747B86',marginTop:3},errorText:{fontSize:12,lineHeight:17,color:'#9B3B3B',marginTop:4},docButtons:{flexDirection:'row',flexWrap:'wrap',gap:7},linkButton:{borderWidth:1,borderColor:'#D9DDD7',borderRadius:10,paddingVertical:7,paddingHorizontal:10},linkText:{fontSize:12,fontWeight:'850',color:'#242925'},deleteText:{fontSize:12,fontWeight:'850',color:'#A64242'},reviewBox:{backgroundColor:'#F0F3EE',borderRadius:20,padding:16,gap:12},reviewTitle:{fontSize:20,fontWeight:'900',color:'#171A18'},ocrText:{fontSize:13,lineHeight:19,color:'#4F5650',backgroundColor:'#FFF',borderRadius:14,padding:13},candidate:{backgroundColor:'#FFF',borderRadius:15,padding:14,borderWidth:1,borderColor:'#DDE2DA'},candidateHead:{flexDirection:'row',justifyContent:'space-between',gap:10},candidateType:{fontSize:11,fontWeight:'900',letterSpacing:.5,textTransform:'uppercase',color:'#657066'},confidence:{fontSize:11,fontWeight:'800',color:'#7B817B'},candidateTitle:{fontSize:16,fontWeight:'900',marginTop:5,color:'#171A18'},candidateCopy:{fontSize:13,lineHeight:18,color:'#565D57',marginTop:6},materialText:{fontSize:12,lineHeight:18,fontWeight:'700',color:'#495A4A',marginTop:6},candidateActions:{marginTop:11,flexDirection:'row',alignItems:'center',gap:8},acceptButton:{backgroundColor:'#171A18',borderRadius:11,paddingVertical:9,paddingHorizontal:12},acceptText:{color:'#FFF',fontSize:12,fontWeight:'900'},rejectButton:{borderWidth:1,borderColor:'#D8DBD6',borderRadius:11,paddingVertical:9,paddingHorizontal:12},rejectText:{fontSize:12,fontWeight:'850',color:'#7C4545'},resolved:{fontSize:12,fontWeight:'850',color:'#4E6C54',marginTop:8},divider:{height:1,backgroundColor:'#DDDFDA',marginVertical:7},segment:{flexDirection:'row',backgroundColor:'#E9EAE7',padding:4,borderRadius:14},segmentButton:{flex:1,padding:11,alignItems:'center',borderRadius:11},segmentActive:{backgroundColor:'#FFF'},segmentText:{fontWeight:'750',color:'#6D737C'},segmentTextActive:{color:'#111318'},label:{fontSize:13,fontWeight:'850',marginTop:5,color:'#434943'},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{paddingVertical:9,paddingHorizontal:12,borderRadius:999,borderWidth:1,borderColor:'#D9DBD7',backgroundColor:'#FFF'},chipActive:{backgroundColor:'#171A18',borderColor:'#171A18'},chipText:{fontSize:13,fontWeight:'750',color:'#4F5660'},chipTextActive:{color:'#FFF'},input:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#DDE1DC',borderRadius:15,padding:14,fontSize:16,color:'#171A18'},row:{flexDirection:'row',gap:10},time:{width:105},notes:{minHeight:88,textAlignVertical:'top'},private:{fontSize:12,lineHeight:18,color:'#6E5560'},button:{backgroundColor:'#171A18',borderRadius:16,padding:16,alignItems:'center',marginTop:4},buttonText:{color:'#FFF',fontSize:16,fontWeight:'900'},disabled:{opacity:.45}});
