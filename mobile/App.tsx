import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import {
  InterTight_400Regular,
  InterTight_400Regular_Italic,
  InterTight_500Medium,
} from '@expo-google-fonts/inter-tight'
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono'
import { fetchMe, login, logout } from './src/api'
import { NfcScreen } from './src/nfc-screen'
import { StockScreen } from './src/stock-screen'
import { AppShell } from './src/shell'
import { color, font } from './src/theme'
import { AlertBanner, BrandStripe, Field, PasswordField, PillButton } from './src/ui'

type Mode = 'boot' | 'login' | 'nfc' | 'stock'

export default function App() {
  const [fontsLoaded] = useFonts({
    InterTight_400Regular,
    InterTight_400Regular_Italic,
    InterTight_500Medium,
    IBMPlexMono_500Medium,
  })
  const [mode, setMode] = useState<Mode>('boot')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batchId, setBatchId] = useState<string | null>(null)

  useEffect(() => {
    if (!fontsLoaded) return
    void (async () => {
      try {
        await fetchMe()
        setMode('nfc')
      } catch {
        setMode('login')
      }
    })()
  }, [fontsLoaded])

  async function onLogin() {
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
      setPassword('')
      setMode('nfc')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk.')
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    try {
      await logout()
    } finally {
      setBatchId(null)
      setMode('login')
    }
  }

  if (!fontsLoaded || mode === 'boot') {
    return (
      <View style={styles.boot}>
        <BrandStripe />
        <View style={styles.bootBody}>
          <ActivityIndicator color={color.pine} />
        </View>
        <StatusBar style="dark" />
      </View>
    )
  }

  if (mode === 'login') {
    return (
      <AppShell>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.loginBody}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.titleBlock}>
              <Text style={styles.pageTitle}>
                Masuk <Text style={styles.em}>admin</Text>
              </Text>
              <Text style={styles.lede}>
                Produksi kartu dan tulis NFC ke stiker NTAG215, sama seperti di
                web.
              </Text>
            </View>
            {error ? <AlertBanner>{error}</AlertBanner> : null}
            <View style={styles.stack}>
              <Field
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="Email"
                value={email}
              />
              <PasswordField
                onChangeText={setPassword}
                onSubmitEditing={() => void onLogin()}
                placeholder="Password"
                value={password}
              />
              <PillButton
                busy={busy}
                disabled={email.length < 3 || password.length < 6}
                label="Masuk"
                onPress={() => void onLogin()}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </AppShell>
    )
  }

  if (mode === 'stock') {
    return (
      <StockScreen
        onLogout={() => void onLogout()}
        onNfc={(id) => {
          setBatchId(id)
          setMode('nfc')
        }}
      />
    )
  }

  return (
    <NfcScreen
      batchId={batchId}
      onLogout={() => void onLogout()}
      onProduksi={() => setMode('stock')}
    />
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  boot: { flex: 1, backgroundColor: color.background },
  bootBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loginBody: {
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 40,
    gap: 24,
  },
  titleBlock: { gap: 8 },
  pageTitle: {
    fontFamily: font.sans,
    fontSize: 32,
    letterSpacing: -0.8,
    color: color.foreground,
  },
  em: {
    fontFamily: font.sansItalic,
    color: color.pine,
  },
  lede: {
    fontFamily: font.sans,
    fontSize: 15,
    lineHeight: 22,
    color: color.mutedForeground,
    maxWidth: 360,
  },
  stack: { gap: 12 },
})
