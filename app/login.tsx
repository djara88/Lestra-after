import { useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(8).max(128) });
export default function Login() {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false);
  async function submit(){ const parsed=schema.safeParse({email,password}); if(!parsed.success){Alert.alert('Revisa tus datos','Ingresa un correo válido y una contraseña de al menos 8 caracteres.');return;} setBusy(true); const {error}=await supabase.auth.signInWithPassword(parsed.data); setBusy(false); if(error){Alert.alert('No pudimos iniciar sesión','Verifica tus credenciales.');return;} router.replace('/(app)'); }
  return <SafeAreaView style={s.safe}><View style={s.card}><Text style={s.brand}>Lestra After</Text><Text style={s.title}>Tu familia, organizada.</Text><Text style={s.copy}>Estudio, actividades y compromisos del alumno en un solo lugar.</Text><TextInput style={s.input} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="Correo" value={email} onChangeText={setEmail}/><TextInput style={s.input} secureTextEntry autoComplete="password" placeholder="Contraseña" value={password} onChangeText={setPassword}/><Pressable disabled={busy} style={s.button} onPress={submit}><Text style={s.buttonText}>{busy?'Ingresando…':'Ingresar'}</Text></Pressable></View></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#F4F5F7',justifyContent:'center',padding:24},card:{gap:14},brand:{fontSize:16,fontWeight:'800'},title:{fontSize:36,fontWeight:'800',letterSpacing:-1.2},copy:{fontSize:16,lineHeight:24,color:'#5C626D',marginBottom:12},input:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#E2E5E9',borderRadius:16,padding:16,fontSize:16},button:{backgroundColor:'#111318',borderRadius:16,padding:17,alignItems:'center'},buttonText:{color:'#FFF',fontWeight:'800',fontSize:16}});