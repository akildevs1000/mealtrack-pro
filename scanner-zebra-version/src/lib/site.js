import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Persisted scanner session. Stores:
//   - deviceMac: the MAC bound to this physical scanner (set once on first launch).
//   - manager:   the logged-in camp manager { id, username, name, campCode } — cleared on logout/re-lock.
//   - device:    the registered Device row.
//   - camp:      the camp this scanner serves, derived from the manager's campCode.
const KEY = 'mealops.scanner.session.v1'

// TEMP: hardcoded device MAC for testing — skips the MAC bind screen on first
// launch. The Zebra you registered with this MAC must exist server-side; the
// /api/scanner/login endpoint still verifies it. To restore the bind screen,
// set DEFAULT_DEVICE_MAC back to null.
const DEFAULT_DEVICE_MAC = '94:FB:29:62:3E:D9'

const empty = { deviceMac: DEFAULT_DEVICE_MAC, manager: null, device: null, camp: null }

export function useScannerSession() {
  const [session, setSession] = useState(empty)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive) return
        try {
          const parsed = raw ? JSON.parse(raw) : null
          if (parsed && typeof parsed === 'object') {
            // TEMP bypass: a stored null deviceMac (from a prior run) shouldn't
            // override the hardcoded default. Force the default whenever stored
            // value is falsy.
            setSession({
              ...empty,
              ...parsed,
              deviceMac: parsed.deviceMac || DEFAULT_DEVICE_MAC,
            })
          }
        } catch {}
        setLoaded(true)
      })
      .catch(() => alive && setLoaded(true))
    return () => { alive = false }
  }, [])

  const save = async (next) => {
    const merged = { ...session, ...next }
    setSession(merged)
    await AsyncStorage.setItem(KEY, JSON.stringify(merged))
  }

  const clearLogin = async () => {
    // Keep deviceMac (the MAC is bound to the hardware, not the manager login).
    const next = { ...session, manager: null }
    setSession(next)
    await AsyncStorage.setItem(KEY, JSON.stringify(next))
  }

  const reset = async () => {
    setSession(empty)
    await AsyncStorage.removeItem(KEY)
  }

  return { session, save, clearLogin, reset, loaded }
}

// Back-compat: a few old screens still import { useSite }.
export const useSite = useScannerSession
