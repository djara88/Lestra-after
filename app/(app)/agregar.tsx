import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

type Context = { family_id?: string; students?: Array<{ id:string; first_name:string; preferred_name?:string|null }> };
type Mode = 'academic'|'event';

const titleSchema=z.string().trim().min(1).max(180);
const dateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const academicTypes=[['task','Tarea'],['test','Prueba'],['exam','Examen'],['project','Proyecto'],['material','Material']] as const;
const eventCategories=[['sport','Deporte'],['health','Salud'],['social','Social'],['family','Familia'],['school','Colegio'],['study','Estudio'],['other','Otro']] as const;

function localIso(date:string,time:string){const d=new Date(`${date}T${time}:00`);return Number.isNaN(d.getTime())?null:d.toISOString();}

export default function Add(){
  const [context,setContext]=useState<Context>({}); const [mode,setMode]=useState<Mode>('academic'); const [busy,setBusy]=useState(false);
  const [studentId,setStudentId]=useState(''); const [title,setTitle]=useState(''); const [date,setDate]=useState(''); const [time,setTime]=useState('18:00'); const [detail,setDetail]=useState('');
  const [academicType,setAcademicType]=useState('task'); const [category,setCategory]=useState('sport');
  useEffect(()=>{supabase.rpc('after_my_context').then(({data})=>{const ctx=(data??{}) as Context;setContext(ctx);if(ctx.students?.[0])setStudentId(ctx.students[0].id);});},[]);
  const students=context.students??[]; const selected=useMemo(()=>students.find(s=>s.id===studentId),[students,studentId]);

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
    <Text style={s.kicker}>AGREGAR INFORMACIÓN</Text><Text style={s.title}>¿Qué necesitas recordar?</Text><Text style={s.copy}>Primero registramos información manualmente. Documentos y extracción automática vendrán después de validar este flujo.</Text>
    <View style={s.segment}><Pressable onPress={()=>setMode('academic')} style={[s.segmentButton,mode==='academic'&&s.segmentActive]}><Text style={[s.segmentText,mode==='academic'&&s.segmentTextActive]}>Estudio</Text></Pressable><Pressable onPress={()=>setMode('event')} style={[s.segmentButton,mode==='event'&&s.segmentActive]}><Text style={[s.segmentText,mode==='event'&&s.segmentTextActive]}>Actividad</Text></Pressable></View>
    <Text style={s.label}>Alumno</Text><View style={s.chips}>{students.map(st=><Pressable key={st.id} onPress={()=>setStudentId(st.id)} style={[s.chip,studentId===st.id&&s.chipActive]}><Text style={[s.chipText,studentId===st.id&&s.chipTextActive]}>{st.preferred_name||st.first_name}</Text></Pressable>)}</View>
    <Text style={s.label}>{mode==='academic'?'Tipo':'Categoría'}</Text><View style={s.chips}>{(mode==='academic'?academicTypes:eventCategories).map(([value,label])=><Pressable key={value} onPress={()=>mode==='academic'?setAcademicType(value):setCategory(value)} style={[s.chip,(mode==='academic'?academicType:category)===value&&s.chipActive]}><Text style={[s.chipText,(mode==='academic'?academicType:category)===value&&s.chipTextActive]}>{label}</Text></Pressable>)}</View>
    <TextInput style={s.input} value={title} onChangeText={setTitle} maxLength={180} placeholder={mode==='academic'?'Ej. Prueba de Ciencias':'Ej. Entrenamiento de fútbol'}/>
    <View style={s.row}><TextInput style={[s.input,s.flex]} value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation"/><TextInput style={[s.input,s.time]} value={time} onChangeText={setTime} placeholder="HH:MM" keyboardType="numbers-and-punctuation"/></View>
    <TextInput style={[s.input,s.notes]} value={detail} onChangeText={setDetail} maxLength={2000} multiline placeholder="Detalle opcional"/>
    {category==='health'&&mode==='event'?<Text style={s.private}>Los eventos de salud se guardan como privados por defecto.</Text>:null}
    <Pressable disabled={busy||!selected} onPress={save} style={[s.button,(busy||!selected)&&s.disabled]}><Text style={s.buttonText}>{busy?'Guardando…':'Guardar en After'}</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F7F5'},body:{padding:24,gap:12},kicker:{fontSize:12,fontWeight:'800',letterSpacing:1.3,color:'#777'},title:{fontSize:32,lineHeight:38,fontWeight:'800'},copy:{fontSize:15,lineHeight:22,color:'#5C626D',marginBottom:8},segment:{flexDirection:'row',backgroundColor:'#E9EAE7',padding:4,borderRadius:14},segmentButton:{flex:1,padding:11,alignItems:'center',borderRadius:11},segmentActive:{backgroundColor:'#FFF'},segmentText:{fontWeight:'700',color:'#6D737C'},segmentTextActive:{color:'#111318'},label:{fontSize:13,fontWeight:'800',marginTop:6},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{paddingVertical:9,paddingHorizontal:12,borderRadius:999,borderWidth:1,borderColor:'#D9DBD7',backgroundColor:'#FFF'},chipActive:{backgroundColor:'#111318',borderColor:'#111318'},chipText:{fontSize:13,fontWeight:'700',color:'#4F5660'},chipTextActive:{color:'#FFF'},input:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E0E3DF',borderRadius:15,padding:15,fontSize:16},row:{flexDirection:'row',gap:10},flex:{flex:1},time:{width:105},notes:{minHeight:92,textAlignVertical:'top'},private:{fontSize:12,lineHeight:18,color:'#6E5560'},button:{backgroundColor:'#111318',borderRadius:16,padding:17,alignItems:'center',marginTop:4},buttonText:{color:'#FFF',fontSize:16,fontWeight:'800'},disabled:{opacity:.45}});