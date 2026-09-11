import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { Tabs, router } from 'expo-router';
import { supabase } from '@/lib/supabase';

type FamilyContext={family_id?:string|null;students?:Array<{id?:string|null}>|null};
type AccessState={state?:'active'|'paused'|'closed'|'none'};
function getFamilyContext(context:unknown):FamilyContext|null{if(Array.isArray(context)){const row=context.find((item)=>Boolean(item&&typeof item==='object'&&'family_id' in item&&item.family_id));return row&&typeof row==='object'?(row as FamilyContext):null;}return context&&typeof context==='object'?(context as FamilyContext):null;}
function TabGlyph({children,active}:{children:string;active:boolean}){return <View style={[s.iconWrap,active&&s.iconWrapActive]}><Text style={s.tabGlyph}>{children}</Text></View>;}

export default function AppLayout(){
  const [ready,setReady]=useState(false);const [loadError,setLoadError]=useState(false);const [retryKey,setRetryKey]=useState(0);
  useEffect(()=>{let mounted=true;async function validate(){setReady(false);setLoadError(false);const {data:{user},error:userError}=await supabase.auth.getUser();if(!mounted)return;if(userError){setLoadError(true);return;}if(!user){router.replace('/login');return;}const [{data:accessData,error:accessError},{data:context,error:contextError}]=await Promise.all([supabase.rpc('after_my_access_state'),supabase.rpc('after_my_context')]);if(!mounted)return;if(accessError||contextError){setLoadError(true);return;}const access=(accessData??{}) as AccessState;if(access.state==='paused'||access.state==='closed'){router.replace('/access-paused');return;}const family=getFamilyContext(context);if(!family?.family_id||!family?.students?.some(student=>Boolean(student?.id))){router.replace('/onboarding');return;}setReady(true);}void validate();const {data:listener}=supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')router.replace('/login');});return()=>{mounted=false;listener.subscription.unsubscribe();};},[retryKey]);
  if(!ready)return <View style={s.container}>{loadError?<><Text style={s.title}>No pudimos abrir tu familia.</Text><Text style={s.copy}>Tu sesión sigue protegida. Revisa la conexión e intenta nuevamente.</Text><Pressable style={s.button} onPress={()=>setRetryKey(value=>value+1)}><Text style={s.buttonText}>Reintentar</Text></Pressable></>:<ActivityIndicator color="#F58B57"/>}</View>;
  const androidTop=Platform.OS==='android'?RNStatusBar.currentHeight??24:0;const bottomPad=Platform.OS==='android'?13:8;
  return <Tabs screenOptions={{headerShown:false,sceneStyle:{paddingTop:androidTop,backgroundColor:'#FFF8F1'},tabBarHideOnKeyboard:true,tabBarActiveTintColor:'#3D573A',tabBarInactiveTintColor:'#97897D',tabBarLabelStyle:{fontSize:10.5,fontWeight:'800',marginTop:2},tabBarStyle:{height:67+bottomPad,paddingBottom:bottomPad,paddingTop:6,borderTopColor:'#EADFD5',backgroundColor:'#FFFDF9',elevation:8}}}>
    <Tabs.Screen name="index" options={{title:'Hoy',tabBarIcon:({focused})=><TabGlyph active={focused}>☀️</TabGlyph>}}/>
    <Tabs.Screen name="agenda" options={{title:'Semana',tabBarIcon:({focused})=><TabGlyph active={focused}>🗓️</TabGlyph>}}/>
    <Tabs.Screen name="agregar" options={{title:'Colegio',tabBarIcon:({focused})=><TabGlyph active={focused}>📷</TabGlyph>}}/>
    <Tabs.Screen name="pendientes" options={{title:'Pendientes',tabBarIcon:({focused})=><TabGlyph active={focused}>✓</TabGlyph>}}/>
    <Tabs.Screen name="familia" options={{title:'Familia',tabBarIcon:({focused})=><TabGlyph active={focused}>🏡</TabGlyph>}}/>
    <Tabs.Screen name="estudio" options={{href:null}}/>
  </Tabs>;
}

const s=StyleSheet.create({container:{flex:1,alignItems:'center',justifyContent:'center',padding:28,backgroundColor:'#FFF8F1'},title:{fontSize:22,fontWeight:'900',textAlign:'center',color:'#302D29'},copy:{marginTop:10,fontSize:15,lineHeight:22,textAlign:'center',color:'#71665C',maxWidth:360},button:{marginTop:22,backgroundColor:'#F58B57',paddingHorizontal:22,paddingVertical:14,borderRadius:14},buttonText:{color:'#FFF',fontWeight:'900'},iconWrap:{minWidth:32,height:27,borderRadius:10,alignItems:'center',justifyContent:'center'},iconWrapActive:{backgroundColor:'#EEF4EA'},tabGlyph:{fontSize:16,lineHeight:19,fontWeight:'900'}});