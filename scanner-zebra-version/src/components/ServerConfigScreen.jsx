import { useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { pingServer, saveServerConfig } from '../api/client'
import { useTheme, radii, spacing } from '../lib/theme'

// First-launch screen. Operator enters the backend host/port; we ping
// /api/health before persisting. Re-openable from elsewhere if `initial` is
// passed (operator can change the server later).
export default function ServerConfigScreen({ initial, onSaved, onCancel }) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const styles = makeStyles(colors, insets)

  // Defaults pre-filled to reduce typing on the Zebra. Operator can overwrite.
  const [host, setHost] = useState(initial?.host ?? '139.59.69.241')
  const [port, setPort] = useState(initial?.port ?? '5044')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [tested, setTested] = useState(false)

  const valid = host.trim().length > 0 && /^\d{2,5}$/.test(String(port).trim())

  const test = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    setTested(false)
    try {
      const data = await pingServer({ host: host.trim(), port: String(port).trim() })
      if (data?.ok) {
        setTested(true)
      } else {
        setError('Server replied but did not look like MyMeals.')
      }
    } catch (e) {
      const reason = e?.code === 'ECONNABORTED' ? 'Connection timed out.'
        : e?.message?.includes('Network') ? 'Cannot reach the server. Check Wi-Fi.'
        : `Could not reach http://${host}:${port}`
      setError(reason)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      // Always re-test on save in case the operator edited the fields after
      // hitting Test — we never want to persist an unreachable config.
      const data = await pingServer({ host: host.trim(), port: String(port).trim() })
      if (!data?.ok) {
        setError('Server replied but did not look like MyMeals.')
        return
      }
      const cfg = await saveServerConfig({ host: host.trim(), port: String(port).trim() })
      onSaved(cfg)
    } catch (e) {
      setError(`Could not reach http://${host}:${port}`)
    } finally {
      setBusy(false)
    }
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
          <Ionicons name="cloud-outline" size={36} color={colors.primary} />
        </View>

        <Text style={styles.title}>Connect to server</Text>
        <Text style={styles.subtitle}>
          Enter the IP/hostname and port where the MyMeals backend is running.
        </Text>

        <View style={styles.row}>
          <View style={styles.fieldHost}>
            <Text style={styles.label}>HOST / IP</Text>
            <TextInput
              value={host}
              onChangeText={(v) => { setHost(v); setTested(false); setError(null) }}
              placeholder="192.168.1.159"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              keyboardType="url"
              editable={!busy}
            />
          </View>
          <View style={styles.fieldPort}>
            <Text style={styles.label}>PORT</Text>
            <TextInput
              value={port}
              onChangeText={(v) => { setPort(v.replace(/\D/g, '').slice(0, 5)); setTested(false); setError(null) }}
              placeholder="5044"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              keyboardType="number-pad"
              editable={!busy}
              maxLength={5}
            />
          </View>
        </View>

        <Text style={styles.url} numberOfLines={1}>
          http://{host || '—'}:{port || '—'}/api
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}
        {tested && !error && (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.successText}>Server reachable. Tap Continue to save.</Text>
          </View>
        )}

        <View style={styles.btnRow}>
          <Pressable
            onPress={test}
            disabled={!valid || busy}
            style={({ pressed }) => [
              styles.btnSecondary,
              (!valid || busy) && { opacity: 0.4 },
              pressed && { opacity: 0.7 },
            ]}
          >
            {busy && !tested ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <>
                <Ionicons name="pulse" size={16} color={colors.primary} />
                <Text style={styles.btnSecondaryText}>Test</Text>
              </>
            )}
          </Pressable>
          <Pressable
            onPress={save}
            disabled={!valid || busy}
            style={({ pressed }) => [
              styles.btnPrimary,
              (!valid || busy) && { opacity: 0.4 },
              pressed && { opacity: 0.85 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
                <Text style={styles.btnPrimaryText}>Continue</Text>
              </>
            )}
          </Pressable>
        </View>

        {onCancel && (
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        )}

        <Text style={styles.hint}>
          Hint: on Wi-Fi the IP often looks like 192.168.x.x. The backend default
          port is 5044.
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
  row: {
    flexDirection: 'row',
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  fieldHost: { flex: 2 },
  fieldPort: { flex: 1 },
  label: {
    color: colors.onSurfaceVariant,
    fontSize: 11, letterSpacing: 1,
    marginBottom: 4, fontWeight: '600',
  },
  input: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1, borderColor: colors.outlineVariant,
    color: colors.onSurface,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  url: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  error: {
    color: colors.danger, fontSize: 13, fontWeight: '600',
    textAlign: 'center', marginBottom: spacing.sm,
  },
  successBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    marginBottom: spacing.sm,
    alignSelf: 'stretch',
  },
  successText: { color: colors.success, fontSize: 13, fontWeight: '600' },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    marginTop: spacing.md,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14,
    borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.primary,
    backgroundColor: colors.surfaceContainerLow,
  },
  btnSecondaryText: { color: colors.primary, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  btnPrimary: {
    flex: 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryAccent,
  },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  cancel: {
    marginTop: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  cancelText: { color: colors.onSurfaceVariant, fontSize: 13 },
  hint: {
    color: colors.textMuted,
    fontSize: 11, textAlign: 'center',
    marginTop: spacing.lg, paddingHorizontal: spacing.md,
  },
})
