import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AfterChild } from '@/lib/afterDaily';

type Props = {
  children: AfterChild[];
  value: string;
  onChange: (value: string) => void;
};

function childName(child: AfterChild) {
  return child.preferred_name || child.first_name;
}

export function ChildSwitcher({ children, value, onChange }: Props) {
  if (children.length === 0) return null;

  if (children.length === 1) {
    const child = children[0];
    if (!child) return null;
    return (
      <View style={s.single} accessibilityRole="summary">
        <Text style={s.singleName}>{childName(child)}</Text>
        <Text style={s.singleMeta}>
          {child.relationship_label || 'Niño/a'}{child.grade_level ? ` · ${child.grade_level}` : ''}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: value === 'all' }}
        accessibilityLabel="Ver a toda la familia"
        onPress={() => onChange('all')}
        style={[s.chip, value === 'all' && s.chipActive]}
      >
        <Text style={[s.chipText, value === 'all' && s.chipTextActive]}>Todos</Text>
      </Pressable>
      {children.map(child => {
        const selected = value === child.id;
        return (
          <Pressable
            key={child.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Ver el día de ${childName(child)}`}
            onPress={() => onChange(child.id)}
            style={[s.chip, selected && s.chipActive]}
          >
            <Text style={[s.chipText, selected && s.chipTextActive]}>{childName(child)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderRadius: 999,
    backgroundColor: '#FFFDF9',
    borderWidth: 1,
    borderColor: '#E8DDD1',
  },
  chipActive: { backgroundColor: '#597657', borderColor: '#597657' },
  chipText: { fontSize: 14, fontWeight: '800', color: '#655B52' },
  chipTextActive: { color: '#FFFFFF' },
  single: { backgroundColor: '#EAF4E5', padding: 13, borderRadius: 17 },
  singleName: { fontSize: 16, fontWeight: '900', color: '#314631' },
  singleMeta: { fontSize: 12, color: '#60745E', marginTop: 2 },
});
