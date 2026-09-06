import { useEffect, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  deleteStock,
  fetchNfcSession,
  generateStock,
  type AppUrlInfo,
  type StockBatch,
} from './api'
import { API_URL } from './config'
import { ProductionSteps } from './production-steps'
import { AppShell, AppUrlBanner } from './shell'
import { color, font } from './theme'
import { AlertBanner, Field, PillButton } from './ui'

const PRESETS = [25, 50, 100, 250, 500] as const

export function StockScreen({
  onLogout,
  onNfc,
}: {
  onLogout: () => void
  onNfc: (batchId: string | null) => void
}) {
  const [count, setCount] = useState(100)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [lastBatchId, setLastBatchId] = useState<string | null>(null)
  const [lastCount, setLastCount] = useState<number | null>(null)
  const [batches, setBatches] = useState<StockBatch[]>([])
  const [appUrl, setAppUrl] = useState<AppUrlInfo | null>(null)

  const presetValue = PRESETS.includes(count as (typeof PRESETS)[number])
    ? count
    : null
  const made = lastCount ?? count

  async function load() {
    const session = await fetchNfcSession()
    setAppUrl(session.appUrl)
    setBatches(session.batches)
  }

  useEffect(() => {
    void load().catch((err) => {
      setError(err instanceof Error ? err.message : 'Gagal memuat cetakan.')
    })
  }, [])

  function askGenerate() {
    const safe = Math.min(Math.max(Math.floor(count) || 0, 1), 1000)
    setCount(safe)
    setError(null)
    Alert.alert(
      `Bikin ${safe} QR?`,
      `Kartu akan mengarah ke ${appUrl?.url ?? API_URL}${
        label.trim() ? ` · ${label.trim()}` : ''
      }. Ini tidak bisa dibatalkan kecuali kamu hapus cetakannya.`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: `Bikin ${safe}`, onPress: () => void onGenerate(safe) },
      ],
    )
  }

  async function onGenerate(safeCount: number) {
    setBusy(true)
    setError(null)
    try {
      const res = await generateStock({
        count: safeCount,
        label: label.trim() || undefined,
      })
      setLastBatchId(res.batchId)
      setLastCount(res.count)
      setLabel('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat kartu')
    } finally {
      setBusy(false)
    }
  }

  function askDelete(batch: StockBatch) {
    Alert.alert(
      'Hapus cetakan?',
      `${batch.label} dan kartunya yang masih di gudang akan dihapus.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => void onDelete(batch.id),
        },
      ],
    )
  }

  async function onDelete(id: string) {
    setDeleting(id)
    setError(null)
    try {
      await deleteStock(id)
      if (lastBatchId === id) setLastBatchId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus')
    } finally {
      setDeleting(null)
    }
  }

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
              <Text style={styles.em}>Produksi</Text>
            </Text>
            <Text style={styles.lede}>
              Buat QR → cetak → tulis NFC → tentukan pemegang → aktivasi toko.
            </Text>
          </View>

          <ProductionSteps
            current={lastBatchId ? 2 : 1}
            onStep={(step) => {
              if (step === 3) onNfc(lastBatchId ?? batches[0]?.id ?? null)
            }}
          />

          {appUrl ? <AppUrlBanner info={appUrl} /> : null}
          {error ? <AlertBanner>{error}</AlertBanner> : null}

          {lastBatchId ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{made} QR sudah jadi</Text>
              <Text style={styles.lede}>
                Cetak kartu, lalu tempel NFC dengan HP. Jangan dijual sebelum
                NFC selesai.
              </Text>
              <PillButton
                label="Tempel NFC"
                onPress={() => onNfc(lastBatchId)}
              />
              <Pressable
                onPress={() =>
                  void Linking.openURL(
                    `${API_URL}/admin/stock/print?batch=${lastBatchId}`,
                  )
                }
              >
                <Text style={styles.subtleLink}>Cetak kartu di web</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Berapa kartu?</Text>
            <Text style={styles.lede}>
              Langkah 1: bikin QR. Setelah ini cetak, baru tempel NFC.
            </Text>
            <Text style={styles.label}>Jumlah</Text>
            <View style={styles.presets}>
              {PRESETS.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setCount(n)}
                  style={[
                    styles.preset,
                    presetValue === n && styles.presetOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.presetText,
                      presetValue === n && styles.presetTextOn,
                    ]}
                  >
                    {n}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Field
              keyboardType="number-pad"
              onChangeText={(value) => {
                const next = Number(value)
                if (Number.isFinite(next)) setCount(next)
              }}
              value={String(count)}
            />
            <Text style={styles.label}>Nama cetakan (opsional)</Text>
            <Field
              maxLength={80}
              onChangeText={setLabel}
              placeholder="Contoh: Kirim April"
              value={label}
            />
            <Text style={styles.hint}>
              Biar gampang bedain kalau cetak beberapa kali.
            </Text>
            <PillButton
              busy={busy}
              disabled={busy}
              label={busy ? 'Membuat QR…' : `Bikin ${count} QR`}
              onPress={askGenerate}
            />
          </View>

          <Text style={styles.sectionTitle}>Cetakan & status kartu</Text>
          <Text style={styles.lede}>
            Progres NFC tercatat per kartu. Jika kartu sudah dicetak, langsung
            lanjut ke NFC.
          </Text>

          {batches.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Belum ada QR</Text>
              <Text style={styles.lede}>
                Pilih jumlah di atas. Setelah QR jadi, cetak dulu.
              </Text>
            </View>
          ) : (
            batches.map((batch) => {
              const left = Math.max(0, batch.remaining - batch.encoded)
              const canDelete =
                batch.active === 0 &&
                batch.inactive === 0 &&
                batch.assigned === 0
              return (
                <View
                  key={batch.id}
                  style={[
                    styles.item,
                    batch.id === lastBatchId && styles.itemActive,
                  ]}
                >
                  <Text style={styles.itemTitle}>{batch.label}</Text>
                  <Text style={styles.meta}>
                    {formatDay(batch.createdAt)} · {batch.remaining} kartu
                    tercatat
                    {batch.remaining !== batch.count
                      ? ` dari ${batch.count}`
                      : ''}
                    {batch.remaining === 0
                      ? ' · cetakan kosong'
                      : batch.next === 'ready'
                        ? ' · NFC selesai'
                        : batch.next === 'nfc'
                          ? ` · ${left} NFC belum ditulis`
                          : ' · NFC belum dimulai'}
                  </Text>
                  {batch.remaining > 0 ? (
                    <Text style={styles.meta}>
                      {batch.available} belum dialokasikan ({batch.readyStock}{' '}
                      NFC tertulis) · {batch.assigned} menunggu aktivasi ·{' '}
                      {batch.active} aktif · {batch.inactive} nonaktif
                    </Text>
                  ) : null}
                  <View style={styles.actions}>
                    {batch.remaining === 0 ? null : batch.next === 'ready' ? (
                      <PillButton
                        label={
                          batch.available > 0 ? 'Atur pemegang' : 'Kelola kartu'
                        }
                        onPress={() =>
                          void Linking.openURL(unitsHref(batch))
                        }
                        variant="outline"
                      />
                    ) : batch.next === 'nfc' ? (
                      <PillButton
                        label="Tempel NFC"
                        onPress={() => onNfc(batch.id)}
                      />
                    ) : (
                      <>
                        <PillButton
                          label="Cetak di web"
                          onPress={() =>
                            void Linking.openURL(
                              `${API_URL}/admin/stock/print?batch=${batch.id}`,
                            )
                          }
                          variant="outline"
                        />
                        <PillButton
                          label="Lanjut NFC"
                          onPress={() => onNfc(batch.id)}
                        />
                      </>
                    )}
                    {canDelete ? (
                      <Pressable
                        disabled={deleting === batch.id}
                        onPress={() => askDelete(batch)}
                      >
                        <Text style={styles.subtleLink}>
                          {deleting === batch.id ? 'Menghapus…' : 'Hapus'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              )
            })
          )}

          <Pressable onPress={() => onNfc(null)}>
            <Text style={styles.subtleLink}>Tempel NFC tanpa pilih cetakan</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppShell>
  )
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function unitsHref(batch: StockBatch) {
  const params = new URLSearchParams({ batch: batch.id })
  if (batch.inStock > 0) params.set('status', 'IN_STOCK')
  if (batch.available > 0) params.set('ownership', 'unassigned')
  return `${API_URL}/dashboard/units?${params.toString()}`
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  card: {
    backgroundColor: color.card,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  cardTitle: {
    fontFamily: font.sansMedium,
    fontSize: 18,
    color: color.foreground,
  },
  label: {
    fontFamily: font.sansMedium,
    fontSize: 13,
    color: color.foreground,
  },
  hint: {
    fontFamily: font.sans,
    fontSize: 13,
    color: color.mutedForeground,
  },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: color.input,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: color.card,
  },
  presetOn: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  presetText: {
    fontFamily: font.sans,
    fontSize: 13,
    color: color.foreground,
  },
  presetTextOn: { color: color.primaryForeground },
  sectionTitle: {
    fontFamily: font.sansMedium,
    fontSize: 16,
    color: color.foreground,
  },
  item: {
    backgroundColor: color.card,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  itemActive: { backgroundColor: color.accent },
  itemTitle: {
    fontFamily: font.sansMedium,
    fontSize: 16,
    color: color.foreground,
  },
  meta: {
    fontFamily: font.sans,
    fontSize: 13,
    lineHeight: 18,
    color: color.mutedForeground,
  },
  actions: { gap: 8, marginTop: 4 },
  subtleLink: {
    fontFamily: font.sans,
    fontSize: 14,
    color: color.mutedForeground,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
})
