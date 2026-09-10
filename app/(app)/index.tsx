import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Student={id:string;first_name:string;preferred_name?:string|null};
type Context={display_name?:string;students?:Student[]};
type FlowItem={kind:'academic'|'event';id:string;student_id?:string|null;title:string;category:string;starts_at?:string|null;status?:string;priority?:string;subject?:string;location?:string|null};
type Material={id:string;student_id:string;name:string;packed:boolean;task_title:string};
type Overview={overdue:FlowItem[];today:FlowItem[];tomorrow:FlowItem[];week:FlowItem[];tomorrow_materials:Material[]};

const labels:Record<string,string>={task:'Tarea',test:'Prueba',exam:'Examen',project:'Proyecto',material:'Material',school_event:'Colegio',school:'Colegio',study:'Estudio',sport:'Deporte',health:'Salud',social:'Actividad',family:'Familia',other:'Otro'};

function timeLabel(value?:string|null){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});}
function dayLabel(value?:string|null){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('es-CL',{weekday:'short',day:'numeric',month:'short'});}

export default function Today(){
  const [context,setContext]=useState<Context>({});
  const [overview,setOverview]=useState<Overview|null>(null);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState(false);
  const [busyId,setBusyId]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);setLoadError(false);
    const [{data:ctx,error:ctxError},{data:flow,error:flowError}]=await Promise.all([supabase.rpc('after_my_context'),supabase.rpc('after_school_overview')]);
    if(ctxError||flowError){setLoadError(true);setLoading(false);return;}
    setContext((ctx??{}) as Context);setOverview((flow??{overdue:[],today:[],tomorrow:[],week:[],tomorrow_materials:[]}) as Overview);setLoading(false);
  },[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));

  const students=context.students??[];
  const studentName=useCallback((id?:string|null)=>{const student=students.find(x=>x.id===id);return student?.preferred_name||student?.first_name||'Familia';},[students]);
  const nowItem=useMemo(()=>{const current=Date.now();return overview?.today.find(item=>item.starts_at&&new Date(item.starts_at).getTime()>=current)??overview?.today[0]??null;},[overview]);

  async function setDone(item:FlowItem){
    if(item.kind!=='academic'||busyId)return;
    setBusyId(item.id);
    const {error}=await supabase.rpc('after_update_academic_status',{p_item_id:item.id,p_status:'done'});
    setBusyId(null);
    if(!error)await load();
  }

  async function setPacked(material:Material){
    if(busyId)return;
    setBusyId(material.id);
    const {error}=await supabase.rpc('after_set_material_packed',{p_material_id:material.id,p_packed:!material.packed});
    setBusyId(null);
    if(!error)await load();
  }

  function FlowRow({item,compact=false}:{item:FlowItem;compact?:boolean}){
    return <View style={[s.rowItem,compact&&s.rowCompact]}><View style={s.when}><Text style={s.time}>{timeLabel(item.starts_at)||'—'}</Text></View><View style={s.rowContent}><Text style={s.rowTitle}>{item.title}</Text><Text style={s.meta}>{labels[item.category]??item.category}{item.subject?` · ${item.subject}`:''} · {studentName(item.student_id)}</Text></View>{item.kind==='academic'?<Pressable disabled={busyId===item.id} onPress={()=>void setDone(item)} style={s.doneButton}><Text style={s.doneText}>{busyId===item.id?'…':'Listo'}</Text></Pressable>:null}</View>;
  }

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>}>
    <Text style={s.kicker}>{new Date().toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'}).toUpperCase()}</Text>
    <Text style={s.title}>Hoy</Text>
    <Text style={s.copy}>Lo importante del día, lo que viene después y lo que hay que dejar preparado para mañana.</Text>

    {loading&&!overview?<View style={s.loading}><ActivityIndicator/><Text style={s.muted}>Ordenando el día…</Text></View>:loadError?<View style={s.stateBox}><Text style={s.stateTitle}>No pudimos cargar tu día.</Text><Text style={s.muted}>Tu información sigue protegida. Revisa la conexión y vuelve a intentar.</Text><Pressable onPress={()=>void load()} style={s.primary}><Text style={s.primaryText}>Reintentar</Text></Pressable></View>:<>
      <View style={s.nowBlock}><Text style={s.sectionKicker}>AHORA / SIGUIENTE</Text>{nowItem?<><Text style={s.nowTitle}>{nowItem.title}</Text><Text style={s.nowMeta}>{timeLabel(nowItem.starts_at)} · {labels[nowItem.category]??nowItem.category}{nowItem.subject?` · ${nowItem.subject}`:''} · {studentName(nowItem.student_id)}</Text></>:<><Text style={s.nowTitle}>Sin urgencias ahora</Text><Text style={s.nowMeta}>Puedes usar este momento para revisar mañana o agregar algo que envió el colegio.</Text></>}</View>

      {(overview?.overdue?.length??0)>0?<View style={s.section}><View style={s.sectionHead}><Text style={s.sectionTitle}>Necesita atención</Text><Text style={s.warning}>{overview?.overdue.length} atrasada(s)</Text></View>{overview?.overdue.map(item=><FlowRow key={`late-${item.id}`} item={item}/>)}</View>:null}

      <View style={s.section}><View style={s.sectionHead}><Text style={s.sectionTitle}>Hoy</Text><Text style={s.sectionHint}>{overview?.today.length||0} pendiente(s)</Text></View>{overview?.today.length?overview.today.map(item=><FlowRow key={`${item.kind}-${item.id}`} item={item}/>):<View style={s.empty}><Text style={s.emptyTitle}>Hoy está despejado</Text><Text style={s.muted}>Si llegó una circular, foto o PDF del colegio, puedes subirlo y After lo leerá.</Text><Pressable onPress={()=>router.push('/(app)/agregar')} style={s.textAction}><Text style={s.textActionLabel}>Subir documento</Text></Pressable></View>}</View>

      <View style={s.tomorrowBlock}><View style={s.sectionHead}><View><Text style={s.sectionKicker}>PREPARAR</Text><Text style={s.sectionTitle}>Mañana</Text></View><Pressable onPress={()=>router.push('/(app)/agenda')}><Text style={s.textActionLabel}>Ver semana</Text></Pressable></View>{overview?.tomorrow.length?overview.tomorrow.map(item=><FlowRow key={`tomorrow-${item.kind}-${item.id}`} item={item} compact/>):<Text style={s.muted}>No hay entregas, pruebas o actividades registradas para mañana.</Text>}
        <View style={s.bagHead}><Text style={s.bagTitle}>Mochila y materiales</Text><Text style={s.sectionHint}>{overview?.tomorrow_materials.filter(x=>x.packed).length||0}/{overview?.tomorrow_materials.length||0}</Text></View>{overview?.tomorrow_materials.length?overview.tomorrow_materials.map(material=><Pressable key={material.id} disabled={busyId===material.id} onPress={()=>void setPacked(material)} style={s.materialRow}><View style={[s.check,material.packed&&s.checkDone]}><Text style={s.checkText}>{material.packed?'✓':''}</Text></View><View style={s.flex}><Text style={[s.materialName,material.packed&&s.strike]}>{material.name}</Text><Text style={s.meta}>{material.task_title} · {studentName(material.student_id)}</Text></View></Pressable>):<Text style={s.muted}>Todavía no hay materiales asociados a lo de mañana.</Text>}</View>

      {(overview?.week?.length??0)>0?<View style={s.section}><Text style={s.sectionTitle}>Después</Text>{overview?.week.slice(0,5).map(item=><View key={`week-${item.id}`} style={s.weekRow}><Text style={s.weekDate}>{dayLabel(item.starts_at)}</Text><View style={s.flex}><Text style={s.rowTitle}>{item.title}</Text><Text style={s.meta}>{item.subject||labels[item.category]||item.category} · {studentName(item.student_id)}</Text></View></View>)}</View>:null}
    </>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F7F5'},body:{padding:22,paddingBottom:46,gap:18},kicker:{fontSize:11,fontWeight:'900',letterSpacing:1.3,color:'#747A74'},title:{fontSize:38,lineHeight:42,fontWeight:'900',letterSpacing:-1.3,color:'#161916'},copy:{fontSize:15,lineHeight:22,color:'#5C625D',maxWidth:520},loading:{paddingVertical:34,alignItems:'center',gap:12},muted:{fontSize:13,lineHeight:19,color:'#6E756F'},stateBox:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E0E3DE',borderRadius:18,padding:18,gap:10},stateTitle:{fontSize:18,fontWeight:'900',color:'#191C19'},primary:{alignSelf:'flex-start',backgroundColor:'#171A18',borderRadius:12,paddingHorizontal:14,paddingVertical:10},primaryText:{color:'#FFF',fontWeight:'900'},nowBlock:{backgroundColor:'#171A18',borderRadius:22,padding:19,gap:7},sectionKicker:{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:'#878E88'},nowTitle:{fontSize:24,lineHeight:29,fontWeight:'900',color:'#FFF'},nowMeta:{fontSize:13,lineHeight:19,color:'#CBD0CB'},section:{gap:4},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:5},sectionTitle:{fontSize:21,fontWeight:'900',color:'#1A1D1A'},sectionHint:{fontSize:12,fontWeight:'800',color:'#7B817B'},warning:{fontSize:12,fontWeight:'900',color:'#9B4C42'},rowItem:{flexDirection:'row',alignItems:'center',gap:11,paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#E5E7E2'},rowCompact:{paddingVertical:10},when:{width:44},time:{fontSize:12,fontWeight:'800',color:'#6E756F'},rowContent:{flex:1},rowTitle:{fontSize:15,fontWeight:'800',color:'#1B1E1B'},meta:{fontSize:11.5,lineHeight:17,color:'#747B75',marginTop:3},doneButton:{borderWidth:1,borderColor:'#CDD2CC',borderRadius:11,paddingVertical:8,paddingHorizontal:10},doneText:{fontSize:11,fontWeight:'900',color:'#39423A'},empty:{paddingVertical:17,gap:6},emptyTitle:{fontSize:17,fontWeight:'900',color:'#242824'},textAction:{alignSelf:'flex-start',paddingVertical:5},textActionLabel:{fontSize:13,fontWeight:'900',color:'#344B38'},tomorrowBlock:{backgroundColor:'#EEF1EB',borderRadius:22,padding:17,gap:4},bagHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:15,marginBottom:3},bagTitle:{fontSize:16,fontWeight:'900',color:'#202420'},materialRow:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:9},check:{width:24,height:24,borderRadius:8,borderWidth:1.5,borderColor:'#AEB6AD',alignItems:'center',justifyContent:'center',backgroundColor:'#FFF'},checkDone:{backgroundColor:'#354A39',borderColor:'#354A39'},checkText:{color:'#FFF',fontWeight:'900'},flex:{flex:1},materialName:{fontSize:14,fontWeight:'800',color:'#222622'},strike:{textDecorationLine:'line-through',color:'#788078'},weekRow:{flexDirection:'row',gap:12,paddingVertical:11,borderBottomWidth:1,borderBottomColor:'#E5E7E2'},weekDate:{width:72,fontSize:12,fontWeight:'800',textTransform:'capitalize',color:'#667067'}});
