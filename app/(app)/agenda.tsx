import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

type AgendaItem={kind:'event'|'academic';id:string;student_id?:string|null;title:string;category:string;starts_at?:string|null;status?:string;priority?:string;location?:string|null;sensitivity?:string};
type Context={students?:Array<{id:string;first_name:string;preferred_name?:string|null}>};

const labels:Record<string,string>={task:'Tarea',test:'Prueba',exam:'Examen',project:'Proyecto',material:'Material',school_event:'Colegio',school:'Colegio',study:'Estudio',sport:'Deporte',health:'Salud',social:'Social',family:'Familia',other:'Otro'};

export default function Agenda(){
  const [items,setItems]=useState<AgendaItem[]>([]);const [context,setContext]=useState<Context>({});const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);const [{data:agenda,error},{data:ctx}]=await Promise.all([supabase.rpc('after_agenda',{p_days:30}),supabase.rpc('after_my_context')]);if(!error)setItems((agenda??[]) as AgendaItem[]);setContext((ctx??{}) as Context);setLoading(false);},[]);
  useFocusEffect(useCallback(()=>{load();},[load]));
  const studentName=(id?:string|null)=>{const st=context.students?.find(x=>x.id===id);return st?.preferred_name||st?.first_name||'Familia';};
  const grouped=items.reduce<Record<string,AgendaItem[]>>((acc,item)=>{const key=item.starts_at?new Date(item.starts_at).toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'}):'Sin fecha';(acc[key]??=[]).push(item);return acc;},{});
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>}>
    <Text style={s.kicker}>PRÓXIMOS 30 DÍAS</Text><Text style={s.title}>Agenda</Text><Text style={s.copy}>Colegio, estudio, deporte, salud y compromisos familiares en una sola línea de tiempo.</Text>
    {loading&&!items.length?<ActivityIndicator style={{marginTop:28}}/>:items.length?Object.entries(grouped).map(([day,dayItems])=><View key={day} style={s.group}><Text style={s.day}>{day}</Text>{dayItems.map(item=><View key={`${item.kind}-${item.id}`} style={s.card}><View style={s.top}><Text style={s.badge}>{labels[item.category]??item.category}</Text>{item.sensitivity==='private'?<Text style={s.private}>Privado</Text>:null}</View><Text style={s.cardTitle}>{item.title}</Text><Text style={s.meta}>{studentName(item.student_id)}{item.starts_at?` · ${new Date(item.starts_at).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}`:''}{item.location?` · ${item.location}`:''}</Text>{item.kind==='academic'&&item.priority&&item.priority!=='normal'?<Text style={s.priority}>Prioridad {item.priority}</Text>:null}</View>)}</View>):<View style={s.empty}><Text style={s.emptyTitle}>Tu agenda está despejada</Text><Text style={s.copy}>Agrega una tarea, prueba, entrenamiento, control médico o compromiso desde “Agregar”.</Text></View>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F7F5'},body:{padding:24,paddingBottom:44},kicker:{fontSize:12,fontWeight:'800',letterSpacing:1.3,color:'#777'},title:{fontSize:34,fontWeight:'800',marginTop:5},copy:{fontSize:15,lineHeight:22,color:'#5C626D',marginTop:7},group:{marginTop:22,gap:9},day:{fontSize:14,fontWeight:'800',textTransform:'capitalize',color:'#4D545D'},card:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E7E8E4',borderRadius:18,padding:17},top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},badge:{fontSize:11,fontWeight:'900',letterSpacing:.5,color:'#5C626D',textTransform:'uppercase'},private:{fontSize:11,fontWeight:'800',color:'#815F6D'},cardTitle:{fontSize:17,fontWeight:'800',marginTop:7},meta:{fontSize:13,color:'#727982',marginTop:5},priority:{fontSize:12,fontWeight:'700',marginTop:7,color:'#715D45'},empty:{marginTop:28,padding:22,borderRadius:20,backgroundColor:'#FFF',borderWidth:1,borderColor:'#E7E8E4'},emptyTitle:{fontSize:19,fontWeight:'800'}});