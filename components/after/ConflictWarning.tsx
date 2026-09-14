import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Conflict } from '@/lib/activities';

type Props = {
  conflict: Conflict;
  childName: (studentId?: string | null) => string;
  onOpen: (kind: 'event', id: string) => void;
};

export function ConflictWarning({ conflict, childName, onOpen }: Props) {
  return (
    <View style={s.box} accessibilityRole="alert">
      <View style={s.head}>
        <Text style={s.badge}>{conflict.type === 'overlap' ? 'CRUCE' : 'TRASLADO'}</Text>
        <Text style={s.child}>{childName(conflict.student_id)}</Text>
      </View>
      <Text style={s.title}>{conflict.first_title} → {conflict.second_title}</Text>
      <Text style={s.copy}>{conflict.message}</Text>
      <Pressable accessibilityRole="button" onPress={() => onOpen('event', conflict.second_id)} style={s.action}>
        <Text style={s.actionText}>Ajustar horario</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: '#FFF0E6', borderWidth: 1, borderColor: '#F2CBB5', borderRadius: 18, padding: 14, gap: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  badge: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: '#A95732' },
  child: { fontSize: 11, fontWeight: '800', color: '#8C725F' },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '900', color: '#4A352A' },
  copy: { fontSize: 12.5, lineHeight: 18, color: '#7A5B49' },
  action: { minHeight: 42, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, borderRadius: 11, backgroundColor: '#FFFFFF' },
  actionText: { fontSize: 12, fontWeight: '900', color: '#9B4C2D' },
});
