import { Pressable, StyleSheet, Text, View } from 'react-native';

type Option<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
  label?: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
};

export function ChoiceChips<T extends string | number>({ label, value, options, onChange }: Props<T>) {
  return (
    <View style={s.wrap}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.row}>
        {options.map(option => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[s.chip, selected && s.chipActive]}
            >
              <Text style={[s.text, selected && s.textActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontSize: 13, fontWeight: '800', color: '#5E5A52' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 999, backgroundColor: '#FFF3E6', borderWidth: 1, borderColor: '#F0DECD' },
  chipActive: { backgroundColor: '#5B7658', borderColor: '#5B7658' },
  text: { fontSize: 12.5, fontWeight: '800', color: '#765A43' },
  textActive: { color: '#FFFFFF' },
});
