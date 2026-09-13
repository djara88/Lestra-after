import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MaterialItem } from '@/lib/afterDaily';

type Props = {
  materials: MaterialItem[];
  busyId: string | null;
  childName: (studentId?: string | null) => string;
  showChild: boolean;
  onToggle: (material: MaterialItem) => void;
};

export function PreparationChecklist({ materials, busyId, childName, showChild, onToggle }: Props) {
  const packed = materials.filter(item => item.packed).length;

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View>
          <Text style={s.kicker}>MOCHILA</Text>
          <Text style={s.title}>Dejar listo para mañana</Text>
        </View>
        <Text style={s.counter}>{packed}/{materials.length}</Text>
      </View>

      {materials.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Sin materiales pendientes registrados</Text>
          <Text style={s.emptyCopy}>Si el colegio mandó una circular o foto, súbela para revisarla antes de mañana.</Text>
        </View>
      ) : materials.map(material => (
        <Pressable
          key={material.id}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: material.packed, disabled: busyId === material.id }}
          accessibilityLabel={`${material.name}. ${material.task_title}`}
          disabled={busyId === material.id}
          onPress={() => onToggle(material)}
          style={s.row}
        >
          <View style={[s.check, material.packed && s.checkDone]}>
            <Text style={s.checkText}>{material.packed ? '✓' : ''}</Text>
          </View>
          <View style={s.content}>
            <Text style={[s.name, material.packed && s.done]}>{material.name}</Text>
            <Text style={s.meta}>{material.task_title}{showChild ? ` · ${childName(material.student_id)}` : ''}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 8, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: '#72876D' },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '900', color: '#30432F', marginTop: 2 },
  counter: { fontSize: 12, fontWeight: '900', color: '#71806D' },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8 },
  check: { width: 28, height: 28, borderRadius: 9, borderWidth: 1.5, borderColor: '#AFC0AA', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFDF9' },
  checkDone: { backgroundColor: '#597657', borderColor: '#597657' },
  checkText: { color: '#FFFFFF', fontWeight: '900' },
  content: { flex: 1 },
  name: { fontSize: 14.5, fontWeight: '800', color: '#30432F' },
  done: { textDecorationLine: 'line-through', color: '#80907C' },
  meta: { fontSize: 11.5, lineHeight: 17, color: '#788574', marginTop: 2 },
  empty: { paddingVertical: 10, gap: 3 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#40523E' },
  emptyCopy: { fontSize: 12.5, lineHeight: 18, color: '#7A8677' },
});
