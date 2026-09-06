import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  Vibration,
  View,
  type TextInput,
} from 'react-native'
import {
  fetchNfcSession,
  lookupCard,
  markCard,
  type AppUrlInfo,
  type Card,
  type StockBatch,
} from './api'
import { API_URL } from './config'
import {
  friendlyNfcError,
  getNfcStatus,
  openNfcSettings,
  readNfcUrl,
  writeNfcUrl,
} from './nfc'
import { ProductionSteps } from './production-steps'
import { QrCamera } from './qr-camera'
import { AppShell, AppUrlBanner } from './shell'
import { color, font } from './theme'
import { AlertBanner, Field, PillButton, ProgressBar, PulseDot } from './ui'

export function NfcScreen({
  batchId,
  onLogout,
  onProduksi,
}: {
  batchId?: string | null
  onLogout: () => void
  onProduksi: () => void
}) {
  const [nfcOk, setNfcOk] = useState(false)
  const [nfcEnabled, setNfcEnabled] = useState(true)
  const [copied, setCopied] = useState(false)
  const [scan, setScan] = useState('')
  const [card, setCard] = useState<Card | null>(null)
  const [busy, setBusy] = useState(false)
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [sessionDone, setSessionDone] = useState(0)
  const [batches, setBatches] = useState<StockBatch[]>([])
  const [appUrl, setAppUrl] = useState<AppUrlInfo | null>(null)
  const [runEncoded, setRunEncoded] = useState(0)
  const scanRef = useRef<TextInput>(null)
  const lastRaw = useRef('')
  const cardRef = useRef<Card | null>(null)
  const busyRef = useRef(false)
  const writingRef = useRef(false)

  const run = batches.find((batch) => batch.id === batchId) ?? null
  const runCount = run?.remaining ?? 0

  function focusScan() {
    scanRef.current?.focus()
  }

  useEffect(() => {
    cardRef.current = card
  }, [card])

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    writingRef.current = writing
  }, [writing])

  useEffect(() => {
    if (!run) {
      setRunEncoded(0)
      return
    }
    setRunEncoded(run.encoded)
  }, [run?.id])

  useEffect(() => {
    void (async () => {
      const status = await getNfcStatus()
      setNfcOk(status.supported)
      setNfcEnabled(status.enabled)
      try {
        const session = await fetchNfcSession()
        setAppUrl(session.appUrl)
        setBatches(session.batches)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat cetakan.')
      }
      focusScan()
    })()

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      void getNfcStatus().then((status) => {
        setNfcOk(status.supported)
        setNfcEnabled(status.enabled)
      })
    })
    return () => sub.remove()
  }, [])

  async function refreshBatches() {
    try {
      const session = await fetchNfcSession()
      setAppUrl(session.appUrl)
      setBatches(session.batches)
      const next = session.batches.find((batch) => batch.id === batchId)
      if (next) setRunEncoded((n) => Math.max(n, next.encoded))
    } catch {
      // keep local progress if refresh fails
    }
  }

  function celebrate(cardDone: Card, already: boolean) {
    setSessionDone((n) => n + (already ? 0 : 1))
    if (run && !already && cardDone.batchId === run.id) {
      setRunEncoded((n) => Math.min(runCount, n + 1))
    }
    setFlash(cardDone.publicId)
    setCard(null)
    cardRef.current = null
    lastRaw.current = ''
    try {
      Vibration.vibrate(40)
    } catch {
      // ignore
    }
    setTimeout(() => {
      setFlash(null)
      focusScan()
    }, 700)
    void refreshBatches()
  }

  async function identify(raw: string) {
    const ref = raw.trim()
    if (ref.length < 4 || busyRef.current || writingRef.current) return
    if (
      cardRef.current &&
      ref.toUpperCase().includes(cardRef.current.publicId)
    ) {
      return
    }
    if (ref === lastRaw.current) return
    lastRaw.current = ref
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const found = await lookupCard(ref)
      setCard(found)
      setScan('')
    } catch (err) {
      lastRaw.current = ''
      setError(err instanceof Error ? err.message : 'QR tidak dikenali')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function writeCard(target: Card) {
    writingRef.current = true
    setWriting(true)
    setError(null)
    const already = Boolean(target.nfcEncodedAt)
    try {
      await writeNfcUrl(target.redirectUrl)
      await markCard(target.publicId)
      celebrate(target, already)
    } catch (err) {
      setError(friendlyNfcError(err))
    } finally {
      writingRef.current = false
      setWriting(false)
    }
  }

  async function onScanSubmit() {
    const ref = scan.trim()
    if (ref.length < 4 || busyRef.current || writingRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const found = await lookupCard(ref)
      setCard(found)
      setScan('')
      if (nfcOk) {
        busyRef.current = false
        setBusy(false)
        await writeCard(found)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'QR tidak dikenali')
    } finally {
      busyRef.current = false
      setBusy(false)
      focusScan()
    }
  }

  async function onReadTag() {
    if (busyRef.current || writingRef.current) return
    writingRef.current = true
    setWriting(true)
    setError(null)
    try {
      const url = await readNfcUrl()
      if (!url) {
        setError(
          'Stiker kosong atau bukan URL. Scan QR kartu, lalu tulis ulang.',
        )
        return
      }
      writingRef.current = false
      setWriting(false)
      await identify(url)
    } catch (err) {
      setError(friendlyNfcError(err))
    } finally {
      writingRef.current = false
      setWriting(false)
    }
  }

  async function markWritten(target: Card) {
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await markCard(target.publicId)
      celebrate(target, Boolean(target.nfcEncodedAt))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menandai')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const runLeft = run ? Math.max(0, runCount - runEncoded) : null
  const openUnits = run && runLeft === 0 ? completionHref(run) : null

  return (
    <AppShell onLogout={onLogout}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.titleBlock}>
            <Text style={styles.pageTitle}>
              Tempel <Text style={styles.em}>NFC</Text>
            </Text>
            <Text style={styles.lede}>
              Scan QR kartu yang kamu pegang, lalu tulis ke stikernya. Urutan
              acak tidak masalah.
            </Text>
          </View>

          <ProductionSteps
            current={3}
            onStep={(step) => {
              if (step === 1 || step === 2) onProduksi()
            }}
          />

          {appUrl ? <AppUrlBanner info={appUrl} /> : null}

          {nfcOk && !nfcEnabled ? (
            <View style={styles.stack}>
              <AlertBanner>
                NFC HP mati. Nyalakan dulu sebelum tempel.
              </AlertBanner>
              <PillButton
                label="Buka pengaturan NFC"
                onPress={() => void openNfcSettings()}
                variant="outline"
              />
            </View>
          ) : null}

          {run ? (
            <View style={styles.batchBlock}>
              <View style={styles.batchRow}>
                <Text style={styles.meta}>{run.label}</Text>
                <Text style={styles.meta}>
                  {runLeft === 0
                    ? 'Penulisan NFC selesai'
                    : `${runLeft} kartu belum tertulis`}
                </Text>
              </View>
              <ProgressBar
                value={runCount > 0 ? (runEncoded / runCount) * 100 : 0}
              />
              {runLeft === 0 && openUnits ? (
                <View style={styles.doneBox}>
                  <Text style={styles.lede}>
                    Penulisan NFC selesai. Lanjutkan proses sebelum kartu
                    diserahkan ke toko.
                  </Text>
                  <PillButton
                    label={openUnits.label}
                    onPress={() => void Linking.openURL(openUnits.href)}
                  />
                </View>
              ) : null}
            </View>
          ) : sessionDone > 0 ? (
            <Text style={styles.centerHint}>
              {sessionDone} kartu tertulis sesi ini
            </Text>
          ) : null}

          {flash ? (
            <AlertBanner variant="success">
              {flash} sudah ditulis ke NFC. Ambil kartu berikutnya.
            </AlertBanner>
          ) : null}
          {error ? <AlertBanner>{error}</AlertBanner> : null}

          <QrCamera
            onCode={(raw) => void identify(raw)}
            paused={writing || Boolean(card)}
          />

          <View style={styles.inputGroup}>
            <Field
              autoCapitalize="characters"
              autoCorrect={false}
              onChangeText={setScan}
              onSubmitEditing={() => void onScanSubmit()}
              placeholder="Scan QR kartu atau tempel kode"
              ref={scanRef}
              returnKeyType="go"
              style={styles.inputGroupField}
              value={scan}
            />
            <Pressable
              disabled={busy || writing || scan.trim().length < 4}
              onPress={() => void onScanSubmit()}
              style={[
                styles.inputGroupBtn,
                (busy || writing || scan.trim().length < 4) && styles.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={color.foreground} />
              ) : (
                <Text style={styles.inputGroupBtnText}>Pakai</Text>
              )}
            </Pressable>
          </View>

          {card ? (
            <View style={styles.card}>
              {writing ? <PulseDot /> : null}
              <Text style={styles.publicId}>{card.publicId}</Text>
              <Text style={styles.meta}>
                {card.batchLabel ?? 'Kartu'}
                {card.batchSeq ? ` · ${card.batchSeq}` : ''}
                {card.nfcEncodedAt ? ' · sudah pernah, tulis ulang' : ''}
              </Text>
              {nfcOk ? (
                <View style={styles.full}>
                  <PillButton
                    busy={writing}
                    disabled={writing}
                    label={writing ? 'Tempel HP ke stiker' : 'Tempel HP'}
                    onPress={() => void writeCard(card)}
                  />
                </View>
              ) : (
                <View style={styles.fallback}>
                  <Text style={styles.lede}>
                    HP ini tidak punya NFC. Salin URL, tulis lewat NFC Tools,
                    lalu tandai kartu berikutnya.
                  </Text>
                  <Text style={styles.url}>{card.redirectUrl}</Text>
                  <PillButton
                    label={copied ? 'URL tersalin' : 'Salin URL'}
                    onPress={() => void shareUrl(card.redirectUrl, setCopied)}
                    variant="outline"
                  />
                  <PillButton
                    busy={busy}
                    disabled={busy}
                    label="Sudah nulis — kartu berikutnya"
                    onPress={() => void markWritten(card)}
                  />
                </View>
              )}
              <Pressable
                onPress={() => {
                  setCard(null)
                  lastRaw.current = ''
                  focusScan()
                }}
              >
                <Text style={styles.subtleLink}>Bukan kartu ini</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.centerHint}>
              Pegang kartu mana saja. Scan QR-nya — jangan andalkan urutan
              tumpukan.
            </Text>
          )}

          <Pressable disabled={busy || writing} onPress={() => void onReadTag()}>
            <Text style={styles.subtleLink}>Baca stiker yang sudah ada</Text>
          </Pressable>

          <Pressable onPress={onProduksi}>
            <Text style={styles.subtleLink}>Ke produksi</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppShell>
  )
}

