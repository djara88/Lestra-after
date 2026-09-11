import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

type Props = {
  value: Date;
  onChange: (value: Date) => void;
  allowQuickTomorrow?: boolean;
  label?: string;
};

function nextDay(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

export function ScheduleField({ value, onChange, allowQuickTomorrow = true, label = '¿Cuándo?' }: Props) {
  const [iosMode, setIosMode] = useState<'date' | 'time' | null>(null);
  const dateText = useMemo(() => value.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' }), [value]);
  const timeText = useMemo(() => value.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }), [value]);

  function open(mode: 'date' | 'time') {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode,
        is24Hour: true,
        minimumDate: mode === 'date' ? new Date(new Date().setHours(0, 0, 0, 0)) : undefined,
        onChange: (event, selected) => {
          if (event.type !== 'set' || !selected) return;
          const next = new Date(value);
          if (mode === 'date') next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
          else next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
          onChange(next);
        },
      });
      return;
    }
    setIosMode(mode);
  }

  function quick(days: number, hour?: number) {
    const base = nextDay(new Date(), days);
    base.setHours(hour ?? value.getHours(), hour == null ? value.getMinutes() : 0, 0, 0);
    onChange(base);
  }

  return <View style={s.wrap}>
    <Text style={s.label}>{label}</Text>
    <View style={s.row}>
      <Pressable onPress={() => open('date')} style={[s.field, s.dateField]}>
        <Text style={s.fieldLabel}>FECHA</Text><Text style={s.fieldValue}>{dateText}</Text>
      </Pressable>
      <Pressable onPress={() => open('time')} style={[s.field, s.timeField]}>
        <Text style={s.fieldLabel}>HORA</Text><Text style={s.fieldValue}>{timeText}</Text>
      </Pressable>
    </View>
    <View style={s.quickRow}>
      <Pressable onPress={() => quick(0)} style={s.quick}><Text style={s.quickText}>Hoy</Text></Pressable>
      {allowQuickTomorrow ? <Pressable onPress={() => quick(1)} style={s.quick}><Text style={s.quickText}>Mañana</Text></Pressable> : null}
      <Pressable onPress={() => quick(0, 17)} style={s.quick}><Text style={s.quickText}>17:00</Text></Pressable>
      <Pressable onPress={() => quick(0, 18)} style={s.quick}><Text style={s.quickText}>18:00</Text></Pressable>
    </View>
    {Platform.OS === 'ios' && iosMode ? <View style={s.iosPicker}>
      <DateTimePicker
        value={value}
        mode={iosMode}
        display="spinner"
        is24Hour
        onChange={(_, selected) => selected && onChange(selected)}
      />
      <Pressable onPress={() => setIosMode(null)} style={s.done}><Text style={s.doneText}>Listo</Text></Pressable>
    </View> : null}
  </View>;
}

const s = StyleSheet.create({
  wrap:{gap:8},label:{fontSize:13,fontWeight:'800',color:'#5E5A52'},row:{flexDirection:'row',gap:10},
  field:{backgroundColor:'#FFFDF9',borderWidth:1,borderColor:'#E8DDD1',borderRadius:16,paddingHorizontal:14,paddingVertical:12},
  dateField:{flex:1},timeField:{width:112},fieldLabel:{fontSize:10,fontWeight:'900',letterSpacing:.9,color:'#9A8D80'},
  fieldValue:{fontSize:15,fontWeight:'800',color:'#2B2926',marginTop:3,textTransform:'capitalize'},quickRow:{flexDirection:'row',flexWrap:'wrap',gap:7},
  quick:{backgroundColor:'#FFF3E6',borderRadius:999,paddingHorizontal:11,paddingVertical:7},quickText:{fontSize:12,fontWeight:'800',color:'#7B5C3F'},
  iosPicker:{backgroundColor:'#FFFDF9',borderWidth:1,borderColor:'#E8DDD1',borderRadius:16,padding:8},done:{alignSelf:'flex-end',backgroundColor:'#F58B57',borderRadius:10,paddingHorizontal:14,paddingVertical:8},doneText:{color:'#FFF',fontWeight:'900'}
});
