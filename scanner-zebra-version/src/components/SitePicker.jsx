import { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { fetchManagers } from '../api/client'
import { useTheme, radii, spacing } from '../lib/theme'

// Camp-manager picker. Keeps the SitePicker name and `onPick(item)` callback so
// App.js doesn't have to special-case it. Each item is
// { id, username, name, campCode, avatar }.
export default function SitePicker({ currentId = null, onPick, onCancel, onChangeServer }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const list = await fetchManagers()
      setItems(list)
    } catch {
      setError('Could not load managers. Check network.')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Select manager</Text>
            <Text style={styles.subtitle}>Pick the camp manager operating this scanner.</Text>
          </View>
          <Pressable
            onPress={load}
            disabled={refreshing}
            hitSlop={8}
            style={({ pressed }) => [
              styles.reloadBtn,
              refreshing && { opacity: 0.6 },
              pressed && { opacity: 0.7 },
            ]}
            android_ripple={{ color: colors.surfaceContainerHigh, borderless: true }}
          >
            {refreshing ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Ionicons name="refresh" size={20} color={colors.primary} />
            )}
          </Pressable>
        </View>

        {items === null && !error && (
          <View style={styles.state}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {items && items.length === 0 && (
          <Text style={styles.empty}>
            No managers with a PIN yet. Set one on a Camp Manager in the admin panel.
          </Text>
        )}

        {items && items.length > 0 && (
          <ScrollView style={styles.list} contentContainerStyle={{ gap: spacing.sm }}>
            {items.map((m) => {
              const isCurrent = currentId === m.id
              return (
                <Pressable
                  key={m.id}
                  onPress={() => onPick(m)}
                  style={({ pressed }) => [
                    styles.row,
                    isCurrent && styles.rowActive,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{m.name}</Text>
                    <Text style={styles.rowCode}>{m.campCode} · @{m.username}</Text>
                  </View>
                  {isCurrent && <Text style={styles.check}>✓</Text>}
                </Pressable>
              )
            })}
          </ScrollView>
        )}

        <View style={styles.footerRow}>
          {onChangeServer && (
            <Pressable
              onPress={onChangeServer}
              style={({ pressed }) => [styles.footerLink, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="cloud-outline" size={14} color={colors.onSurfaceVariant} />
              <Text style={styles.footerLinkText}>Change server</Text>
            </Pressable>
          )}
          {onCancel && (
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 100,
  },
  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { color: colors.onSurfaceVariant, fontSize: 14, marginTop: 4 },
  reloadBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  state: { paddingVertical: spacing.xl, alignItems: 'center' },
  error: { color: colors.danger, textAlign: 'center', paddingVertical: spacing.xl },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
  list: { maxHeight: 360 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  rowActive: { borderColor: colors.primary, backgroundColor: colors.surfaceContainerHigh },
  rowPressed: { backgroundColor: colors.surfaceContainerHigh },
  rowName: { color: colors.onSurface, fontSize: 16, fontWeight: '600' },
  rowCode: { color: colors.textMuted, fontSize: 11, marginTop: 2, letterSpacing: 0.5 },
  check: { color: colors.primary, fontSize: 20, fontWeight: '700' },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  footerLinkText: { color: colors.onSurfaceVariant, fontSize: 12 },
  cancel: {
    marginLeft: 'auto',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radii.md,
  },
  cancelText: { color: colors.onSurfaceVariant, fontSize: 14 },
})
