import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useCameraPermissions } from 'expo-camera'
import Ionicons from '@expo/vector-icons/Ionicons'
import Scanner from './src/components/Scanner'
import ResultOverlay from './src/components/ResultOverlay'
import SitePicker from './src/components/SitePicker'
import LockScreen from './src/components/LockScreen'
import HomeScreen from './src/components/HomeScreen'
import MacBindScreen from './src/components/MacBindScreen'
import ServerConfigScreen from './src/components/ServerConfigScreen'
import { useScannerSession } from './src/lib/site'
import { postScan, fetchPublicSettings, logout as apiLogout, getServerConfig } from './src/api/client'
import { ThemeProvider, useTheme, radii, spacing, darkColors } from './src/lib/theme'

const COOLDOWN_MS = 3000

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}

function AppInner() {
  const { colors, mode } = useTheme()
  const styles = makeStyles(colors)

  const { session, save, clearLogin, loaded: sessionLoaded } = useScannerSession()
  const { deviceMac, manager, device, camp } = session

  const [pickerOpen, setPickerOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()
  const [decision, setDecision] = useState(null)
  const [busy, setBusy] = useState(false)
  const [brand, setBrand] = useState(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [serverConfig, setServerConfig] = useState(null)
  const [serverLoaded, setServerLoaded] = useState(false)
  const [serverOpen, setServerOpen] = useState(false) // re-open from elsewhere
  const lastScan = useRef({ code: null, at: 0 })

  useEffect(() => {
    let alive = true
    getServerConfig().then((cfg) => {
      if (!alive) return
      setServerConfig(cfg)
      setServerLoaded(true)
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!serverConfig) return
    fetchPublicSettings().then(setBrand).catch(() => {})
  }, [serverConfig])

  // Logging out drops the manager (and token) but keeps the device's MAC.
  const handleLock = async () => {
    setScannerOpen(false)
    await apiLogout()
    await clearLogin()
  }

  const handlePickManager = async (m) => {
    setPickerOpen(false)
    await apiLogout()
    await save({ manager: { ...m, _pending: true } })
  }

  const handleUnlock = async (loginResult) => {
    await save({
      manager: loginResult.manager,
      device: loginResult.device ?? device,
      camp: loginResult.camp ?? camp,
    })
  }

  // We treat "manager set with _pending: true" as picked-but-not-yet-unlocked.
  const isLocked = !!manager?._pending || !manager

  const handleDecode = useCallback(async (code) => {
    const now = Date.now()
    if (busy || isLocked || !deviceMac) return
    if (lastScan.current.code === code && now - lastScan.current.at < COOLDOWN_MS) return
    lastScan.current = { code, at: now }

    setBusy(true)
    try {
      const data = await postScan(code, deviceMac)
      setDecision(data)
    } catch (e) {
      setDecision({ status: 'error', reason: 'network' })
    }
  }, [busy, isLocked, deviceMac])

  const closeDecision = useCallback(() => {
    setDecision(null)
    setBusy(false)
    lastScan.current = { code: null, at: 0 }
  }, [])

  const closeManual = useCallback(() => {
    setManualOpen(false)
    setManualCode('')
  }, [])

  const submitManual = useCallback(() => {
    const code = manualCode.trim()
    if (!code) return
    closeManual()
    handleDecode(code)
  }, [manualCode, handleDecode, closeManual])

  const openScanner = useCallback(async () => {
    if (!permission?.granted) {
      const res = await requestPermission()
      if (!res?.granted) return
    }
    setScannerOpen(true)
  }, [permission, requestPermission])

  const sbStyle = mode === 'light' ? 'dark' : 'light'

  if (!sessionLoaded || !serverLoaded || !permission) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  // First-ever launch (or operator tapped "change server"): pick host + port.
  if (!serverConfig || serverOpen) {
    return (
      <View style={styles.root}>
        <StatusBar style={sbStyle} />
        <ServerConfigScreen
          initial={serverConfig ?? undefined}
          onSaved={async (cfg) => {
            // Switching servers invalidates the old login.
            await apiLogout()
            await clearLogin()
            setServerConfig(cfg)
            setServerOpen(false)
          }}
          onCancel={serverConfig ? () => setServerOpen(false) : undefined}
        />
      </View>
    )
  }

  // First launch: no MAC bound → MAC entry screen.
  if (!deviceMac) {
    return (
      <View style={styles.root}>
        <StatusBar style={sbStyle} />
        <MacBindScreen
          onBound={async ({ deviceMac: mac, device: d, camp: c }) => {
            await save({ deviceMac: mac, device: d, camp: c })
          }}
        />
      </View>
    )
  }

  // No manager picked, or operator tapped "change manager" → picker.
  if (!manager || pickerOpen) {
    return (
      <View style={styles.root}>
        <StatusBar style={sbStyle} />
        <SitePicker
          currentId={manager?.id ?? null}
          onPick={handlePickManager}
          onCancel={manager ? () => setPickerOpen(false) : undefined}
          onChangeServer={() => setServerOpen(true)}
        />
      </View>
    )
  }

  // Manager picked but PIN not yet entered → lock screen.
  if (isLocked) {
    return (
      <View style={styles.root}>
        <StatusBar style={sbStyle} />
        <LockScreen
          manager={manager}
          deviceMac={deviceMac}
          onUnlock={handleUnlock}
        />
      </View>
    )
  }

  // Scanner screen — opened by tapping SCAN on Home (always dark over camera)
  if (scannerOpen) {
    if (!permission.granted) {
      return (
        <SafeAreaView style={[styles.root, styles.center, { padding: spacing.xl }]}>
          <StatusBar style={sbStyle} />
          <Text style={styles.permTitle}>Camera permission needed</Text>
          <Text style={styles.permBody}>
            MealPass needs the camera to scan employee QR codes.
          </Text>
          <Pressable onPress={requestPermission} style={({ pressed }) => [styles.permBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.permBtnText}>Grant camera access</Text>
          </Pressable>
          <Pressable onPress={() => setScannerOpen(false)} style={({ pressed }) => [styles.permCancel, pressed && { opacity: 0.7 }]}>
            <Text style={styles.permCancelText}>Back to home</Text>
          </Pressable>
        </SafeAreaView>
      )
    }

    return (
      <View style={scannerStyles.root}>
        <StatusBar style="light" />

        <Scanner onDecode={handleDecode} paused={busy || manualOpen} />

        <SafeAreaView style={scannerStyles.headerSafe}>
          <View style={scannerStyles.scannerHeader}>
            <Pressable
              onPress={() => setScannerOpen(false)}
              style={({ pressed }) => [scannerStyles.closeBtn, pressed && { opacity: 0.75 }]}
              android_ripple={{ color: darkColors.surfaceContainerHigh, borderless: true }}
              hitSlop={16}
            >
              <Ionicons name="close" size={24} color={darkColors.onSurface} />
            </Pressable>
          </View>
        </SafeAreaView>

        <SafeAreaView style={scannerStyles.bottomSafe} pointerEvents="box-none">
          <Pressable
            onPress={() => setManualOpen(true)}
            style={({ pressed }) => [scannerStyles.manualBtn, pressed && { opacity: 0.85 }]}
            android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
          >
            <Ionicons name="keypad-outline" size={18} color="#fff" />
            <Text style={scannerStyles.manualBtnText}>Enter Code Manually</Text>
          </Pressable>
        </SafeAreaView>

        <ResultOverlay decision={decision} onClose={closeDecision} />

        <Modal
          visible={manualOpen}
          transparent
          animationType="fade"
          onRequestClose={closeManual}
          statusBarTranslucent
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={scannerStyles.manualBackdrop}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={closeManual} />
            <View style={scannerStyles.manualCard}>
              <Text style={scannerStyles.manualTitle}>Enter Employee Code</Text>
              <Text style={scannerStyles.manualHint}>
                Type the code printed on the employee's ID.
              </Text>
              <TextInput
                value={manualCode}
                onChangeText={setManualCode}
                placeholder="e.g. EMP-1234"
                placeholderTextColor={darkColors.textMuted}
                style={scannerStyles.manualInput}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={submitManual}
              />
              <View style={scannerStyles.manualBtnRow}>
                <Pressable
                  onPress={closeManual}
                  style={({ pressed }) => [scannerStyles.manualCancel, pressed && { opacity: 0.7 }]}
                >
                  <Text style={scannerStyles.manualCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={submitManual}
                  disabled={!manualCode.trim()}
                  style={({ pressed }) => [
                    scannerStyles.manualSubmit,
                    !manualCode.trim() && { opacity: 0.5 },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={scannerStyles.manualSubmitText}>Submit</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    )
  }

  // Build a `site`-shaped object so HomeScreen renders without modification:
  // header shows "{Manager name} · {camp code}".
  const homeSite = {
    id: manager.id,
    name: camp ? `${manager.name} · ${camp.code}` : manager.name,
    site_code: camp?.code ?? manager.campCode,
    has_pin: true,
  }

  // Default: Home dashboard
  return (
    <View style={styles.root}>
      <StatusBar style={sbStyle} />
      <HomeScreen
        key={mode}
        site={homeSite}
        brand={brand}
        onScan={openScanner}
        onChangeSite={() => setPickerOpen(true)}
        onLock={handleLock}
        canLock={true}
      />
    </View>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  permTitle: { color: colors.onSurface, fontSize: 22, fontWeight: '700', marginBottom: spacing.sm, textAlign: 'center' },
  permBody: { color: colors.onSurfaceVariant, fontSize: 14, textAlign: 'center', marginBottom: spacing.lg },
  permBtn: {
    backgroundColor: colors.primaryAccent,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
  },
  permBtnText: { color: '#fff', fontWeight: '700' },
  permCancel: {
    marginTop: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  permCancelText: { color: colors.onSurfaceVariant, fontSize: 13 },
})

// Scanner-screen styles always use the dark palette (camera always on dark bg).
const scannerStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.background },
  headerSafe: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, elevation: 30 },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(23,31,51,0.95)',
    borderWidth: 1,
    borderColor: darkColors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 31,
    elevation: 31,
  },
  bottomSafe: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: spacing.lg,
    zIndex: 30,
    elevation: 30,
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(23,31,51,0.95)',
    borderWidth: 1,
    borderColor: darkColors.outlineVariant,
    overflow: 'hidden',
  },
  manualBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  manualBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  manualCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1f2937',
    borderRadius: radii.xl,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  manualTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  manualHint: { color: darkColors.onSurfaceVariant, fontSize: 13, marginTop: 4 },
  manualInput: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: darkColors.outlineVariant,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    letterSpacing: 1,
  },
  manualBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  manualCancel: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.pill,
  },
  manualCancelText: { color: darkColors.onSurfaceVariant, fontSize: 14, fontWeight: '600' },
  manualSubmit: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: darkColors.primaryAccent,
  },
  manualSubmitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
})
