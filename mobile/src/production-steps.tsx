import { Pressable, StyleSheet, Text, View } from 'react-native'
import { color, font } from './theme'

const STEPS = [
  { n: 1 as const, title: 'Generate QR', body: 'Sistem bikin kode tiap kartu' },
  { n: 2 as const, title: 'Cetak', body: 'Print kartu dulu, baru tempel tag' },
  { n: 3 as const, title: 'Tempel NFC', body: 'Tempel tag, tulis dengan HP' },
]

export function ProductionSteps({
  current,
  onStep,
}: {
  current: 1 | 2 | 3
  onStep?: (step: 1 | 2 | 3) => void
}) {
  return (
    <View style={styles.row}>
      {STEPS.map((step) => {
        const active = step.n === current
        const done = step.n < current
        const inner = (
          <>
            <View
              style={[
                styles.num,
                (active || done) && styles.numOn,
              ]}
            >
              <Text
                style={[styles.numText, (active || done) && styles.numTextOn]}
              >
                {step.n}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.title}>{step.title}</Text>
              <Text style={[styles.body, active && styles.bodyActive]}>
                {step.body}
              </Text>
            </View>
          </>
        )
        const style = [styles.card, active && styles.cardActive]
        if (onStep) {
          return (
            <Pressable
              key={step.n}
              onPress={() => onStep(step.n)}
              style={style}
            >
              {inner}
            </Pressable>
          )
        }
        return (
          <View key={step.n} style={style}>
            {inner}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { gap: 8 },
  card: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    backgroundColor: color.card,
    alignItems: 'flex-start',
  },
  cardActive: { backgroundColor: color.accent },
  num: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.muted,
  },
  numOn: { backgroundColor: color.pine },
  numText: {
    fontFamily: font.sansMedium,
    fontSize: 13,
    color: color.mutedForeground,
  },
  numTextOn: { color: color.primaryForeground },
  title: {
    fontFamily: font.sansMedium,
    fontSize: 14,
    color: color.foreground,
  },
  body: {
    fontFamily: font.sans,
    fontSize: 13,
    color: color.mutedForeground,
    marginTop: 2,
  },
  bodyActive: { color: color.foreground },
})
