import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Target={id:string;student_id:string;student_name:string;title:string;type:string;subject?:string|null;due_at?:string|null;priority:string;has_study_plan:boolean};
type Plan={id:string;student_id:string;student_name:string;title:string;objective?:string|null;status:string;scheduled_start?:string|null;planned_minutes?:number|null;completed_at?:string|null};

const typeLabel:Record<string,string>={task:'Tarea',test:'Prueba',exam:'Examen',project:'Proyecto'};
function localIso(date:string,time:string){const d=new Date(`${date}T${time}:00`);return Number.isNaN(d.getTime())?null:d.toISOString();}

export default function Study(){
  const [targets,setTargets]=useState<Target[]>([]);
  const [plans,setPlans]=useState<Plan[]>([]);
  const [targetId,setTargetId]=useState('');
  const [objective,setObjective]=useState('');
  const [date,setDate]=useState('');
  const [time,setTime]=useState('17:00');
  const [minutes,setMinutes]=useState('20');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);setError(false);
    const [{data:targetData,error:targetError},{data:planData,error:planError}]=await Promise.all([
      supabase.rpc('after_study_targets',{p_days:30}),
      supabase.rpc('after_study_plans'),
    ]);
    if(targetError||planError){setError(true);setLoading(false);return;}
    const nextTargets=(targetData??[]) as Target[];
    setTargets(nextTargets);setPlans((planData??[]) as Plan[]);
    setTargetId(current=>current&&nextTargets.some(x=>x.id===current)?current:(nextTargets[0]?.id??''));
    setLoading(false);
  },[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));

  const target=useMemo(()=>targets.find(x=>x.id===targetId)??null,[targets,targetId]);

  async function createPlan(){
    if(!target)return Alert.alert('Elige qué preparar','Selecciona una tarea, prueba o proyecto.');
    const n=Number(minutes);const when=localIso(date,time);
    if(!when||!Number.isInteger(n)||n<5||n>120)return Alert.alert('Revisa el bloque','Usa una fecha válida, hora HH:MM y una duración entre 5 y 120 minutos.');
    setBusy(true);
    const {error:rpcError}=await supabase.rpc('after_create_study_plan',{
      p_student_id:target.student_id,
      p_academic_item_id:target.id,
      p_title:`Preparar: ${target.title}`,
      p_objective:objective.trim()||null,
      p_scheduled_start:when,
      p_planned_minutes:n,
    });
    setBusy(false);
    if(rpcError)return Alert.alert('No pudimos reservar ese tiempo','Revisa tu conexión y vuelve a intentar.');
    setObjective('');setDate('');setMinutes('20');await load();
  }

  async function complete(planId:string){
    if(busy)return;setBusy(true);
    const {data,error:rpcError}=await supabase.rpc('after_complete_study_session',{p_plan_id:planId});
    setBusy(false);
    if(rpcError||data!==true)return Alert.alert('No pudimos marcarlo','La sesión puede estar completa o no corresponder a tu familia.');
    await load();
  }

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>} keyboardShouldPersistTaps="handled">
    <View style={s.top}><Pressable onPress={()=>router.back()}><Text style={s.back}>‹ Volver</Text></Pressable><Text style={s.kicker}>PREPARAR</Text></View>
    <Text style={s.title}>Estudiar antes, no la noche anterior.</Text><Text style={s.copy}>Elige una prueba o tarea real y reserva un bloque corto. After mantiene el estudio conectado con lo que viene en el colegio.</Text>

    {error?<View style={s.state}><Text style={s.stateTitle}>No pudimos cargar el estudio.</Text><Pressable onPress={()=>void load()} style={s.primary}><Text style={s.primaryText}>Reintentar</Text></Pressable></View>:<>
      <View style={s.section}><Text style={s.heading}>¿Qué hay que preparar?</Text>{targets.length?targets.map(item=><Pressable key={item.id} onPress={()=>setTargetId(item.id)} style={[s.target,targetId===item.id&&s.targetActive]}><View style={s.flex}><Text style={[s.type,targetId===item.id&&s.typeActive]}>{typeLabel[item.type]??item.type}{item.subject?` · ${item.subject}`:''}</Text><Text style={[s.targetTitle,targetId===item.id&&s.targetTitleActive]}>{item.title}</Text><Text style={[s.meta,targetId===item.id&&s.metaActive]}>{item.due_at?`Para ${new Date(item.due_at).toLocaleString('es-CL',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:'Sin fecha'}{item.has_study_plan?' · ya tiene preparación':''}</Text></View></Pressable>):<View style={s.state}><Text style={s.stateTitle}>No hay tareas o pruebas por preparar.</Text><Text style={s.muted}>Cuando agregues algo del colegio aparecerá aquí.</Text><Pressable onPress={()=>router.push('/(app)/agregar')} style={s.primary}><Text style={s.primaryText}>Agregar del colegio</Text></Pressable></View>}</View>

      {target?<View style={s.planBox}><Text style={s.heading}>Reserva un momento</Text><Text style={s.planFor}>{target.student_name} · {target.title}</Text><View style={s.row}><TextInput style={[s.input,s.flex]} value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation"/><TextInput style={[s.input,s.time]} value={time} onChangeText={setTime} placeholder="HH:MM" keyboardType="numbers-and-punctuation"/></View><View style={s.minutes}><Text style={s.label}>Duración</Text>{['10','20','30','45'].map(value=><Pressable key={value} onPress={()=>setMinutes(value)} style={[s.minute,minutes===value&&s.minuteActive]}><Text style={[s.minuteText,minutes===value&&s.minuteTextActive]}>{value} min</Text></Pressable>)}</View><TextInput style={[s.input,s.notes]} value={objective} onChangeText={setObjective} maxLength={1000} multiline placeholder="Ej. Repasar fracciones y anotar dudas (opcional)"/><Pressable disabled={busy} onPress={()=>void createPlan()} style={[s.button,busy&&s.disabled]}><Text style={s.buttonText}>{busy?'Guardando…':'Reservar tiempo de estudio'}</Text></Pressable></View>:null}

      <View style={s.section}><Text style={s.heading}>Próximos bloques</Text>{plans.length?plans.map(plan=><View key={plan.id} style={s.session}><View style={s.flex}><Text style={s.sessionTitle}>{plan.title}</Text><Text style={s.meta}>{plan.student_name} · {plan.planned_minutes??0} min</Text><Text style={s.meta}>{plan.scheduled_start?new Date(plan.scheduled_start).toLocaleString('es-CL',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Sin horario'}</Text>{plan.objective?<Text style={s.objective}>{plan.objective}</Text>:null}</View><Pressable disabled={busy} onPress={()=>void complete(plan.id)} style={s.complete}><Text style={s.completeText}>Listo</Text></Pressable></View>):<Text style={s.muted}>Todavía no hay bloques de estudio reservados.</Text>}</View>
    </>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F7F5'},body:{padding:22,paddingBottom:48,gap:18},top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},back:{fontSize:14,fontWeight:'800',color:'#405544'},kicker:{fontSize:11,fontWeight:'900',letterSpacing:1.3,color:'#777'},title:{fontSize:32,lineHeight:37,fontWeight:'900',letterSpacing:-.8,color:'#171A18'},copy:{fontSize:15,lineHeight:22,color:'#5C635D'},section:{gap:8},heading:{fontSize:19,fontWeight:'900',color:'#1B1F1B'},target:{borderWidth:1,borderColor:'#DDE1DC',borderRadius:15,padding:14,backgroundColor:'#FFF'},targetActive:{backgroundColor:'#1B1F1C',borderColor:'#1B1F1C'},type:{fontSize:10.5,fontWeight:'900',letterSpacing:.4,textTransform:'uppercase',color:'#6C756E'},typeActive:{color:'#ABB4AC'},targetTitle:{fontSize:15,fontWeight:'800',color:'#1D211D',marginTop:4},targetTitleActive:{color:'#FFF'},meta:{fontSize:11.5,lineHeight:17,color:'#747B75',marginTop:3},metaActive:{color:'#C5CBC5'},planBox:{backgroundColor:'#EEF1EB',borderRadius:20,padding:16,gap:11},planFor:{fontSize:13,lineHeight:19,color:'#58615A'},row:{flexDirection:'row',gap:9},input:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#D8DDD7',borderRadius:13,padding:13,fontSize:15,color:'#171A18'},flex:{flex:1},time:{width:104},minutes:{flexDirection:'row',flexWrap:'wrap',gap:7,alignItems:'center'},label:{fontSize:12,fontWeight:'800',color:'#606862',marginRight:2},minute:{borderWidth:1,borderColor:'#CAD0C9',borderRadius:999,paddingVertical:7,paddingHorizontal:10,backgroundColor:'#FFF'},minuteActive:{backgroundColor:'#354A39',borderColor:'#354A39'},minuteText:{fontSize:12,fontWeight:'800',color:'#555D56'},minuteTextActive:{color:'#FFF'},notes:{minHeight:78,textAlignVertical:'top'},button:{backgroundColor:'#171A18',borderRadius:14,padding:15,alignItems:'center'},buttonText:{fontSize:14,fontWeight:'900',color:'#FFF'},disabled:{opacity:.5},session:{flexDirection:'row',alignItems:'center',gap:11,paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#E4E7E2'},sessionTitle:{fontSize:15,fontWeight:'800',color:'#1C201C'},objective:{fontSize:12.5,lineHeight:18,color:'#565E57',marginTop:5},complete:{borderWidth:1,borderColor:'#CCD2CB',borderRadius:11,paddingVertical:8,paddingHorizontal:10},completeText:{fontSize:11,fontWeight:'900',color:'#38413A'},muted:{fontSize:13,lineHeight:19,color:'#6E756F'},state:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E0E3DE',borderRadius:18,padding:17,gap:9},stateTitle:{fontSize:17,fontWeight:'900',color:'#1B1F1B'},primary:{alignSelf:'flex-start',backgroundColor:'#171A18',borderRadius:11,paddingVertical:9,paddingHorizontal:13},primaryText:{fontSize:12,fontWeight:'900',color:'#FFF'}});
