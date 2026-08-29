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
type SourceDocument = { id:string; student_id:string|null; student_name:string|null; original_name:string; mime_type:string; size_bytes:number; processing_status:string; created_at:string };

const titleSchema=z.string().trim().min(1).max(180);
const dateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const academicTypes=[['task','Tarea'],['test','Prueba'],['exam','Examen'],['project','Proyecto'],['material','Material']] as const;
const eventCategories=[['sport','Deporte'],['health','Salud'],['social','Social'],['family','Familia'],['school','Colegio'],['study','Estudio'],['other','Otro']] as const;
const allowedMime=new Set(['application/pdf','image/jpeg','image/png','image/webp']);
const MAX_FILE_BYTES=8*1024*1024;

function localIso(date:string,time:string){const d=new Date(`${date}T${time}:00`);return Number.isNaN(d.getTime())?null:d.toISOString();}
function prettyBytes(value:number){if(value<1024)return `${value} B`; if(value<1024*1024)return `${Math.round(value/1024)} KB`; return `${(value/(1024*1024)).toFixed(1)} MB`;}
function safeFileName(name:string){return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'_').replace(/_+/g,'_').slice(-120)||'documento';}

export default function Add(){
  const [context,setContext]=useState<Context>({}); const [mode,setMode]=useState<Mode>('academic'); const [busy,setBusy]=useState(false); const [uploading,setUploading]=useState(false); const [deletingId,setDeletingId]=useState<string|null>(null);
  const [studentId,setStudentId]=useState(''); const [title,setTitle]=useState(''); const [date,setDate]=useState(''); const [time,setTime]=useState('18:00'); const [detail,setDetail]=useState('');
  const [academicType,setAcademicType]=useState('task'); const [category,setCategory]=useState('sport'); const [documents,setDocuments]=useState<SourceDocument[]>([]);
  useEffect(()=>{void loadContext();void loadDocuments();},[]);
  const students=context.students??[]; const selected=useMemo(()=>students.find(s=>s.id===studentId),[students,studentId]);

  async function loadContext(){const {data}=await supabase.rpc('after_my_context');const ctx=(data??{}) as Context;setContext(ctx);const first=ctx.students?.[0];if(first)setStudentId(current=>current||first.id);}
  async function loadDocuments(){const {data,error}=await supabase.rpc('after_source_documents');if(!error)setDocuments((data??[]) as SourceDocument[]);}

  async function uploadDocument(){
    if(!context.family_id||!studentId)return Alert.alert('Selecciona un alumno','El documento debe quedar asociado a una familia y a un alumno.');
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
      if(bytes.byteLength!==size&&bytes.byteLength>MAX_FILE_BYTES)throw new Error('size');
      storagePath=`${context.family_id}/${user.id}/${Crypto.randomUUID()}-${safeFileName(asset.name)}`;
      const {error:uploadError}=await supabase.storage.from('after-source-documents').upload(storagePath,bytes,{contentType:mime,upsert:false,cacheControl:'3600'});
      if(uploadError)throw uploadError;
      const {error:registerError}=await supabase.rpc('after_register_source_document',{p_family_id:context.family_id,p_student_id:studentId,p_storage_path:storagePath,p_original_name:asset.name,p_mime_type:mime,p_size_bytes:size});
      if(registerError){await supabase.storage.from('after-source-documents').remove([storagePath]);throw registerError;}
      await loadDocuments();
      Alert.alert('Documento protegido','Se guardó en almacenamiento privado. Todavía no se analiza automáticamente: primero validaremos el flujo con material real.');
    }catch{
      if(storagePath)await supabase.storage.from('after-source-documents').remove([storagePath]);
      Alert.alert('No pudimos subir el documento','Revisa tu sesión, el formato y el tamaño e intenta nuevamente.');
    }finally{setUploading(false);}
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
      await loadDocuments();
    }catch{
      Alert.alert('No pudimos eliminar el documento','Solo quien lo subió puede eliminarlo. Si el archivo ya fue retirado pero el registro permanece, vuelve a intentar.');
    }finally{setDeletingId(null);}
  }

  function confirmDelete(doc:SourceDocument){
    Alert.alert('Eliminar documento','Se eliminará el archivo privado y su registro de After. Esta acción no se puede deshacer.',[
      {text:'Cancelar',style:'cancel'},
      {text:'Eliminar',style:'destructive',onPress:()=>void deleteDocument(doc.id)},
    ]);
  }

  async function save(){
    const parsedTitle=titleSchema.safeParse(title); const parsedDate=dateSchema.safeParse(date); const parsedTime=timeSchema.safeParse(time);
    if(!studentId||!parsedTitle.success||!parsedDate.success||!parsedTime.success) return Alert.alert('Revisa los datos','Selecciona un alumno, título, fecha y hora válidos. Usa fecha AAAA-MM-DD y hora HH:MM.');
    const when=localIso(parsedDate.data,parsedTime.data); if(!when)return Alert.alert('Fecha inválida','Revisa la fecha y hora.');
    setBusy(true);
    const result=mode==='academic'
      ? await supabase.rpc('after_create_academic_item',{p_student_id:studentId,p_type:academicType,p_title:parsedTitle.data,p_description:detail.trim()||null,p_due_at:when,p_priority:'normal'})
      : await supabase.rpc('after_create_calendar_event',{p_family_id:context.family_id,p_student_id:studentId,p_category:category,p_title:parsedTitle.data,p_starts_at:when,p_ends_at:null,p_location:null,p_notes:detail.trim()||null,p_sensitivity:category==='health'?'private':'normal'});
    setBusy(false);
    if(result.error)return Alert.alert('No pudimos guardar','Tu sesión o permisos no permiten esta operación. Intenta nuevamente.');
    setTitle('');setDate('');setDetail('');Alert.alert('Guardado','El compromiso quedó agregado a la agenda.',[{text:'Ver agenda',onPress:()=>router.push('/(app)/agenda')},{text:'Agregar otro'}]);
  }

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
    <Text style={s.kicker}>AGREGAR INFORMACIÓN</Text><Text style={s.title}>¿Qué necesitas recordar?</Text><Text style={s.copy}>Registra un compromiso manualmente o guarda de forma privada una circular, PDF o imagen para revisarla dentro de After.</Text>
    <Text style={s.label}>Alumno</Text><View style={s.chips}>{students.map(st=><Pressable key={st.id} onPress={()=>setStudentId(st.id)} style={[s.chip,studentId===st.id&&s.chipActive]}><Text style={[s.chipText,studentId===st.id&&s.chipTextActive]}>{st.preferred_name||st.first_name}</Text></Pressable>)}</View>

    <View style={s.documentCard}><View style={{flex:1}}><Text style={s.heading}>Documento o imagen</Text><Text style={s.muted}>PDF, JPG, PNG o WEBP · máximo 8 MB · almacenamiento privado.</Text></View><Pressable disabled={uploading||!selected} onPress={uploadDocument} style={[s.secondaryButton,(uploading||!selected)&&s.disabled]}><Text style={s.secondaryText}>{uploading?'Subiendo…':'Adjuntar'}</Text></Pressable></View>
    {documents.length>0?<View style={s.history}><Text style={s.heading}>Subidos recientemente</Text>{documents.slice(0,5).map(doc=><View key={doc.id} style={s.docRow}><View style={{flex:1}}><Text numberOfLines={1} style={s.docName}>{doc.original_name}</Text><Text style={s.meta}>{doc.student_name||'Alumno'} · {prettyBytes(Number(doc.size_bytes))}</Text></View><View style={s.docActions}><Text style={s.status}>Protegido</Text><Pressable disabled={deletingId===doc.id} onPress={()=>confirmDelete(doc)}><Text style={s.deleteText}>{deletingId===doc.id?'Eliminando…':'Eliminar'}</Text></Pressable></View></View>)}</View>:null}

    <View style={s.segment}><Pressable onPress={()=>setMode('academic')} style={[s.segmentButton,mode==='academic'&&s.segmentActive]}><Text style={[s.segmentText,mode==='academic'&&s.segmentTextActive]}>Estudio</Text></Pressable><Pressable onPress={()=>setMode('event')} style={[s.segmentButton,mode==='event'&&s.segmentActive]}><Text style={[s.segmentText,mode==='event'&&s.segmentTextActive]}>Actividad</Text></Pressable></View>
    <Text style={s.label}>{mode==='academic'?'Tipo':'Categoría'}</Text><View style={s.chips}>{(mode==='academic'?academicTypes:eventCategories).map(([value,label])=><Pressable key={value} onPress={()=>mode==='academic'?setAcademicType(value):setCategory(value)} style={[s.chip,(mode==='academic'?academicType:category)===value&&s.chipActive]}><Text style={[s.chipText,(mode==='academic'?academicType:category)===value&&s.chipTextActive]}>{label}</Text></Pressable>)}</View>
    <TextInput style={s.input} value={title} onChangeText={setTitle} maxLength={180} placeholder={mode==='academic'?'Ej. Prueba de Ciencias':'Ej. Entrenamiento de fútbol'}/>
    <View style={s.row}><TextInput style={[s.input,s.flex]} value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation"/><TextInput style={[s.input,s.time]} value={time} onChangeText={setTime} placeholder="HH:MM" keyboardType="numbers-and-punctuation"/></View>
    <TextInput style={[s.input,s.notes]} value={detail} onChangeText={setDetail} maxLength={2000} multiline placeholder="Detalle opcional"/>
    {category==='health'&&mode==='event'?<Text style={s.private}>Los eventos de salud se guardan como privados por defecto.</Text>:null}
    <Pressable disabled={busy||!selected} onPress={save} style={[s.button,(busy||!selected)&&s.disabled]}><Text style={s.buttonText}>{busy?'Guardando…':'Guardar en After'}</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F7F5'},body:{padding:24,gap:12},kicker:{fontSize:12,fontWeight:'800',letterSpacing:1.3,color:'#777'},title:{fontSize:32,lineHeight:38,fontWeight:'800'},copy:{fontSize:15,lineHeight:22,color:'#5C626D',marginBottom:8},heading:{fontSize:16,fontWeight:'800'},muted:{fontSize:12,lineHeight:18,color:'#6D737C'},documentCard:{flexDirection:'row',gap:12,alignItems:'center',backgroundColor:'#FFF',borderWidth:1,borderColor:'#E0E3DF',borderRadius:17,padding:15},secondaryButton:{paddingVertical:10,paddingHorizontal:14,borderRadius:12,backgroundColor:'#111318'},secondaryText:{color:'#FFF',fontWeight:'800',fontSize:13},history:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E0E3DF',borderRadius:17,padding:15,gap:4},docRow:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10,borderTopWidth:1,borderTopColor:'#EEEFEA'},docName:{fontSize:14,fontWeight:'800'},meta:{fontSize:11,color:'#747B86',marginTop:2},docActions:{alignItems:'flex-end',gap:5},status:{fontSize:11,fontWeight:'800',color:'#46644C'},deleteText:{fontSize:11,fontWeight:'800',color:'#A64242'},segment:{flexDirection:'row',backgroundColor:'#E9EAE7',padding:4,borderRadius:14,marginTop:4},segmentButton:{flex:1,padding:11,alignItems:'center',borderRadius:11},segmentActive:{backgroundColor:'#FFF'},segmentText:{fontWeight:'700',color:'#6D737C'},segmentTextActive:{color:'#111318'},label:{fontSize:13,fontWeight:'800',marginTop:6},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{paddingVertical:9,paddingHorizontal:12,borderRadius:999,borderWidth:1,borderColor:'#D9DBD7',backgroundColor:'#FFF'},chipActive:{backgroundColor:'#111318',borderColor:'#111318'},chipText:{fontSize:13,fontWeight:'700',color:'#4F5660'},chipTextActive:{color:'#FFF'},input:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E0E3DF',borderRadius:15,padding:15,fontSize:16},row:{flexDirection:'row',gap:10},flex:{flex:1},time:{width:105},notes:{minHeight:92,textAlignVertical:'top'},private:{fontSize:12,lineHeight:18,color:'#6E5560'},button:{backgroundColor:'#111318',borderRadius:16,padding:17,alignItems:'center',marginTop:4},buttonText:{color:'#FFF',fontSize:16,fontWeight:'800'},disabled:{opacity:.45}});