import { useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { fetchDeviceByMac } from '../api/client'
import { useTheme, radii, spacing } from '../lib/theme'

const MAC_REGEX = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/

// Auto-uppercase + insert colons as the operator types.
function formatMac(raw) {
  const hex = raw.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().slice(0, 12)
  return hex.match(/.{1,2}/g)?.join(':') ?? hex
}

// Shown once on first launch. The operator types the MAC printed on the
// back of the Zebra device; we verify it against the mealtrack-pro devices
// table, then persist it. Subsequent launches skip this screen entirely.
export default function MacBindScreen({ onBound }) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const styles = makeStyles(colors, insets)

  const [mac, setMac] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const valid = MAC_REGEX.test(mac)

  const verify = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const data = await fetchDeviceByMac(mac)
      if (!data) {
        setError('This MAC is not registered. Ask an admin to register the device in the web app first.')
        return
      }
      setInfo(data)
    } catch (e) {
      setError('Could not reach the server. Check the API URL and Wi-Fi.')
    } finally {
      setBusy(false)
    }
  }

  const confirm = () => {
    if (!info) return
    onBound({ deviceMac: mac, device: info.device, camp: info.camp })
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.wrap}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.badge}>
          <Ionicons name="hardware-chip-outline" size={36} color={colors.primary} />
        </View>

        <Text style={styles.title}>Bind this scanner</Text>
        <Text style={styles.subtitle}>
          Enter the MAC address printed on the back of this device. It links the
          scanner to its camp.
        </Text>

        <TextInput
          value={mac}
          onChangeText={(v) => { setMac(formatMac(v)); setInfo(null); setError(null) }}
          placeholder="AA:BB:CC:11:22:33"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          editable={!busy}
          maxLength={17}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        {info && (
          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Ionicons name="phone-portrait-outline" size={16} color={colors.primary} />
              <Text style={styles.infoLabel}>Device</Text>
              <Text style={styles.infoValue}>{info.device?.name ?? '—'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="business-outline" size={16} color={colors.primary} />
              <Text style={styles.infoLabel}>Camp</Text>
              <Text style={styles.infoValue}>
                {info.camp ? `${info.camp.code} — ${info.camp.name}` : '—'}
              </Text>
            </View>
          </View>
        )}

        {!info ? (
          <Pressable
            onPress={verify}
            disabled={!valid || busy}
            style={({ pressed }) => [
              styles.cta,
              (!valid || busy) && styles.ctaDisabled,
              pressed && styles.ctaPressed,
            ]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="search" size={18} color="#fff" />
                <Text style={styles.ctaText}>Verify</Text>
              </>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={confirm}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.ctaText}>Use this device</Text>
          </Pressable>
        )}

        <Text style={styles.hint}>
          MAC is set once per device. You can change it later by reinstalling
          or via a hidden long-press on the supplier picker.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const makeStyles = (colors, insets) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: insets.top + spacing.xl,
    paddingBottom: insets.bottom + spacing.xl,
    alignItems: 'center',
  },
  badge: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.onSurface,
    fontSize: 22, fontWeight: '700', letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 14, textAlign: 'center',
    marginTop: spacing.sm, marginBottom: spacing.xl,
  },
  input: {
    width: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1, borderColor: colors.outlineVariant,
    color: colors.onSurface,
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 2,
    textAlign: 'center',
  },
  error: {
    color: colors.danger, fontSize: 13, fontWeight: '600',
    marginTop: spacing.sm, textAlign: 'center',
  },
  infoBox: {
    width: '100%',
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.outlineVariant,
    gap: spacing.sm,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoLabel: { color: colors.onSurfaceVariant, fontSize: 12, width: 56 },
  infoValue: { color: colors.onSurface, fontSize: 13, fontWeight: '600', flex: 1 },
  cta: {
    marginTop: spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryAccent,
    minWidth: 200,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaPressed: { opacity: 0.85 },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  hint: {
    color: colors.textMuted,
    fontSize: 11, textAlign: 'center',
    marginTop: spacing.lg, paddingHorizontal: spacing.md,
  },
})
