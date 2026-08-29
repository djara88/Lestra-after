import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '@/lib/supabase';

type Student={id:string;first_name:string;preferred_name?:string|null};
type Context={students?:Student[]};
type Plan={id:string;student_id:string;student_name:string;title:string;objective?:string|null;status:string;scheduled_start?:string|null;planned_minutes?:number|null;completed_at?:string|null};

function localIso(date:string,time:string){const d=new Date(`${date}T${time}:00`);return Number.isNaN(d.getTime())?null:d.toISOString();}

export default function Study(){
  const [students,setStudents]=useState<Student[]>([]); const [plans,setPlans]=useState<Plan[]>([]); const [busy,setBusy]=useState(false);
  const [studentId,setStudentId]=useState(''); const [title,setTitle]=useState(''); const [objective,setObjective]=useState(''); const [date,setDate]=useState(''); const [time,setTime]=useState('17:00'); const [minutes,setMinutes]=useState('30');
  const selected=useMemo(()=>students.find(s=>s.id===studentId),[students,studentId]);

  async function load(){
    const [{data:ctx},{data:planData,error:planError}]=await Promise.all([supabase.rpc('after_my_context'),supabase.rpc('after_study_plans')]);
    const list=((ctx??{}) as Context).students??[]; setStudents(list); if(!studentId&&list[0])setStudentId(list[0].id);
    if(!planError)setPlans((planData??[]) as Plan[]);
  }
  useEffect(()=>{void load();},[]);

  async function createPlan(){
    const n=Number(minutes); const when=localIso(date,time);
    if(!studentId||title.trim().length<2||title.trim().length>180||!when||!Number.isInteger(n)||n<5||n>240){
      return Alert.alert('Revisa los datos','Selecciona alumno, escribe un título, usa fecha AAAA-MM-DD, hora HH:MM y una duración entre 5 y 240 minutos.');
    }
    setBusy(true);
    const {error}=await supabase.rpc('after_create_study_plan',{p_student_id:studentId,p_academic_item_id:null,p_title:title.trim(),p_objective:objective.trim()||null,p_scheduled_start:when,p_planned_minutes:n});
    setBusy(false);
    if(error)return Alert.alert('No pudimos crear el plan','Revisa tu sesión y vuelve a intentar.');
    setTitle('');setObjective('');setDate('');setMinutes('30');await load();
  }

  async function complete(planId:string){
    setBusy(true); const {data,error}=await supabase.rpc('after_complete_study_session',{p_plan_id:planId}); setBusy(false);
    if(error||data!==true)return Alert.alert('No pudimos completar la sesión','La sesión puede haber sido completada previamente o no corresponder a tu familia.');
    await load();
  }

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
    <Text style={s.kicker}>ESTUDIO</Text><Text style={s.title}>Planifica sin sobrecargar</Text><Text style={s.copy}>Crea sesiones breves y concretas alrededor de la agenda real del alumno. En esta primera versión las decisiones son manuales; la IA se agregará después como apoyo, no como autoridad.</Text>

    <View style={s.card}><Text style={s.heading}>Nueva sesión</Text><Text style={s.label}>Alumno</Text><View style={s.chips}>{students.map(st=><Pressable key={st.id} onPress={()=>setStudentId(st.id)} style={[s.chip,studentId===st.id&&s.active]}><Text style={[s.chipText,studentId===st.id&&s.activeText]}>{st.preferred_name||st.first_name}</Text></Pressable>)}</View>
      <TextInput style={s.input} value={title} onChangeText={setTitle} maxLength={180} placeholder="Ej. Repasar Ciencias: sistema solar"/>
      <TextInput style={[s.input,s.notes]} value={objective} onChangeText={setObjective} maxLength={1000} multiline placeholder="Objetivo opcional"/>
      <View style={s.row}><TextInput style={[s.input,s.flex]} value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation"/><TextInput style={[s.input,s.time]} value={time} onChangeText={setTime} placeholder="HH:MM" keyboardType="numbers-and-punctuation"/></View>
      <TextInput style={s.input} value={minutes} onChangeText={setMinutes} placeholder="Minutos" keyboardType="number-pad"/>
      <Pressable disabled={busy||!selected} onPress={createPlan} style={[s.button,(busy||!selected)&&s.disabled]}><Text style={s.buttonText}>{busy?'Guardando…':'Crear sesión de estudio'}</Text></Pressable>
    </View>

    <View style={s.card}><Text style={s.heading}>Próximas sesiones</Text>{plans.length===0?<Text style={s.muted}>Todavía no hay sesiones activas.</Text>:plans.map(p=><View key={p.id} style={s.plan}><View style={{flex:1}}><Text style={s.planTitle}>{p.title}</Text><Text style={s.meta}>{p.student_name} · {p.planned_minutes??0} min</Text><Text style={s.meta}>{p.scheduled_start?new Date(p.scheduled_start).toLocaleString('es-CL'):'Sin horario'}</Text>{p.objective?<Text style={s.objective}>{p.objective}</Text>:null}</View><Pressable disabled={busy} onPress={()=>complete(p.id)} style={s.complete}><Text style={s.completeText}>Completar</Text></Pressable></View>)}</View>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F7F5'},body:{padding:24,gap:18},kicker:{fontSize:12,fontWeight:'800',letterSpacing:1.3,color:'#777'},title:{fontSize:32,lineHeight:38,fontWeight:'800'},copy:{fontSize:15,lineHeight:22,color:'#5C626D'},card:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E5E5E0',borderRadius:18,padding:16,gap:12},heading:{fontSize:18,fontWeight:'800'},label:{fontSize:12,fontWeight:'800',color:'#5C626D'},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{paddingVertical:8,paddingHorizontal:11,borderWidth:1,borderColor:'#D9DBD7',borderRadius:999},active:{backgroundColor:'#111318',borderColor:'#111318'},chipText:{fontSize:13,fontWeight:'700'},activeText:{color:'#FFF'},input:{borderWidth:1,borderColor:'#DADDD8',borderRadius:14,padding:14,fontSize:16},notes:{minHeight:82,textAlignVertical:'top'},row:{flexDirection:'row',gap:10},flex:{flex:1},time:{width:105},button:{backgroundColor:'#111318',borderRadius:14,padding:15,alignItems:'center'},buttonText:{color:'#FFF',fontWeight:'800'},disabled:{opacity:.5},plan:{flexDirection:'row',gap:12,alignItems:'center',paddingVertical:12,borderTopWidth:1,borderTopColor:'#EEEFEA'},planTitle:{fontSize:15,fontWeight:'800'},meta:{fontSize:12,color:'#6D737C',marginTop:3},objective:{fontSize:13,lineHeight:18,color:'#525861',marginTop:6},complete:{borderWidth:1,borderColor:'#C8CCC6',borderRadius:12,paddingVertical:9,paddingHorizontal:11},completeText:{fontSize:12,fontWeight:'800'},muted:{color:'#777'}});
