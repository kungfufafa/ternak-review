import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { color, font } from './theme'
import { BrandStripe, Wordmark } from './ui'

export function AppShell({
  children,
  onLogout,
  right,
}: {
  children: ReactNode
  onLogout?: () => void
  right?: ReactNode
}) {
  return (
    <View style={styles.screen}>
      <BrandStripe />
      <SafeAreaView style={styles.flex}>
        <View style={styles.topBar}>
          <Wordmark />
          {right ??
            (onLogout ? (
              <Pressable onPress={onLogout}>
                <Text style={styles.navLink}>Keluar</Text>
              </Pressable>
            ) : (
              <View />
            ))}
        </View>
        {children}
      </SafeAreaView>
      <StatusBar style="dark" />
    </View>
  )
}

export function AppUrlBanner({
  info,
}: {
  info: {
    url: string
    isLocal: boolean
    isHttps: boolean
  }
}) {
  const warn = info.isLocal || !info.isHttps
  return (
    <View style={[styles.banner, warn ? styles.bannerDanger : styles.bannerCard]}>
      <Text style={[styles.bannerText, warn && styles.bannerDangerText]}>
        {warn
          ? `QR dan NFC akan mengarah ke ${info.url}. Set APP_URL ke HTTPS produksi sebelum cetak atau tulis chip — kartu yang sudah jadi tidak ikut pindah domain.`
          : `QR dan NFC memakai ${info.url}`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: color.background },
  topBar: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navLink: {
    fontFamily: font.sans,
    fontSize: 14,
    color: color.mutedForeground,
  },
  banner: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  bannerCard: { backgroundColor: color.muted },
  bannerDanger: { backgroundColor: color.destructiveBg },
  bannerText: {
    fontFamily: font.sans,
    fontSize: 14,
    lineHeight: 20,
    color: color.foreground,
  },
  bannerDangerText: { color: color.destructive },
})
