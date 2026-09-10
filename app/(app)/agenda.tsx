import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

type AgendaItem={kind:'event'|'academic';id:string;student_id?:string|null;title:string;category:string;starts_at?:string|null;status?:string;priority?:string;location?:string|null;sensitivity?:string};
type Context={students?:Array<{id:string;first_name:string;preferred_name?:string|null}>};

const labels:Record<string,string>={task:'Tarea',test:'Prueba',exam:'Examen',project:'Proyecto',material:'Material',school_event:'Colegio',school:'Colegio',study:'Estudio',sport:'Deporte',health:'Salud',social:'Actividad',family:'Familia',other:'Otro'};

function keyFor(item:AgendaItem){if(!item.starts_at)return 'Sin fecha';return new Date(item.starts_at).toISOString().slice(0,10);}
function dateTitle(key:string){if(key==='Sin fecha')return key;const d=new Date(`${key}T12:00:00`);const today=new Date();const tomorrow=new Date();tomorrow.setDate(today.getDate()+1);if(key===today.toISOString().slice(0,10))return 'Hoy';if(key===tomorrow.toISOString().slice(0,10))return 'Mañana';return d.toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'});}

export default function Week(){
  const [items,setItems]=useState<AgendaItem[]>([]);
  const [context,setContext]=useState<Context>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [busyId,setBusyId]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);setError(false);
    const [{data:agenda,error:agendaError},{data:ctx,error:ctxError}]=await Promise.all([supabase.rpc('after_agenda',{p_days:8}),supabase.rpc('after_my_context')]);
    if(agendaError||ctxError){setError(true);setLoading(false);return;}
    setItems((agenda??[]) as AgendaItem[]);setContext((ctx??{}) as Context);setLoading(false);
  },[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));

  const grouped=useMemo(()=>items.reduce<Record<string,AgendaItem[]>>((acc,item)=>{const key=keyFor(item);(acc[key]??=[]).push(item);return acc;},{}),[items]);
  const studentName=(id?:string|null)=>{const st=context.students?.find(x=>x.id===id);return st?.preferred_name||st?.first_name||'Familia';};

  async function complete(item:AgendaItem){
    if(item.kind!=='academic'||busyId)return;
    setBusyId(item.id);
    const {error:rpcError}=await supabase.rpc('after_update_academic_status',{p_item_id:item.id,p_status:'done'});
    setBusyId(null);
    if(!rpcError)await load();
  }

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>}>
    <Text style={s.kicker}>LO QUE VIENE</Text><Text style={s.title}>Semana</Text><Text style={s.copy}>Una sola línea temporal para colegio, estudio y actividades. Lo importante primero; sin calendario empresarial.</Text>
    {loading&&!items.length?<View style={s.loading}><ActivityIndicator/><Text style={s.muted}>Preparando la semana…</Text></View>:error?<View style={s.empty}><Text style={s.emptyTitle}>No pudimos cargar la semana.</Text><Text style={s.muted}>Vuelve a intentar cuando tengas conexión.</Text><Pressable onPress={()=>void load()} style={s.retry}><Text style={s.retryText}>Reintentar</Text></Pressable></View>:items.length?Object.entries(grouped).map(([day,dayItems])=><View key={day} style={s.dayBlock}><Text style={s.day}>{dateTitle(day)}</Text><View style={s.rail}>{dayItems.map(item=><View key={`${item.kind}-${item.id}`} style={s.row}><View style={s.dot}/><View style={s.timeCol}><Text style={s.time}>{item.starts_at?new Date(item.starts_at).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}):'—'}</Text></View><View style={s.flex}><View style={s.topline}><Text style={s.type}>{labels[item.category]??item.category}</Text>{item.sensitivity==='private'?<Text style={s.private}>Privado</Text>:null}</View><Text style={s.itemTitle}>{item.title}</Text><Text style={s.meta}>{studentName(item.student_id)}{item.location?` · ${item.location}`:''}{item.priority&&item.priority!=='normal'?` · prioridad ${item.priority}`:''}</Text></View>{item.kind==='academic'?<Pressable disabled={busyId===item.id} onPress={()=>void complete(item)} style={s.done}><Text style={s.doneText}>{busyId===item.id?'…':'Listo'}</Text></Pressable>:null}</View>)}</View></View>):<View style={s.empty}><Text style={s.emptyTitle}>La semana está despejada</Text><Text style={s.muted}>Cuando agregues tareas, pruebas o actividades aparecerán aquí en orden.</Text></View>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F7F5'},body:{padding:22,paddingBottom:48},kicker:{fontSize:11,fontWeight:'900',letterSpacing:1.3,color:'#747A74'},title:{fontSize:37,lineHeight:42,fontWeight:'900',letterSpacing:-1.2,color:'#171A18',marginTop:4},copy:{fontSize:15,lineHeight:22,color:'#5D645E',marginTop:7,marginBottom:12},loading:{paddingVertical:40,alignItems:'center',gap:12},muted:{fontSize:13,lineHeight:19,color:'#6E756F'},dayBlock:{marginTop:20},day:{fontSize:18,fontWeight:'900',textTransform:'capitalize',color:'#1D211D',marginBottom:5},rail:{borderLeftWidth:1,borderLeftColor:'#D7DBD5',marginLeft:6,paddingLeft:15},row:{position:'relative',flexDirection:'row',alignItems:'center',gap:10,paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#E6E8E4'},dot:{position:'absolute',left:-20.5,width:10,height:10,borderRadius:5,backgroundColor:'#647067',borderWidth:2,borderColor:'#F7F7F5'},timeCol:{width:44},time:{fontSize:12,fontWeight:'800',color:'#6E756F'},flex:{flex:1},topline:{flexDirection:'row',gap:7,alignItems:'center'},type:{fontSize:10.5,fontWeight:'900',letterSpacing:.4,textTransform:'uppercase',color:'#6C756E'},private:{fontSize:10,fontWeight:'800',color:'#7B5864'},itemTitle:{fontSize:15,fontWeight:'800',color:'#1C201C',marginTop:3},meta:{fontSize:11.5,lineHeight:17,color:'#747B75',marginTop:3},done:{borderWidth:1,borderColor:'#CDD2CC',borderRadius:10,paddingVertical:8,paddingHorizontal:9},doneText:{fontSize:11,fontWeight:'900',color:'#39423A'},empty:{marginTop:28,backgroundColor:'#FFF',borderWidth:1,borderColor:'#E1E4DE',borderRadius:18,padding:18,gap:8},emptyTitle:{fontSize:18,fontWeight:'900',color:'#1A1E1A'},retry:{alignSelf:'flex-start',backgroundColor:'#171A18',borderRadius:11,paddingHorizontal:13,paddingVertical:9},retryText:{color:'#FFF',fontWeight:'900',fontSize:12}});
