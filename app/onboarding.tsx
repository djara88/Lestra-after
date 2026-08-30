import { useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const familySchema = z.object({ familyName: z.string().trim().min(2).max(100), displayName: z.string().trim().min(2).max(100) });
const studentSchema = z.object({ firstName: z.string().trim().min(1).max(80), preferredName: z.string().trim().max(80), schoolName: z.string().trim().max(160), gradeLevel: z.string().trim().max(80) });
type Invitation={id:string;family_id:string;family_name:string;role:string;display_name:string|null;expires_at:string};
type FamilyContext={family_id?:string|null;family_name?:string|null;display_name?:string|null;students?:Array<{id?:string|null}>|null};

function getFamilyContext(context: unknown): FamilyContext | null {
  if (Array.isArray(context)) {
    const row = context.find((item) => Boolean(item && typeof item === 'object' && 'family_id' in item && item.family_id));
    return row && typeof row === 'object' ? (row as FamilyContext) : null;
  }
  return context && typeof context === 'object' ? (context as FamilyContext) : null;
}

export default function Onboarding() {
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [familyName, setFamilyName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [invitations,setInvitations]=useState<Invitation[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingContext, setLoadingContext] = useState(true);

  useEffect(()=>{
    let active = true;
    async function loadOnboardingState(){
      const [{data:context,error:contextError},{data:inviteData}] = await Promise.all([
        supabase.rpc('after_my_context'),
        supabase.rpc('after_my_invitations'),
      ]);
      if(!active)return;

      if(!contextError){
        const family=getFamilyContext(context);
        const hasStudent=Boolean(family?.students?.some((student)=>Boolean(student?.id)));
        if(family?.family_id && hasStudent){
          router.replace('/(app)');
          return;
        }
        if(family?.family_id){
          setFamilyId(String(family.family_id));
          setFamilyName(family.family_name??'');
          setDisplayName(family.display_name??'');
        }
      }

      setInvitations((inviteData??[]) as Invitation[]);
      setLoadingContext(false);
    }
    void loadOnboardingState();
    return()=>{active=false;};
  },[]);

  async function acceptInvitation(invitation:Invitation){
    setBusy(true);
    const {error}=await supabase.rpc('after_accept_invitation',{p_invitation_id:invitation.id,p_display_name:invitation.display_name});
    setBusy(false);
    if(error)return Alert.alert('No pudimos aceptar la invitación','Puede haber expirado o corresponder a otra cuenta de Google.');
    router.replace('/');
  }

  async function createFamily() {
    const parsed = familySchema.safeParse({ familyName, displayName });
    if (!parsed.success) return Alert.alert('Revisa los datos', 'Completa el nombre de la familia y cómo quieres aparecer en After.');
    setBusy(true);
    const { data, error } = await supabase.rpc('after_create_family', { p_family_name: parsed.data.familyName, p_display_name: parsed.data.displayName });
    setBusy(false);
    if (error || !data) return Alert.alert('No pudimos crear la familia', 'Revisa tu sesión e intenta nuevamente.');
    setFamilyId(String(data));
  }

  async function createStudent() {
    if (!familyId) return;
    const parsed = studentSchema.safeParse({ firstName, preferredName, schoolName, gradeLevel });
    if (!parsed.success) return Alert.alert('Revisa los datos', 'Ingresa al menos el nombre del alumno.');
    setBusy(true);
    const { error } = await supabase.rpc('after_create_student', {
      p_family_id: familyId,
      p_first_name: parsed.data.firstName,
      p_preferred_name: parsed.data.preferredName || null,
      p_birth_date: null,
      p_school_name: parsed.data.schoolName || null,
      p_grade_level: parsed.data.gradeLevel || null,
    });
    setBusy(false);
    if (error) return Alert.alert('No pudimos crear el alumno', 'Revisa los datos e intenta nuevamente.');
    router.replace('/');
  }

  if(loadingContext){
    return <SafeAreaView style={s.safe}><View style={s.loading}><Text style={s.copy}>Preparando tu espacio familiar…</Text></View></SafeAreaView>;
  }

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
    <Text style={s.brand}>Lestra After</Text>
    {!familyId && invitations.length>0 ? <View style={s.inviteBox}><Text style={s.step}>INVITACIÓN FAMILIAR</Text><Text style={s.inviteTitle}>Ya te están esperando</Text>{invitations.map(inv=><View key={inv.id} style={s.inviteRow}><View style={{flex:1}}><Text style={s.inviteFamily}>{inv.family_name}</Text><Text style={s.copy}>Acceso como {inv.role==='parent'?'apoderado':'tutor'}.</Text></View><Pressable disabled={busy} onPress={()=>acceptInvitation(inv)} style={s.smallButton}><Text style={s.buttonText}>Unirme</Text></Pressable></View>)}</View>:null}
    {!familyId ? <View style={s.card}>
      <Text style={s.step}>PASO 1 DE 2</Text><Text style={s.title}>Crea tu espacio familiar</Text><Text style={s.copy}>After separa cada familia de las demás. Google confirma tu identidad; los permisos se administran aquí.</Text>
      <TextInput style={s.input} placeholder="Ej. Familia Jara" value={familyName} onChangeText={setFamilyName} maxLength={100}/>
      <TextInput style={s.input} placeholder="Tu nombre" value={displayName} onChangeText={setDisplayName} maxLength={100}/>
      <Pressable style={[s.button,busy&&s.disabled]} disabled={busy} onPress={createFamily}><Text style={s.buttonText}>{busy?'Creando…':'Continuar'}</Text></Pressable>
    </View> : <View style={s.card}>
      <Text style={s.step}>PASO 2 DE 2</Text><Text style={s.title}>Agrega al primer alumno</Text><Text style={s.copy}>Tu familia ya está creada. Completa este paso para habilitar Agenda, Estudio y responsabilidades familiares.</Text>
      <TextInput style={s.input} placeholder="Nombre" value={firstName} onChangeText={setFirstName} maxLength={80}/>
      <TextInput style={s.input} placeholder="Nombre preferido (opcional)" value={preferredName} onChangeText={setPreferredName} maxLength={80}/>
      <TextInput style={s.input} placeholder="Colegio (opcional)" value={schoolName} onChangeText={setSchoolName} maxLength={160}/>
      <TextInput style={s.input} placeholder="Curso (opcional)" value={gradeLevel} onChangeText={setGradeLevel} maxLength={80}/>
      <Pressable style={[s.button,busy&&s.disabled]} disabled={busy} onPress={createStudent}><Text style={s.buttonText}>{busy?'Guardando…':'Entrar a After'}</Text></Pressable>
    </View>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F4F5F7'},loading:{flex:1,alignItems:'center',justifyContent:'center',padding:24},wrap:{padding:24,paddingTop:48,gap:24},brand:{fontSize:16,fontWeight:'800'},card:{gap:15},inviteBox:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#DDE1E5',borderRadius:18,padding:16,gap:12},inviteTitle:{fontSize:22,fontWeight:'800'},inviteRow:{flexDirection:'row',alignItems:'center',gap:12,borderTopWidth:1,borderTopColor:'#ECEEF0',paddingTop:12},inviteFamily:{fontSize:16,fontWeight:'800'},smallButton:{backgroundColor:'#111318',borderRadius:12,paddingVertical:11,paddingHorizontal:16},step:{fontSize:12,fontWeight:'800',letterSpacing:1.4,color:'#737A84'},title:{fontSize:34,lineHeight:39,fontWeight:'800',letterSpacing:-1.1},copy:{fontSize:15,lineHeight:23,color:'#626A75',marginBottom:8},input:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E0E3E7',borderRadius:16,padding:16,fontSize:16},button:{backgroundColor:'#111318',borderRadius:16,padding:17,alignItems:'center',marginTop:4},buttonText:{color:'#FFF',fontSize:16,fontWeight:'800'},disabled:{opacity:.55}});
