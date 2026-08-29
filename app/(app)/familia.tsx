import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Member={id:string;display_name:string;role:string;is_me:boolean};
type Student={id:string;name:string};
type Responsibility={id:string;student_id:string|null;assigned_member_id:string|null;assigned_name:string|null;title:string;status:string};
type Workspace={family_id?:string;members?:Member[];students?:Student[];responsibilities?:Responsibility[]};

const statusLabel:Record<string,string>={unassigned:'Sin responsable',proposed:'Pendiente',accepted:'Aceptada',declined:'Rechazada',completed:'Completada'};

export default function Family(){
  const [workspace,setWorkspace]=useState<Workspace>({}); const [busy,setBusy]=useState(false); const [title,setTitle]=useState('');
  const [studentId,setStudentId]=useState(''); const [memberId,setMemberId]=useState('');
  const members=workspace.members??[]; const students=workspace.students??[]; const responsibilities=workspace.responsibilities??[];
  const me=useMemo(()=>members.find(m=>m.is_me),[members]);

  async function load(){const {data,error}=await supabase.rpc('after_family_workspace');if(!error){const ws=(data??{}) as Workspace;setWorkspace(ws);if(!studentId&&ws.students?.[0])setStudentId(ws.students[0].id);}}
  useEffect(()=>{load();},[]);

  async function create(){
    if(!workspace.family_id||title.trim().length<2)return Alert.alert('Falta información','Escribe una responsabilidad para la familia.');
    setBusy(true);const {error}=await supabase.rpc('after_create_responsibility',{p_family_id:workspace.family_id,p_student_id:studentId||null,p_title:title.trim(),p_assigned_member_id:memberId||null});setBusy(false);
    if(error)return Alert.alert('No pudimos guardar','Revisa tu sesión y los permisos familiares.');
    setTitle('');await load();
  }

  async function respond(id:string,action:'accepted'|'declined'|'completed'){
    setBusy(true);const {error}=await supabase.rpc('after_respond_responsibility',{p_responsibility_id:id,p_action:action});setBusy(false);
    if(error)return Alert.alert('No pudimos actualizar','Solo la persona asignada puede responder esta responsabilidad.');
    await load();
  }

  async function logout(){const {error}=await supabase.auth.signOut();if(error){Alert.alert('Error','No pudimos cerrar la sesión.');return;}router.replace('/login');}

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.body}>
    <Text style={s.kicker}>FAMILIA</Text><Text style={s.title}>Coordinación en casa</Text><Text style={s.copy}>Asigna quién se hará cargo de tareas, traslados y compromisos del alumno. Los permisos se mantienen aislados por familia.</Text>

    <View style={s.card}><Text style={s.heading}>Nueva responsabilidad</Text><TextInput style={s.input} value={title} onChangeText={setTitle} maxLength={180} placeholder="Ej. Llevar a Vicente al dentista"/>
      <Text style={s.label}>Alumno</Text><View style={s.chips}>{students.map(st=><Pressable key={st.id} onPress={()=>setStudentId(st.id)} style={[s.chip,studentId===st.id&&s.active]}><Text style={[s.chipText,studentId===st.id&&s.activeText]}>{st.name}</Text></Pressable>)}</View>
      <Text style={s.label}>Responsable</Text><View style={s.chips}><Pressable onPress={()=>setMemberId('')} style={[s.chip,memberId===''&&s.active]}><Text style={[s.chipText,memberId===''&&s.activeText]}>Por definir</Text></Pressable>{members.map(m=><Pressable key={m.id} onPress={()=>setMemberId(m.id)} style={[s.chip,memberId===m.id&&s.active]}><Text style={[s.chipText,memberId===m.id&&s.activeText]}>{m.display_name}{m.is_me?' (yo)':''}</Text></Pressable>)}</View>
      <Pressable disabled={busy} onPress={create} style={[s.button,busy&&s.disabled]}><Text style={s.buttonText}>{busy?'Guardando…':'Agregar responsabilidad'}</Text></Pressable>
    </View>

    <View style={s.card}><Text style={s.heading}>Pendientes</Text>{responsibilities.length===0?<Text style={s.muted}>No hay responsabilidades pendientes.</Text>:responsibilities.map(r=>{const mine=r.assigned_member_id&&r.assigned_member_id===me?.id;return <View key={r.id} style={s.item}><View style={{flex:1}}><Text style={s.itemTitle}>{r.title}</Text><Text style={s.meta}>{r.assigned_name||'Sin responsable'} · {statusLabel[r.status]||r.status}</Text></View>{mine&&r.status==='proposed'?<View style={s.actions}><Pressable onPress={()=>respond(r.id,'accepted')}><Text style={s.actionText}>Aceptar</Text></Pressable><Pressable onPress={()=>respond(r.id,'declined')}><Text style={s.decline}>Rechazar</Text></Pressable></View>:null}{mine&&r.status==='accepted'?<Pressable onPress={()=>respond(r.id,'completed')}><Text style={s.actionText}>Completar</Text></Pressable>:null}</View>})}</View>

    <Pressable onPress={logout} style={s.logout}><Text style={s.logoutText}>Cerrar sesión</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7F7F5'},body:{padding:24,gap:18},kicker:{fontSize:12,fontWeight:'800',letterSpacing:1.3,color:'#777'},title:{fontSize:32,lineHeight:38,fontWeight:'800'},copy:{fontSize:15,lineHeight:22,color:'#5C626D'},card:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E5E5E0',borderRadius:18,padding:16,gap:12},heading:{fontSize:18,fontWeight:'800'},label:{fontSize:12,fontWeight:'800',color:'#5C626D'},input:{borderWidth:1,borderColor:'#DADDD8',borderRadius:14,padding:14,fontSize:16},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{paddingVertical:8,paddingHorizontal:11,borderWidth:1,borderColor:'#D9DBD7',borderRadius:999},active:{backgroundColor:'#111318',borderColor:'#111318'},chipText:{fontSize:13,fontWeight:'700'},activeText:{color:'#FFF'},button:{backgroundColor:'#111318',borderRadius:14,padding:15,alignItems:'center'},buttonText:{color:'#FFF',fontWeight:'800'},disabled:{opacity:.5},item:{flexDirection:'row',gap:12,alignItems:'center',paddingVertical:10,borderTopWidth:1,borderTopColor:'#EEEFEA'},itemTitle:{fontSize:15,fontWeight:'800'},meta:{fontSize:12,color:'#6D737C',marginTop:3},actions:{flexDirection:'row',gap:12},actionText:{fontSize:13,fontWeight:'800'},decline:{fontSize:13,fontWeight:'800',color:'#A64242'},muted:{color:'#777'},logout:{padding:15,borderRadius:14,borderWidth:1,borderColor:'#D9DBD7',alignItems:'center'},logoutText:{fontWeight:'800'}});
