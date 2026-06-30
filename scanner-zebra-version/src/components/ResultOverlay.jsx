import { View, Text, StyleSheet, Image, Pressable } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { reasonLabel } from '../lib/reasons'
import { pictureUrl } from '../api/client'
import { darkColors as colors, radii, spacing } from '../lib/theme'
import { initialsFrom, colorFor } from '../lib/avatar'

function formatTime(d = new Date()) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
}

export default function ResultOverlay({ decision, onClose }) {
  if (!decision) return null

  const { status, reason, employee } = decision
  const isAllowed = status === 'allowed'

  const palette = isAllowed
    ? {
        ring: '#34d399',
        headlineColor: '#22c55e',
        subtitleColor: '#86efac',
        metaColor: '#9ca3af',
        headline: 'YES',
        subtitle: 'Access Granted',
      }
    : {
        ring: '#f87171',
        headlineColor: '#ef4444',
        subtitleColor: '#fca5a5',
        metaColor: '#9ca3af',
        headline: 'NO',
        subtitle: status === 'error' ? 'Try Again' : 'Access Denied',
      }

  const name = employee?.name || (isAllowed ? '' : reasonLabel(reason) || '')
  const code = employee?.employee_code
  const designation = employee?.designation
  const photo = pictureUrl(employee?.profile_picture)
  const initials = initialsFrom(employee?.name)
  const avatarColor = colorFor(employee?.employee_code || employee?.name || '')
  const wrongSiteNote = reason === 'wrong_site' && employee?.site
    ? `Belongs to ${employee.site.site_code}`
    : null
  const showReason = !isAllowed && reason && reason !== 'wrong_site' && name !== reasonLabel(reason)

  return (
    <View style={styles.backdrop} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.content}>
        <View style={[styles.avatarOuter, { borderColor: palette.ring }]}>
          <View
            style={[
              styles.avatarInner,
              { backgroundColor: employee ? avatarColor : 'rgba(255,255,255,0.08)' },
            ]}
          >
            {employee ? (
              <>
                <Text style={styles.initials}>{initials}</Text>
                {!!photo && (
                  <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} onError={() => {}} />
                )}
              </>
            ) : (
              <Ionicons
                name={isAllowed ? 'checkmark' : status === 'error' ? 'warning-outline' : 'help-outline'}
                size={44}
                color={palette.headlineColor}
              />
            )}
          </View>
        </View>

        <Ionicons
          name={isAllowed ? 'checkmark-circle' : 'close-circle'}
          size={44}
          color={palette.headlineColor}
          style={styles.headlineIcon}
        />
        <Text style={[styles.subtitle, { color: palette.subtitleColor }]}>{palette.subtitle}</Text>

        {!!name && <Text style={styles.name}>{name}</Text>}
        {!!designation && <Text style={styles.designation}>{designation}</Text>}

        {showReason && (
          <Text style={[styles.reason, { color: palette.subtitleColor }]}>{reasonLabel(reason)}</Text>
        )}
        {!!wrongSiteNote && (
          <Text style={[styles.reason, { color: palette.subtitleColor }]}>{wrongSiteNote}</Text>
        )}

        <Text style={[styles.meta, { color: palette.metaColor }]}>
          {code ? `${code} · ` : ''}{formatTime()}
        </Text>
        </View>

        {!!onClose && (
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.85 }]}
            android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
            accessibilityLabel="Close result"
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 50,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2937',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  content: { alignItems: 'center' },
  closeBtn: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  avatarOuter: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    padding: 3,
    marginBottom: spacing.md,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: { color: '#fff', fontSize: 26, fontWeight: '700', letterSpacing: 1 },
  bigIcon: { fontSize: 88, fontWeight: '700', marginBottom: spacing.sm },
  headline: { fontSize: 52, fontWeight: '900', letterSpacing: -2, lineHeight: 56 },
  headlineIcon: { marginTop: spacing.xs },
  subtitle: { fontSize: 11, fontWeight: '700', letterSpacing: 3, marginTop: 4, textTransform: 'uppercase' },
  name: { color: '#fff', fontSize: 20, fontWeight: '600', marginTop: spacing.md },
  designation: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 },
  reason: { fontSize: 13, fontWeight: '600', marginTop: spacing.sm },
  meta: { fontSize: 12, marginTop: spacing.md, letterSpacing: 1 },
})
