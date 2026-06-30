import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'theme_mode'

export const darkColors = {
  background: '#0f131e',
  surface: '#0b1326',
  surfaceContainer: '#171f33',
  surfaceContainerLow: '#131b2e',
  surfaceContainerHigh: '#222a3d',
  surfaceContainerHighest: '#303541',
  surfaceContainerLowest: '#060e20',
  outline: '#8c909f',
  outlineVariant: '#424754',
  onSurface: '#dee2f2',
  onSurfaceVariant: '#c4c6d0',
  primary: '#adc6ff',
  primaryAccent: '#3B82F6',
  success: '#34d399',
  successDeep: '#065f46',
  danger: '#f87171',
  dangerDeep: '#7f1d1d',
  warning: '#fbbf24',
  warningDeep: '#78350f',
  textMuted: '#8c909f',
  scrim: 'rgba(15,19,30,0.95)',
  overlayPanel: 'rgba(23,31,51,0.85)',
}

export const lightColors = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceContainer: '#eef2f7',
  surfaceContainerLow: '#f1f5f9',
  surfaceContainerHigh: '#e2e8f0',
  surfaceContainerHighest: '#cbd5e1',
  surfaceContainerLowest: '#ffffff',
  outline: '#94a3b8',
  outlineVariant: '#e2e8f0',
  onSurface: '#0f172a',
  onSurfaceVariant: '#475569',
  primary: '#2563eb',
  primaryAccent: '#3B82F6',
  success: '#059669',
  successDeep: '#a7f3d0',
  danger: '#dc2626',
  dangerDeep: '#fecaca',
  warning: '#d97706',
  warningDeep: '#fde68a',
  textMuted: '#64748b',
  scrim: 'rgba(248,250,252,0.95)',
  overlayPanel: 'rgba(255,255,255,0.92)',
}

export const radii = { sm: 8, md: 12, lg: 20, xl: 28, pill: 999 }
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }

// Backwards-compat: any file that still imports `colors` will get the dark palette.
export const colors = darkColors

const ThemeContext = createContext({
  mode: 'dark',
  colors: darkColors,
  toggle: () => {},
  setMode: () => {},
  ready: false,
})

export function ThemeProvider({ children, defaultMode = 'dark' }) {
  const [mode, setModeState] = useState(defaultMode)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (!alive) return
        if (v === 'light' || v === 'dark') setModeState(v)
        setReady(true)
      })
      .catch(() => alive && setReady(true))
    return () => { alive = false }
  }, [])

  const setMode = useCallback((next) => {
    setModeState((prev) => {
      if (prev === next) return prev
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {})
      return next
    })
  }, [])

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {})
      return next
    })
  }, [])

  const value = useMemo(
    () => ({
      mode,
      colors: mode === 'light' ? lightColors : darkColors,
      toggle,
      setMode,
      ready,
    }),
    [mode, ready, toggle, setMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
