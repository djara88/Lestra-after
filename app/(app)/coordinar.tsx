import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ScheduleField } from '@/components/ScheduleField';
import { createResponsibility, getFamilyWorkspace, type FamilyWorkspace } from '@/lib/coordination';

function defaultDue(){const d=new Date();d.setDate(d.getDate()+1);d.setHours(18,0,0,0);return d;}

export default function Coordinate(){
  const [workspace,setWorkspace]=useState<FamilyWorkspace>({});
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [loadError,setLoadError]=useState(false);
  const [title,setTitle]=useState('');const [studentId,setStudentId]=useState('');const [memberId,setMemberId]=useState('');const [dueAt,setDueAt]=useState(defaultDue);const [contextText,setContextText]=useState('');
  const load=useCallback(async()=>{setLoading(true);setLoadError(false);try{const next=await getFamilyWorkspace();setWorkspace(next);setStudentId(current=>current||next.students?.[0]?.id||'');}catch{setLoadError(true);}finally{setLoading(false);}},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  const members=workspace.members??[];const students=workspace.students??[];
  const canSave=useMemo(()=>Boolean(workspace.family_id&&title.trim().length>=2&&!busy),[workspace.family_id,title,busy]);

  async function save(){if(!workspace.family_id||!canSave)return;setBusy(true);try{await createResponsibility({familyId:workspace.family_id,studentId:studentId||null,title,assignedMemberId:memberId||null,dueAt,contextText});Alert.alert('Coordinado',memberId?'La persona asignada podrá aceptar y confirmar cuando esté listo.':'Quedó pendiente de asignar responsable.');router.replace('/(app)/familia');}catch(error){Alert.alert('No pudimos guardar',error instanceof Error?error.message:'Vuelve a intentar.');}finally{setBusy(false);}}

  if(loading)return <SafeAreaView style={s.safe}><View style={s.center}><ActivityIndicator color="#F58B57"/><Text style={s.muted}>Preparando la coordinación…</Text></View></SafeAreaView>;
  if(loadError)return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.errorTitle}>No pudimos abrir la familia</Text><Text style={s.muted}>Revisa la conexión y vuelve a intentar.</Text><Pressable onPress={()=>void load()} style={s.primary}><Text style={s.primaryText}>Reintentar</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
    <Pressable accessibilityRole="button" onPress={()=>router.back()} style={s.back}><Text style={s.backText}>‹ Volver</Text></Pressable>
    <Text style={s.kicker}>COORDINAR</Text><Text style={s.title}>Quién hace qué, y para cuándo.</Text><Text style={s.copy}>Una responsabilidad necesita responsable, fecha límite y confirmación. Nada más.</Text>

    <View style={s.group}><Text style={s.label}>¿Qué hay que resolver?</Text><TextInput value={title} onChangeText={setTitle} maxLength={180} placeholder="Ej. Retirar a Vicente a las 17:30" placeholderTextColor="#A69A90" style={s.input}/></View>

    {students.length?<View style={s.group}><Text style={s.label}>¿Para quién?</Text><View style={s.chips}><Pressable onPress={()=>setStudentId('')} style={[s.chip,!studentId&&s.chipActive]}><Text style={[s.chipText,!studentId&&s.chipTextActive]}>Familia</Text></Pressable>{students.map(student=>{const selected=studentId===student.id;return <Pressable accessibilityRole="button" accessibilityState={{selected}} key={student.id} onPress={()=>setStudentId(student.id)} style={[s.chip,selected&&s.chipActive]}><Text style={[s.chipText,selected&&s.chipTextActive]}>{student.name}</Text></Pressable>;})}</View></View>:null}

    <View style={s.group}><Text style={s.label}>Responsable</Text><View style={s.chips}><Pressable onPress={()=>setMemberId('')} style={[s.chip,!memberId&&s.chipActive]}><Text style={[s.chipText,!memberId&&s.chipTextActive]}>Por definir</Text></Pressable>{members.map(member=>{const selected=memberId===member.id;return <Pressable accessibilityRole="button" accessibilityState={{selected}} key={member.id} onPress={()=>setMemberId(member.id)} style={[s.chip,selected&&s.chipActive]}><Text style={[s.chipText,selected&&s.chipTextActive]}>{member.display_name}{member.is_me?' · yo':''}</Text></Pressable>;})}</View></View>

    <ScheduleField value={dueAt} onChange={setDueAt} label="¿Para cuándo debe estar resuelto?"/>
    <View style={s.group}><Text style={s.label}>Contexto opcional</Text><TextInput value={contextText} onChangeText={setContextText} multiline maxLength={1000} placeholder="Ej. La abuela tiene la autorización y la cédula" placeholderTextColor="#A69A90" style={[s.input,s.note]}/></View>

    <Pressable accessibilityRole="button" accessibilityState={{disabled:!canSave}} disabled={!canSave} onPress={()=>void save()} style={[s.save,!canSave&&s.disabled]}><Text style={s.saveText}>{busy?'Guardando…':'Guardar responsabilidad'}</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#FFF8F1'},body:{paddingHorizontal:18,paddingTop:12,paddingBottom:70,gap:18},back:{minHeight:44,alignSelf:'flex-start',justifyContent:'center',paddingRight:12},backText:{fontSize:14,fontWeight:'900',color:'#6B655D'},kicker:{fontSize:10.5,fontWeight:'900',letterSpacing:1.2,color:'#9A765D'},title:{fontSize:31,lineHeight:36,fontWeight:'900',letterSpacing:-.8,color:'#2B2926',marginTop:-11},copy:{fontSize:14.5,lineHeight:21,color:'#756B62',marginTop:-10},center:{flex:1,alignItems:'center',justifyContent:'center',gap:12,padding:28},muted:{fontSize:13,lineHeight:19,color:'#81756A',textAlign:'center'},errorTitle:{fontSize:19,fontWeight:'900',color:'#302D29'},primary:{minHeight:44,justifyContent:'center',backgroundColor:'#597657',borderRadius:12,paddingHorizontal:15},primaryText:{color:'#FFF',fontWeight:'900'},group:{gap:8},label:{fontSize:13,fontWeight:'800',color:'#5E5A52'},input:{minHeight:50,borderRadius:15,borderWidth:1,borderColor:'#E7DCD1',backgroundColor:'#FFFDF9',paddingHorizontal:14,fontSize:15,color:'#2B2926'},note:{minHeight:90,paddingTop:13,textAlignVertical:'top'},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{minHeight:44,justifyContent:'center',paddingHorizontal:14,borderRadius:999,borderWidth:1,borderColor:'#E7DCD1',backgroundColor:'#FFFDF9'},chipActive:{backgroundColor:'#597657',borderColor:'#597657'},chipText:{fontSize:13,fontWeight:'900',color:'#655B52'},chipTextActive:{color:'#FFF'},save:{minHeight:54,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#F58B57'},disabled:{opacity:.45},saveText:{color:'#FFF',fontSize:15,fontWeight:'900'}});