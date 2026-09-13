import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FlowItem } from '@/lib/afterDaily';

const labels: Record<string, string> = {
  task: 'Tarea', test: 'Prueba', exam: 'Examen', project: 'Proyecto', material: 'Material',
  school_event: 'Colegio', school: 'Colegio', study: 'Estudio', sport: 'Deporte', health: 'Salud',
  social: 'Actividad', family: 'Familia', other: 'Otro',
};

function timeLabel(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

type Props = {
  current: FlowItem | null;
  next: FlowItem | null;
  childName: (studentId?: string | null) => string;
  showChild: boolean;
  onImportSchool: () => void;
};

function ItemLine({ item, prefix, childName, showChild }: { item: FlowItem; prefix: string; childName: Props['childName']; showChild: boolean }) {
  const time = timeLabel(item.starts_at);
  return (
    <View style={s.line}>
      <Text style={s.linePrefix}>{prefix}</Text>
      <View style={s.lineBody}>
        <Text style={s.lineTitle}>{item.title}</Text>
        <Text style={s.lineMeta}>
          {time || 'Sin hora'} · {labels[item.category] || item.category}{showChild ? ` · ${childName(item.student_id)}` : ''}
        </Text>
      </View>
    </View>
  );
}

export function NowBlock({ current, next, childName, showChild, onImportSchool }: Props) {
  const hasTemporalItem = Boolean(current || next);

  return (
    <View style={s.wrap} accessibilityRole="summary">
      <Text style={s.kicker}>AHORA</Text>
      {current ? (
        <ItemLine item={current} prefix="En curso" childName={childName} showChild={showChild} />
      ) : (
        <View style={s.quiet}>
          <Text style={s.quietTitle}>{hasTemporalItem ? 'Sin actividad registrada ahora' : 'No hay una actividad con hora registrada ahora'}</Text>
          <Text style={s.quietCopy}>After no inventa horarios: te mostramos sólo lo que está confirmado.</Text>
        </View>
      )}

      {next ? (
        <View style={s.nextWrap}>
          <Text style={s.kickerDark}>DESPUÉS</Text>
          <ItemLine item={next} prefix="Sigue" childName={childName} showChild={showChild} />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Leer una comunicación del colegio"
        onPress={onImportSchool}
        style={s.action}
      >
        <Text style={s.actionText}>Leer algo del colegio</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: '#F58B57', borderRadius: 26, padding: 20, gap: 12 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: '#FFE8DA' },
  kickerDark: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: '#7E4E37', marginBottom: 5 },
  quiet: { gap: 4 },
  quietTitle: { fontSize: 22, lineHeight: 27, fontWeight: '900', color: '#FFFFFF' },
  quietCopy: { fontSize: 13, lineHeight: 19, color: '#FFF2E9' },
  nextWrap: { marginTop: 2, backgroundColor: '#FFD9C3', borderRadius: 18, padding: 13 },
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  linePrefix: { fontSize: 11, fontWeight: '900', color: '#7A3F25', minWidth: 48, paddingTop: 3 },
  lineBody: { flex: 1 },
  lineTitle: { fontSize: 20, lineHeight: 25, fontWeight: '900', color: '#FFFFFF' },
  lineMeta: { fontSize: 12.5, lineHeight: 18, color: '#FFF2E9', marginTop: 3 },
  action: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', backgroundColor: '#FFF8F1', borderRadius: 13, paddingHorizontal: 14 },
  actionText: { fontSize: 13, fontWeight: '900', color: '#A6532D' },
});