function completionHref(run: StockBatch) {
  const params = new URLSearchParams({ batch: run.id })
  if (run.available > 0) {
    params.set('status', 'IN_STOCK')
    params.set('ownership', 'unassigned')
    return { label: 'Tentukan pemegang', href: unitsUrl(params) }
  }
  if (run.assigned > 0) {
    params.set('status', 'IN_STOCK')
    params.set('ownership', 'assigned')
    return { label: 'Lihat aktivasi pemegang', href: unitsUrl(params) }
  }
  return { label: 'Kelola kartu', href: unitsUrl(params) }
}

function unitsUrl(params: URLSearchParams) {
  return `${API_URL}/dashboard/units?${params.toString()}`
}

async function shareUrl(url: string, setCopied: (value: boolean) => void) {
  try {
    await Share.share(
      Platform.OS === 'ios' ? { url, message: url } : { message: url },
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  } catch {
    // user dismissed the sheet
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  full: { width: '100%' },
  body: { paddingHorizontal: 16, paddingBottom: 40, gap: 16 },
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
  },
  meta: {
    fontFamily: font.sans,
    fontSize: 13,
    color: color.mutedForeground,
  },
  batchBlock: { gap: 8 },
  batchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  doneBox: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: color.muted,
    padding: 16,
    gap: 12,
  },
  centerHint: {
    fontFamily: font.sans,
    fontSize: 14,
    lineHeight: 20,
    color: color.mutedForeground,
    textAlign: 'center',
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.input,
    backgroundColor: color.card,
    paddingRight: 6,
  },
  inputGroupField: {
    flex: 1,
    borderWidth: 0,
    height: 44,
  },
  inputGroupBtn: {
    height: 32,
    minWidth: 56,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputGroupBtnText: {
    fontFamily: font.sansMedium,
    fontSize: 13,
    color: color.foreground,
  },
  card: {
    backgroundColor: color.card,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 12,
    alignItems: 'center',
  },
  publicId: {
    fontFamily: font.mono,
    fontSize: 28,
    letterSpacing: 4,
    color: color.foreground,
  },
  url: {
    fontFamily: font.mono,
    fontSize: 11,
    lineHeight: 16,
    color: color.mutedForeground,
    textAlign: 'center',
  },
  fallback: { width: '100%', gap: 12 },
  subtleLink: {
    fontFamily: font.sans,
    fontSize: 14,
    color: color.mutedForeground,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  stack: { gap: 10 },
  disabled: { opacity: 0.45 },
})
