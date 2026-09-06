import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import { SymbolView } from 'expo-symbols'
import { color, font } from './theme'

export function BrandStripe() {
  return (
    <View style={styles.stripe}>
      {color.google.map((bg) => (
        <View key={bg} style={[styles.stripeSlice, { backgroundColor: bg }]} />
      ))}
    </View>
  )
}

export function Wordmark() {
  return (
    <View style={styles.wordmark}>
      <Image source={require('../assets/brand-mark.png')} style={styles.mark} />
      <View style={styles.wordmarkTextRow}>
        <Text style={styles.wordmarkText}>Ternak</Text>
        <Text style={[styles.wordmarkText, styles.wordmarkEm]}>Review</Text>
      </View>
    </View>
  )
}

export function AlertBanner({
  variant = 'danger',
  children,
}: {
  variant?: 'danger' | 'success'
  children: ReactNode
}) {
  return (
    <View
      style={[
        styles.alert,
        variant === 'success' ? styles.alertOk : styles.alertDanger,
      ]}
    >
      <Text
        style={[
          styles.alertText,
          variant === 'success' ? styles.alertOkText : styles.alertDangerText,
        ]}
      >
        {children}
      </Text>
    </View>
  )
}

export const Field = forwardRef<TextInput, TextInputProps>(function Field(
  { style, ...props },
  ref,
) {
  return (
    <TextInput
      placeholderTextColor={color.mutedForeground}
      ref={ref}
      style={[styles.input, style]}
      {...props}
    />
  )
})

export function PasswordField({
  value,
  onChangeText,
  onSubmitEditing,
  placeholder = 'Password',
}: {
  value: string
  onChangeText: (text: string) => void
  onSubmitEditing?: () => void
  placeholder?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <View style={styles.passwordWrap}>
      <TextInput
        autoCapitalize="none"
        autoComplete="password"
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={color.mutedForeground}
        returnKeyType="go"
        secureTextEntry={!visible}
        style={[styles.input, styles.passwordInput]}
        textContentType="password"
        value={value}
      />
      <Pressable
        accessibilityLabel={
          visible ? 'Sembunyikan password' : 'Tampilkan password'
        }
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => setVisible((open) => !open)}
        style={({ pressed }) => [styles.eyeBtn, pressed && { opacity: 0.7 }]}
      >
        <SymbolView
          name={
            visible
              ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }
              : { ios: 'eye', android: 'visibility', web: 'visibility' }
          }
          size={22}
          tintColor={color.mutedForeground}
          weight="medium"
        />
      </Pressable>
    </View>
  )
}

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct}%` }]} />
    </View>
  )
}

export function PulseDot() {
  const opacity = useRef(new Animated.Value(0.5)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])
  return <Animated.View style={[styles.pulse, { opacity }]} />
}

export function PillButton({
  label,
  onPress,
  disabled,
  busy,
  variant = 'primary',
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  busy?: boolean
  variant?: 'primary' | 'outline'
}) {
  const outline = variant === 'outline'
  return (
    <Pressable
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        outline ? styles.pillOutline : styles.pillPrimary,
        (disabled || busy) && styles.disabled,
        pressed && !disabled && { opacity: 0.88 },
      ]}
    >
      <View style={styles.pillInner}>
        {busy ? (
          <ActivityIndicator
            color={outline ? color.foreground : color.primaryForeground}
          />
        ) : null}
        <Text style={outline ? styles.pillOutlineText : styles.pillPrimaryText}>
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  stripe: { flexDirection: 'row', height: 3, width: '100%' },
  stripeSlice: { flex: 1 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 22, height: 22, borderRadius: 4 },
  wordmarkTextRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  wordmarkText: {
    fontFamily: font.sansMedium,
    fontSize: 22,
    letterSpacing: -0.6,
    color: color.foreground,
  },
  wordmarkEm: {
    fontFamily: font.sansItalic,
    fontWeight: '400',
    color: color.pine,
  },
  alert: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  alertDanger: { backgroundColor: color.destructiveBg },
  alertOk: { backgroundColor: color.successBg },
  alertText: { fontFamily: font.sans, fontSize: 14, lineHeight: 20 },
  alertDangerText: { color: color.destructive },
  alertOkText: { color: color.success },
  input: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.input,
    backgroundColor: color.card,
    paddingHorizontal: 12,
    fontFamily: font.sans,
    fontSize: 16,
    color: color.foreground,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.input,
    backgroundColor: color.card,
    paddingRight: 4,
  },
  passwordInput: {
    flex: 1,
    borderWidth: 0,
    height: 44,
  },
  eyeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    minHeight: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pillPrimary: { backgroundColor: color.primary },
  pillOutline: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.input,
  },
  pillPrimaryText: {
    fontFamily: font.sans,
    fontSize: 14,
    color: color.primaryForeground,
  },
  pillOutlineText: {
    fontFamily: font.sans,
    fontSize: 14,
    color: color.foreground,
  },
  disabled: { opacity: 0.5 },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: color.muted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: color.foreground,
  },
  pulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: color.accent,
  },
})
