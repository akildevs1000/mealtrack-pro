import { useEffect, useRef } from 'react'
import { StyleSheet, View, Animated, Easing } from 'react-native'
import { CameraView } from 'expo-camera'
import { darkColors as colors, radii } from '../lib/theme'

export default function Scanner({ onDecode, paused }) {
  const scanAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [scanAnim])

  return (
    <View style={styles.wrap}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8'] }}
        onBarcodeScanned={paused ? undefined : ({ data }) => data && onDecode(data)}
      />

      {/* Viewfinder frame */}
      <View style={styles.frame} pointerEvents="none">
        <View style={[styles.corner, styles.tl]} />
        <View style={[styles.corner, styles.tr]} />
        <View style={[styles.corner, styles.bl]} />
        <View style={[styles.corner, styles.br]} />

        <Animated.View
          style={[
            styles.scanline,
            {
              transform: [
                {
                  translateY: scanAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-120, 120],
                  }),
                },
              ],
            },
          ]}
        />
      </View>

    </View>
  )
}

const CORNER = 44
const CORNER_THICK = 4
const FRAME = 260

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  frame: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: FRAME,
    height: FRAME,
    marginLeft: -FRAME / 2,
    marginTop: -FRAME / 2,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: colors.primary,
  },
  tl: { top: -2, left: -2, borderTopWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK, borderTopLeftRadius: radii.lg },
  tr: { top: -2, right: -2, borderTopWidth: CORNER_THICK, borderRightWidth: CORNER_THICK, borderTopRightRadius: radii.lg },
  bl: { bottom: -2, left: -2, borderBottomWidth: CORNER_THICK, borderLeftWidth: CORNER_THICK, borderBottomLeftRadius: radii.lg },
  br: { bottom: -2, right: -2, borderBottomWidth: CORNER_THICK, borderRightWidth: CORNER_THICK, borderBottomRightRadius: radii.lg },
  scanline: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: '50%',
    height: 2,
    backgroundColor: colors.primary,
    opacity: 0.85,
    shadowColor: colors.primary,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
})
