import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

type FlowItem={kind:'academic'|'event';id:string;student_id?:string|null;title:string;category:string;starts_at?:string|null;status?:string;priority?:string;subject?:string};
type Overview={overdue:FlowItem[];today:FlowItem[];tomorrow:FlowItem[];week:FlowItem[]};
type Member={id:string;display_name:string;role:string;is_me:boolean};
type Responsibility={id:string;student_id:string|null;assigned_member_id:string|null;assigned_name:string|null;title:string;status:string};
type Workspace={members?:Member[];responsibilities?:Responsibility[]};

const statusLabel:Record<string,string>={unassigned:'Por asignar',proposed:'Esperando respuesta',accepted:'En curso',declined:'Rechazada',completed:'Lista'};
const academicLabel:Record<string,string>={task:'Tarea',test:'Prueba',exam:'Examen',project:'Proyecto',material:'Material',school_event:'Colegio'};

export default function Pending(){
  const [overview,setOverview]=useState<Overview>({overdue:[],today:[],tomorrow:[],week:[]});
  const [workspace,setWorkspace]=useState<Workspace>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [busyId,setBusyId]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);setError(false);
    const [{data:flow,error:flowError},{data:family,error:familyError}]=await Promise.all([supabase.rpc('after_school_overview'),supabase.rpc('after_family_workspace')]);
    if(flowError||familyError){setError(true);setLoading(false);return;}
    setOverview((flow??{overdue:[],today:[],tomorrow:[],week:[]}) as Overview);setWorkspace((family??{}) as Workspace);setLoading(false);
  },[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));

  const academic=[...overview.overdue,...overview.today,...overview.tomorrow,...overview.week].filter((item,index,array)=>item.kind==='academic'&&array.findIndex(x=>x.id===item.id)===index);
  const me=workspace.members?.find(x=>x.is_me);
  const responsibilities=(workspace.responsibilities??[]).filter(x=>x.status!=='completed');

  async function completeAcademic(id:string){
    if(busyId)return;setBusyId(id);
    const {error:rpcError}=await supabase.rpc('after_update_academic_status',{p_item_id:id,p_status:'done'});
    setBusyId(null);if(!rpcError)await load();
  }

  async function respond(id:string,action:'accepted'|'declined'|'completed'){
    if(busyId)return;setBusyId(id);
    const {error:rpcError}=await supabase.rpc('after_respond_responsibility',{p_responsibility_id:id,p_action:action});
    setBusyId(null);if(!rpcError)await load();
  }

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>}>
    <Text style={s.kicker}>LO QUE FALTA</Text><Text style={s.title}>Pendientes</Text><Text style={s.copy}>Tareas del colegio y responsabilidades familiares que todavía necesitan una acción.</Text>
    {loading&&!academic.length&&!responsibilities.length?<View style={s.loading}><ActivityIndicator/><Text style={s.muted}>Revisando pendientes…</Text></View>:error?<View style={s.empty}><Text style={s.emptyTitle}>No pudimos cargar los pendientes.</Text><Pressable onPress={()=>void load()} style={s.primary}><Text style={s.primaryText}>Reintentar</Text></Pressable></View>:<>
      <View style={s.section}><View style={s.head}><Text style={s.sectionTitle}>Colegio</Text><Pressable onPress={()=>router.push('/(app)/estudio')}><Text style={s.link}>Preparar estudio</Text></Pressable></View>{academic.length?academic.map(item=><View key={item.id} style={s.item}><View style={s.flex}><Text style={s.type}>{academicLabel[item.category]??item.category}{item.subject?` · ${item.subject}`:''}</Text><Text style={s.itemTitle}>{item.title}</Text><Text style={s.meta}>{item.starts_at?new Date(item.starts_at).toLocaleString('es-CL',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Sin fecha'}{item.priority&&item.priority!=='normal'?` · prioridad ${item.priority}`:''}</Text></View><Pressable disabled={busyId===item.id} onPress={()=>void completeAcademic(item.id)} style={s.outline}><Text style={s.outlineText}>{busyId===item.id?'…':'Listo'}</Text></Pressable></View>):<Text style={s.muted}>No hay tareas escolares pendientes en los próximos días.</Text>}</View>

      <View style={s.section}><View style={s.head}><Text style={s.sectionTitle}>Familia</Text><Pressable onPress={()=>router.push('/(app)/familia')}><Text style={s.link}>Coordinar</Text></Pressable></View>{responsibilities.length?responsibilities.map(item=>{const mine=Boolean(item.assigned_member_id&&item.assigned_member_id===me?.id);return <View key={item.id} style={s.item}><View style={s.flex}><Text style={s.itemTitle}>{item.title}</Text><Text style={s.meta}>{item.assigned_name||'Sin responsable'} · {statusLabel[item.status]||item.status}</Text></View>{mine&&item.status==='proposed'?<View style={s.actions}><Pressable disabled={busyId===item.id} onPress={()=>void respond(item.id,'accepted')} style={s.outline}><Text style={s.outlineText}>Me encargo</Text></Pressable><Pressable disabled={busyId===item.id} onPress={()=>void respond(item.id,'declined')}><Text style={s.reject}>No puedo</Text></Pressable></View>:null}{mine&&item.status==='accepted'?<Pressable disabled={busyId===item.id} onPress={()=>void respond(item.id,'completed')} style={s.outline}><Text style={s.outlineText}>Listo</Text></Pressable>:null}</View>}):<Text style={s.muted}>No hay responsabilidades familiares pendientes.</Text>}</View>
    </>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F7F5'},body:{padding:22,paddingBottom:48,gap:21},kicker:{fontSize:11,fontWeight:'900',letterSpacing:1.3,color:'#747A74'},title:{fontSize:37,lineHeight:42,fontWeight:'900',letterSpacing:-1.1,color:'#171A18'},copy:{fontSize:15,lineHeight:22,color:'#5C635D'},loading:{paddingVertical:38,alignItems:'center',gap:11},muted:{fontSize:13,lineHeight:19,color:'#6E756F'},section:{gap:3},head:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:5},sectionTitle:{fontSize:21,fontWeight:'900',color:'#1B1F1B'},link:{fontSize:12,fontWeight:'900',color:'#38533D'},item:{flexDirection:'row',alignItems:'center',gap:11,paddingVertical:13,borderBottomWidth:1,borderBottomColor:'#E4E7E2'},flex:{flex:1},type:{fontSize:10.5,fontWeight:'900',letterSpacing:.4,textTransform:'uppercase',color:'#6A736C'},itemTitle:{fontSize:15,fontWeight:'850',color:'#1B1F1B',marginTop:3},meta:{fontSize:11.5,lineHeight:17,color:'#747B75',marginTop:3},outline:{borderWidth:1,borderColor:'#CCD2CB',borderRadius:11,paddingVertical:8,paddingHorizontal:10},outlineText:{fontSize:11,fontWeight:'900',color:'#38413A'},actions:{alignItems:'flex-end',gap:7},reject:{fontSize:11,fontWeight:'850',color:'#8B4747'},empty:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E0E3DE',borderRadius:18,padding:18,gap:10},emptyTitle:{fontSize:18,fontWeight:'900',color:'#1B1E1B'},primary:{alignSelf:'flex-start',backgroundColor:'#171A18',borderRadius:11,paddingVertical:9,paddingHorizontal:13},primaryText:{fontSize:12,fontWeight:'900',color:'#FFF'}});
