import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Ionicons from '@expo/vector-icons/Ionicons'
import { fetchSiteStats, fetchSiteLogs, fetchPublicMealRules, pictureUrl } from '../api/client'
import { reasonLabel } from '../lib/reasons'
import { initialsFrom, colorFor } from '../lib/avatar'
import { useTheme, radii, spacing } from '../lib/theme'

const REFRESH_MS = 15000
const PAGE_SIZE = 10

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatClockDate(d) {
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatClockTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
}

function parseTimeToMinutes(t) {
  if (!t || typeof t !== 'string') return null
  const parts = t.split(':')
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1] ?? '0', 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function activeMealRule(rules, now) {
  if (!Array.isArray(rules) || rules.length === 0) return null
  const minutes = now.getHours() * 60 + now.getMinutes()
  for (const r of rules) {
    const start = parseTimeToMinutes(r.start_time)
    const end = parseTimeToMinutes(r.end_time)
    if (start == null || end == null) continue
    if (start <= end) {
      if (minutes >= start && minutes < end) return r
    } else {
      if (minutes >= start || minutes < end) return r
    }
  }
  return null
}

function mealIcon(name) {
  const n = (name || '').toLowerCase()
  if (n.includes('breakfast')) return 'cafe-outline'
  if (n.includes('lunch')) return 'fast-food-outline'
  if (n.includes('dinner') || n.includes('supper')) return 'restaurant-outline'
  if (n.includes('snack') || n.includes('tea')) return 'pizza-outline'
  return 'restaurant-outline'
}

