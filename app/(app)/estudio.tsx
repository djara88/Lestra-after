import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ScheduleField } from '@/components/ScheduleField';
import { completeStudySession, getStudyFlow, planStudyForAcademicItem, rescheduleStudySession, type StudyPlan, type StudyTarget } from '@/lib/study';

const typeLabel: Record<string,string> = { task:'Tarea', test:'Prueba', exam:'Examen', project:'Proyecto' };
const minuteOptions = [10,20,30,45,60];

function defaultWhen(){const d=new Date();d.setDate(d.getDate()+1);d.setHours(17,0,0,0);return d;}
function firstParam(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value;}

export default function Study(){
  const params=useLocalSearchParams<{itemId?:string|string[]}>();
  const requestedItemId=firstParam(params.itemId);
  const requestedRef=useRef(requestedItemId);
  requestedRef.current=requestedItemId;

  const [targets,setTargets]=useState<StudyTarget[]>([]);
  const [plans,setPlans]=useState<StudyPlan[]>([]);
  const [targetId,setTargetId]=useState('');
  const [editingSessionId,setEditingSessionId]=useState<string|null>(null);
  const [objective,setObjective]=useState('');
  const [when,setWhen]=useState(defaultWhen);
  const [minutes,setMinutes]=useState(20);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);

  const load=useCallback(async(mode:'initial'|'refresh'='initial')=>{
    if(mode==='refresh')setRefreshing(true);else setLoading(true);
    setError(false);
    try{
      const next=await getStudyFlow(30);
      setTargets(next.targets);setPlans(next.plans);
      setTargetId(current=>{
        const requested=requestedRef.current;
        if(requested&&next.targets.some(item=>item.id===requested))return requested;
        if(current&&next.targets.some(item=>item.id===current))return current;
        return next.targets[0]?.id??'';
      });
    }catch{
      setError(true);
    }finally{
      setLoading(false);setRefreshing(false);
    }
  },[]);

  useFocusEffect(useCallback(()=>{void load();},[load]));
  const target=useMemo(()=>targets.find(item=>item.id===targetId)??null,[targets,targetId]);

  useEffect(()=>{
    if(editingSessionId||!target)return;
    const suggested=Number(target.estimated_minutes??0);
    if(Number.isInteger(suggested)&&suggested>=5&&suggested<=120)setMinutes(suggested);
  },[target?.id,editingSessionId]);

  function selectTarget(id:string){
    setTargetId(id);setEditingSessionId(null);setObjective('');setWhen(defaultWhen());
  }

  async function savePlan(){
    if(!target)return Alert.alert('Elige qué preparar','Selecciona una tarea, prueba o proyecto.');
    if(!Number.isInteger(minutes)||minutes<5||minutes>120)return Alert.alert('Revisa la duración','Elige un bloque entre 5 y 120 minutos.');
    setBusy(true);
    try{
      if(editingSessionId){
        await rescheduleStudySession(editingSessionId,when,minutes,objective);
        Alert.alert('Reprogramado','El nuevo momento ya aparece en el flujo del día.');
      }else{
        await planStudyForAcademicItem(target.id,when,minutes,objective);
        Alert.alert(target.has_study_plan?'Preparación actualizada':'Preparación creada','After la mostrará junto con el resto de actividades.');
      }
      setEditingSessionId(null);setObjective('');setWhen(defaultWhen());await load('refresh');
    }catch(err){
      Alert.alert('No pudimos guardar',err instanceof Error?err.message:'Revisa tu conexión y vuelve a intentar.');
    }finally{setBusy(false);}
  }

  function editPlan(plan:StudyPlan){
    if(plan.academic_item_id&&targets.some(item=>item.id===plan.academic_item_id))setTargetId(plan.academic_item_id);
    setEditingSessionId(plan.session_id);
    setObjective(plan.objective??'');
    const start=plan.scheduled_start?new Date(plan.scheduled_start):defaultWhen();
    setWhen(Number.isNaN(start.getTime())?defaultWhen():start);
    setMinutes(Number(plan.planned_minutes??20));
  }

  async function complete(plan:StudyPlan){
    if(busy)return;
    setBusy(true);
    try{
      await completeStudySession(plan.session_id);
      if(editingSessionId===plan.session_id)setEditingSessionId(null);
      await load('refresh');
    }catch(err){
      Alert.alert('No pudimos marcarlo',err instanceof Error?err.message:'Vuelve a intentar.');
    }finally{setBusy(false);}
  }

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load('refresh')}/>} keyboardShouldPersistTaps="handled">
    <View style={s.top}><Pressable accessibilityRole="button" onPress={()=>router.back()} style={s.backButton}><Text style={s.back}>‹ Volver</Text></Pressable><View style={s.badge}><Text style={s.badgeText}>🌱 Preparar</Text></View></View>
    <Text style={s.title}>De “tengo prueba” a “sé cuándo prepararme”.</Text><Text style={s.copy}>Elige una obligación del colegio y reserva un bloque real. After conserva el vínculo para que estudio y agenda hablen entre sí.</Text>

    {loading&&!targets.length&&!plans.length?<View style={s.loading}><ActivityIndicator color="#F58B57"/><Text style={s.muted}>Buscando qué conviene preparar…</Text></View>:error?<View style={s.state}><Text style={s.stateTitle}>No pudimos cargar el estudio.</Text><Text style={s.muted}>No lo mostraremos como vacío. Revisa la conexión y vuelve a intentar.</Text><Pressable onPress={()=>void load()} style={s.primary}><Text style={s.primaryText}>Reintentar</Text></Pressable></View>:<>
      <View style={s.section}><Text style={s.heading}>¿Qué vamos a preparar?</Text>{targets.length?targets.map(item=><Pressable accessibilityRole="button" accessibilityState={{selected:targetId===item.id}} key={item.id} onPress={()=>selectTarget(item.id)} style={[s.target,targetId===item.id&&s.targetActive]}><View style={s.flex}><View style={s.targetTop}><Text style={[s.type,targetId===item.id&&s.typeActive]}>{typeLabel[item.type]??item.type}{item.subject?` · ${item.subject}`:''}</Text>{item.has_study_plan?<Text style={[s.plannedBadge,targetId===item.id&&s.plannedBadgeActive]}>Con preparación</Text>:null}</View><Text style={[s.targetTitle,targetId===item.id&&s.targetTitleActive]}>{item.title}</Text><Text style={[s.meta,targetId===item.id&&s.metaActive]}>{item.due_at?`Para ${new Date(item.due_at).toLocaleString('es-CL',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:'Sin fecha'}{item.estimated_minutes?` · estimado ${item.estimated_minutes} min`:''}</Text></View></Pressable>):<View style={s.state}><Text style={s.stateTitle}>Todavía no hay nada que preparar.</Text><Text style={s.muted}>Cuando agregues una tarea o prueba aparecerá aquí.</Text><Pressable onPress={()=>router.push('/(app)/composer')} style={s.primary}><Text style={s.primaryText}>Agregar tarea o prueba</Text></Pressable></View>}</View>

      {target?<View style={s.planBox}><View style={s.planHead}><View style={s.flex}><Text style={s.heading}>{editingSessionId?'Reprogramar estudio':'Reservar un momento'}</Text><Text style={s.planFor}>{target.student_name} · {target.title}</Text></View>{editingSessionId?<Pressable onPress={()=>{setEditingSessionId(null);setObjective('');setWhen(defaultWhen());}} style={s.cancelEdit}><Text style={s.cancelEditText}>Cancelar edición</Text></Pressable>:null}</View><ScheduleField value={when} onChange={setWhen}/><View style={s.minutes}><Text style={s.label}>Duración</Text>{minuteOptions.map(value=><Pressable accessibilityRole="button" accessibilityState={{selected:minutes===value}} key={value} onPress={()=>setMinutes(value)} style={[s.minute,minutes===value&&s.minuteActive]}><Text style={[s.minuteText,minutes===value&&s.minuteTextActive]}>{value} min</Text></Pressable>)}</View><TextInput style={[s.input,s.notes]} value={objective} onChangeText={setObjective} maxLength={1000} multiline placeholder="Ej. Repasar fracciones y anotar dudas" placeholderTextColor="#A59586"/><Pressable disabled={busy} onPress={()=>void savePlan()} style={[s.button,busy&&s.disabled]}><Text style={s.buttonText}>{busy?'Guardando…':editingSessionId?'Guardar nuevo horario':target.has_study_plan?'Actualizar preparación':'Crear preparación'}</Text></Pressable></View>:null}

      <View style={s.section}><Text style={s.heading}>Próximos momentos</Text>{plans.length?plans.map(plan=><View key={plan.session_id} style={s.session}><View style={s.flex}><Text style={s.sessionTitle}>{plan.title}</Text><Text style={s.meta}>{plan.student_name} · {plan.planned_minutes??0} min</Text><Text style={s.meta}>{plan.scheduled_start?new Date(plan.scheduled_start).toLocaleString('es-CL',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Sin horario'}</Text>{plan.objective?<Text style={s.objective}>{plan.objective}</Text>:null}<View style={s.sessionActions}><Pressable disabled={busy} onPress={()=>editPlan(plan)} style={s.reprogram}><Text style={s.reprogramText}>Reprogramar</Text></Pressable><Pressable disabled={busy} onPress={()=>void complete(plan)} style={s.complete}><Text style={s.completeText}>✓ Listo</Text></Pressable></View></View></View>):<Text style={s.muted}>Todavía no hay bloques de estudio reservados.</Text>}</View>
    </>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#FFF8F1'},body:{paddingHorizontal:18,paddingTop:18,paddingBottom:64,gap:18},top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},backButton:{minHeight:44,justifyContent:'center',paddingRight:12},back:{fontSize:14,fontWeight:'800',color:'#7A5F46'},badge:{backgroundColor:'#EAF4E5',paddingHorizontal:12,paddingVertical:7,borderRadius:999},badgeText:{fontSize:12,fontWeight:'900',color:'#50704D'},title:{fontSize:30,lineHeight:35,fontWeight:'900',letterSpacing:-.8,color:'#2B2926'},copy:{fontSize:15,lineHeight:22,color:'#6F655B'},loading:{paddingVertical:34,alignItems:'center',gap:12},section:{gap:8},heading:{fontSize:19,fontWeight:'900',color:'#302D29'},target:{borderWidth:1,borderColor:'#E8DDD1',borderRadius:18,padding:14,backgroundColor:'#FFFDF9'},targetActive:{backgroundColor:'#6F8F68',borderColor:'#6F8F68'},targetTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},type:{fontSize:10.5,fontWeight:'900',letterSpacing:.4,textTransform:'uppercase',color:'#8B7B6C'},typeActive:{color:'#E9F1E5'},plannedBadge:{fontSize:9.5,fontWeight:'900',color:'#567050',backgroundColor:'#EAF4E5',paddingHorizontal:7,paddingVertical:3,borderRadius:999,overflow:'hidden'},plannedBadgeActive:{color:'#3E573D',backgroundColor:'#F3F8F0'},targetTitle:{fontSize:15,fontWeight:'800',color:'#2B2926',marginTop:4},targetTitleActive:{color:'#FFF'},meta:{fontSize:11.5,lineHeight:17,color:'#8A7E72',marginTop:3},metaActive:{color:'#EDF3EA'},planBox:{backgroundColor:'#FFF0E4',borderRadius:22,padding:16,gap:12},planHead:{flexDirection:'row',alignItems:'flex-start',gap:10},planFor:{fontSize:13,lineHeight:19,color:'#795F48',marginTop:3},cancelEdit:{minHeight:40,justifyContent:'center'},cancelEditText:{fontSize:11,fontWeight:'900',color:'#A45B39'},minutes:{flexDirection:'row',flexWrap:'wrap',gap:7,alignItems:'center'},label:{fontSize:12,fontWeight:'800',color:'#765F4A',marginRight:2},minute:{minHeight:40,justifyContent:'center',borderWidth:1,borderColor:'#E3CDBA',borderRadius:999,paddingHorizontal:10,backgroundColor:'#FFFDF9'},minuteActive:{backgroundColor:'#F58B57',borderColor:'#F58B57'},minuteText:{fontSize:12,fontWeight:'800',color:'#775F49'},minuteTextActive:{color:'#FFF'},input:{backgroundColor:'#FFFDF9',borderWidth:1,borderColor:'#E6D7C8',borderRadius:15,padding:13,fontSize:15,color:'#2B2926'},notes:{minHeight:78,textAlignVertical:'top'},button:{minHeight:50,justifyContent:'center',backgroundColor:'#F58B57',borderRadius:16,paddingHorizontal:15,alignItems:'center'},buttonText:{fontSize:14,fontWeight:'900',color:'#FFF'},disabled:{opacity:.5},session:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#EDE1D7'},sessionTitle:{fontSize:15,fontWeight:'800',color:'#302D29'},objective:{fontSize:12.5,lineHeight:18,color:'#6F655B',marginTop:5},sessionActions:{flexDirection:'row',gap:8,marginTop:9},reprogram:{minHeight:42,justifyContent:'center',borderWidth:1,borderColor:'#D8CDC3',borderRadius:12,paddingHorizontal:11,backgroundColor:'#FFFDF9'},reprogramText:{fontSize:11,fontWeight:'900',color:'#6D6258'},complete:{minHeight:42,justifyContent:'center',backgroundColor:'#EAF4E5',borderRadius:12,paddingHorizontal:11},completeText:{fontSize:11,fontWeight:'900',color:'#50704D'},muted:{fontSize:13,lineHeight:19,color:'#81756A'},state:{backgroundColor:'#FFFDF9',borderWidth:1,borderColor:'#E8DDD1',borderRadius:18,padding:17,gap:9},stateTitle:{fontSize:17,fontWeight:'900',color:'#302D29'},primary:{minHeight:44,justifyContent:'center',alignSelf:'flex-start',backgroundColor:'#6F8F68',borderRadius:12,paddingHorizontal:13},primaryText:{fontSize:12,fontWeight:'900',color:'#FFF'},flex:{flex:1}});