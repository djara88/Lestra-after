import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Context = { family_name?: string; display_name?: string; students?: Array<{ id: string; first_name: string; preferred_name?: string | null; school_name?: string | null; grade_level?: string | null }> };
type Dashboard = { students_total: number; events_next_7_days: number; pending_academic: number; upcoming: Array<{ id: string; title: string; category: string; starts_at: string; student_id?: string | null }> };

export default function Today() {
  const [context,setContext]=useState<Context>({});
  const [dashboard,setDashboard]=useState<Dashboard|null>(null);
  const [loading,setLoading]=useState(true);

  const load=useCallback(async()=>{
    setLoading(true);
    const [{data:ctx},{data:dash}] = await Promise.all([supabase.rpc('after_my_context'),supabase.rpc('after_dashboard')]);
    setContext((ctx??{}) as Context); setDashboard((dash??null) as Dashboard|null); setLoading(false);
  },[]);
  useFocusEffect(useCallback(()=>{load();},[load]));

  const firstStudent=context.students?.[0];
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/> }>
    <Text style={s.kicker}>HOY</Text><Text style={s.title}>Hola{context.display_name?`, ${context.display_name}`:''}</Text>
    <Text style={s.copy}>{context.family_name?`${context.family_name} · `:''}After organiza lo académico y los compromisos del alumno sin mezclar información de otras familias.</Text>
    {loading&&!dashboard?<ActivityIndicator style={{marginTop:24}}/>:<>
      <View style={s.metrics}><View style={s.metric}><Text style={s.number}>{dashboard?.pending_academic??0}</Text><Text style={s.label}>Pendientes</Text></View><View style={s.metric}><Text style={s.number}>{dashboard?.events_next_7_days??0}</Text><Text style={s.label}>Próx. 7 días</Text></View></View>
      <View style={s.card}><Text style={s.cardTitle}>{firstStudent?.preferred_name||firstStudent?.first_name||'Alumno'}</Text><Text style={s.copy}>{firstStudent?[firstStudent.school_name,firstStudent.grade_level].filter(Boolean).join(' · ')||'Perfil académico listo para completar':'Aún no hay alumno activo.'}</Text></View>
      <View style={s.card}><Text style={s.cardTitle}>Próximos compromisos</Text>{dashboard?.upcoming?.length?dashboard.upcoming.map(item=><View style={s.event} key={item.id}><Text style={s.eventTitle}>{item.title}</Text><Text style={s.eventMeta}>{new Date(item.starts_at).toLocaleString('es-CL')} · {item.category}</Text></View>):<Text style={s.copy}>Todavía no hay eventos. Agrégalos desde Agenda o Agregar.</Text>}</View>
    </>}
  </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F7F5'},body:{padding:24,gap:12},kicker:{fontSize:12,fontWeight:'800',letterSpacing:1.4,color:'#777'},title:{fontSize:34,fontWeight:'800'},copy:{fontSize:16,lineHeight:23,color:'#5C626D'},metrics:{flexDirection:'row',gap:12,marginTop:12},metric:{flex:1,padding:18,borderRadius:18,backgroundColor:'#111318'},number:{fontSize:30,fontWeight:'900',color:'#FFF'},label:{fontSize:12,color:'#C8CBD0',marginTop:3},card:{marginTop:8,padding:20,borderRadius:20,backgroundColor:'#FFF',borderWidth:1,borderColor:'#E8E8E4'},cardTitle:{fontSize:18,fontWeight:'800',marginBottom:8},event:{paddingVertical:12,borderTopWidth:1,borderTopColor:'#EEEFEA'},eventTitle:{fontSize:15,fontWeight:'700'},eventMeta:{fontSize:12,color:'#747B84',marginTop:4}});