export default function HomeScreen({ site, brand, onScan, onChangeSite, onLock, canLock }) {
  const { colors, mode, toggle } = useTheme()
  const insets = useSafeAreaInsets()
  const styles = makeStyles(colors, mode)

  const [stats, setStats] = useState(null)
  const [logs, setLogs] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const [mealRules, setMealRules] = useState([])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let alive = true
    fetchPublicMealRules()
      .then((r) => { if (alive) setMealRules(r) })
      .catch(() => {})
    const t = setInterval(() => {
      fetchPublicMealRules()
        .then((r) => { if (alive) setMealRules(r) })
        .catch(() => {})
    }, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const currentMeal = activeMealRule(mealRules, now)

  const siteInitials = initialsFrom(site?.name)
  const siteAvatarColor = colorFor(site?.site_code || site?.name || '')

  const load = useCallback(async (nextLimit) => {
    if (!site) return
    try {
      const [s, l] = await Promise.all([
        fetchSiteStats(site.id),
        fetchSiteLogs(site.id, nextLimit),
      ])
      setStats(s)
      setLogs(l.data)
      setHasMore(l.hasMore)
      setError(null)
    } catch (e) {
      setError('Could not load site data.')
    }
  }, [site])

  useEffect(() => {
    setStats(null)
    setLogs(null)
    setLimit(PAGE_SIZE)
    setHasMore(false)
    load(PAGE_SIZE)
  }, [site?.id])

  useEffect(() => {
    const t = setInterval(() => load(limit), REFRESH_MS)
    return () => clearInterval(t)
  }, [load, limit])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load(limit)
    setRefreshing(false)
  }, [load, limit])

  const onLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const next = limit + PAGE_SIZE
    setLimit(next)
    await load(next)
    setLoadingMore(false)
  }, [load, limit, hasMore, loadingMore])

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: spacing.xl + insets.bottom }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primaryAccent]}
            progressViewOffset={insets.top}
          />
        }
      >
        <LinearGradient
          colors={['#7C3AED', '#3B82F6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerBand, { paddingTop: insets.top }]}
        >
          <View style={styles.header}>
            <Pressable
              onPress={onChangeSite}
              style={({ pressed }) => [styles.headerLeft, pressed && { opacity: 0.75 }]}
              android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
              hitSlop={4}
            >
              <View style={styles.avatarRing}>
                <View style={[styles.headerAvatar, { backgroundColor: siteAvatarColor }]}>
                  <Text style={styles.headerAvatarText}>{siteInitials}</Text>
                </View>
                <View style={styles.avatarStatusDot} />
              </View>
              <View style={styles.welcomeBlock}>
                <Text style={styles.welcomeSmall}>Welcome back,</Text>
                <View style={styles.welcomeRow}>
                  <Text style={styles.welcomeBig} numberOfLines={1}>
                    {site.name}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.85)" />
                </View>
                <View style={styles.dateTimeInline}>
                  <Text style={styles.dateTimeInlineText}>
                    {formatClockDate(now)} · {formatClockTime(now)}
                  </Text>
                </View>
              </View>
            </Pressable>

            <View style={styles.headerRight}>
              {canLock && (
                <Pressable
                  onPress={onLock}
                  style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
                  android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
                  hitSlop={8}
                >
                  <Ionicons name="log-out-outline" size={20} color="#fff" />
                </Pressable>
              )}
            </View>
          </View>
        </LinearGradient>

        <View style={styles.heroWrap}>
          <View style={styles.heroCard}>
            <Pressable
              onPress={onScan}
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
              style={({ pressed }) => [styles.scanBtnOuter, pressed && { transform: [{ scale: 0.97 }] }]}
            >
              <View style={styles.scanBtnInner}>
                {currentMeal ? (
                  <>
                    <Ionicons name={mealIcon(currentMeal.name)} size={48} color="#fff" />
                    <Text style={styles.mealName} numberOfLines={1}>
                      {currentMeal.name}
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="restaurant-outline" size={48} color="#fff" />
                    <Text style={styles.mealName}>Ready</Text>
                  </>
                )}
              </View>
            </Pressable>
          </View>

        </View>

        <View style={styles.statsRow}>
          <StatCard styles={styles} tint={colors.primary} label="Total" value={stats?.employees} />
          <StatCard styles={styles} tint={colors.success} label="Served" value={stats?.served_today} />
          <StatCard styles={styles} tint={colors.warning} label="Pending" value={stats?.pending} />
          <StatCard styles={styles} tint={colors.danger} label="Denied" value={stats?.denied_today} />
        </View>

        <ProgressBar styles={styles} colors={colors} stats={stats} />

        <View style={styles.sectionHead}>
          <Ionicons name="time-outline" size={16} color={colors.onSurfaceVariant} />
          <Text style={styles.sectionTitle}>Recent Activity</Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {logs === null && !error && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {logs && logs.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No scans yet</Text>
            <Text style={styles.emptySub}>Tap SCAN above to record the first meal of the day.</Text>
          </View>
        )}

        {logs && logs.length > 0 && (
          <>
            <View style={styles.list}>
              {logs.map((log) => (
                <LogRow key={log.id} log={log} styles={styles} colors={colors} />
              ))}
            </View>
            {hasMore && (
              <Pressable
                onPress={onLoadMore}
                disabled={loadingMore}
                style={({ pressed }) => [styles.loadMore, pressed && { opacity: 0.7 }]}
                android_ripple={{ color: colors.surfaceContainerHigh }}
              >
                {loadingMore ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <>
                    <Ionicons name="chevron-down" size={16} color={colors.primary} />
                    <Text style={styles.loadMoreText}>Load more</Text>
                  </>
                )}
              </Pressable>
            )}
            {!hasMore && logs.length > PAGE_SIZE && (
              <Text style={styles.endText}>· End of logs ·</Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function ProgressBar({ styles, colors, stats }) {
  const total = stats?.employees ?? 0
  const pending = stats?.pending ?? 0
  const servedUnique = Math.max(0, total - pending)
  const pct = total > 0 ? Math.min(100, Math.round((servedUnique / total) * 100)) : 0

  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressHead}>
        <View style={styles.progressTitleRow}>
          <Ionicons name="restaurant-outline" size={14} color={colors.onSurfaceVariant} />
          <Text style={styles.progressTitle}>Today's Progress</Text>
        </View>
        <Text style={styles.progressPct}>{pct}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <LinearGradient
          colors={['#10B981', '#34D399']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${pct}%` }]}
        />
      </View>
      <View style={styles.progressFootRow}>
        <Text style={styles.progressMeta}>
          <Text style={styles.progressMetaStrong}>{servedUnique}</Text>
          <Text> of </Text>
          <Text style={styles.progressMetaStrong}>{total}</Text>
          <Text> served</Text>
        </Text>
        <Text style={styles.progressMeta}>
          <Text style={styles.progressMetaStrong}>{pending}</Text>
          <Text> pending</Text>
        </Text>
      </View>
    </View>
  )
}

function StatCard({ styles, tint, label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color: tint }]}>{value ?? '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function LogRow({ log, styles, colors }) {
  const allowed = log.result === 'allowed'
  const employee = log.employee
  const photo = pictureUrl(employee?.profile_picture)
  const initials = initialsFrom(employee?.name)
  const avatarColor = colorFor(employee?.employee_code || employee?.name || '')
  const subtitle = log.meal_rule?.name || log.mealRule?.name
  const reasonText = !allowed ? reasonLabel(log.reason) : null

  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
        <Text style={styles.avatarText}>{initials}</Text>
        {!!photo && (
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} onError={() => {}} />
        )}
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowName} numberOfLines={1}>
          {employee?.name || 'Unknown'}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {employee?.employee_code ? `${employee.employee_code}` : ''}
          {subtitle ? ` · ${subtitle}` : ''}
          {!subtitle && reasonText ? ` · ${reasonText}` : ''}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <View
          style={[
            styles.badge,
            allowed
              ? { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.4)' }
              : { backgroundColor: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.4)' },
          ]}
        >
          <Text style={[styles.badgeText, { color: allowed ? colors.success : colors.danger }]}>
            {allowed ? 'YES' : 'NO'}
          </Text>
        </View>
        <Text style={styles.rowTime}>{formatTime(log.scanned_at)}</Text>
      </View>
    </View>
  )
}

const SCAN_OUTER = 148
const SCAN_INNER = 130

const makeStyles = (colors, mode) => {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },

  headerBand: {
    paddingBottom: spacing.md + spacing.sm + 60,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    padding: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  avatarStatusDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: '#7C3AED',
  },
  welcomeBlock: { flexShrink: 1, minWidth: 0 },
  welcomeSmall: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  welcomeBig: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },

  dateTimeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  dateTimeInlineText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
  },

  heroWrap: {
    alignItems: 'center',
    marginTop: -((SCAN_OUTER + 24) / 2) + spacing.md,
    marginBottom: spacing.lg,
    zIndex: 2,
    elevation: 2,
  },
  heroCard: {
    width: SCAN_OUTER + 24,
    height: SCAN_OUTER + 24,
    borderRadius: (SCAN_OUTER + 24) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    shadowColor: colors.primaryAccent,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  scanBtnOuter: {
    width: SCAN_OUTER,
    height: SCAN_OUTER,
    borderRadius: SCAN_OUTER / 2,
    padding: (SCAN_OUTER - SCAN_INNER) / 2,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
  },
  scanBtnInner: {
    flex: 1,
    borderRadius: SCAN_INNER / 2,
    backgroundColor: colors.primaryAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 6,
    paddingHorizontal: 8,
    maxWidth: SCAN_INNER - 16,
  },

  siteChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  siteChipText: { color: colors.onSurfaceVariant, fontSize: 12 },
  siteChipBold: { color: colors.onSurface, fontWeight: '700' },

  statsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '900', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.onSurfaceVariant, fontSize: 10, marginTop: 3, letterSpacing: 0.5, fontWeight: '600', textTransform: 'uppercase' },

  progressWrap: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressTitle: {
    color: colors.onSurface,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  progressPct: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressFootRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  progressMeta: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    letterSpacing: 0.2,
  },
  progressMetaStrong: {
    color: colors.onSurface,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  sectionHead: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },

  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  error: { color: colors.danger, textAlign: 'center', paddingVertical: spacing.md, fontSize: 13 },

  emptyCard: {
    marginHorizontal: spacing.md,
    padding: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radii.lg,
  },
  emptyTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '700', marginTop: spacing.sm },
  emptySub: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 2, textAlign: 'center' },

  list: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    gap: spacing.sm,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  rowMeta: { color: colors.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  badge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  rowTime: { color: colors.textMuted, fontSize: 10, letterSpacing: 0.5 },

  loadMore: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  loadMoreText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  endText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1,
    marginTop: spacing.md,
  },
})
}
