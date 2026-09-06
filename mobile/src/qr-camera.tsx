import { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { color, font } from './theme'
import { PillButton } from './ui'

export function QrCamera({
  onCode,
  paused,
}: {
  onCode: (raw: string) => void
  paused?: boolean
}) {
  const [permission, requestPermission] = useCameraPermissions()
  const [armed, setArmed] = useState(false)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  if (!permission) {
    return null
  }

  if (!permission.granted) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>
          Izinkan kamera, atau scan pakai kotak di bawah.
        </Text>
        {permission.canAskAgain ? (
          <PillButton
            label="Izinkan kamera"
            onPress={() => void requestPermission()}
            variant="outline"
          />
        ) : null}
      </View>
    )
  }

  if (!armed) {
    return (
      <PillButton
        label="Nyalakan kamera"
        onPress={() => setArmed(true)}
        variant="outline"
      />
    )
  }

  return (
    <View collapsable={false} style={styles.frame}>
      <CameraView
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        facing="back"
        onBarcodeScanned={
          paused
            ? undefined
            : ({ data }) => {
                const raw = data?.trim()
                if (raw) onCodeRef.current(raw)
              }
        }
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: {
    borderRadius: 16,
    backgroundColor: color.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  fallbackText: {
    fontFamily: font.sans,
    fontSize: 14,
    lineHeight: 20,
    color: color.mutedForeground,
  },
  frame: {
    width: '100%',
    aspectRatio: 4 / 3,
    minHeight: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: color.card,
  },
})
