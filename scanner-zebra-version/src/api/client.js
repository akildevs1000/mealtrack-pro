import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Server config is set on first launch via ServerConfigScreen and persisted
// here. No hardcoded fallback — if the user hasn't configured a server yet,
// requests will fail until they do.
const SERVER_KEY = 'mealops.scanner.server.v1'
const TOKEN_KEY = 'mealops.scanner.token.v1'

let cachedBaseUrl = null
let cachedToken = null

export async function getServerConfig() {
  try {
    const raw = await AsyncStorage.getItem(SERVER_KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw)
    if (cfg?.host && cfg?.port) return cfg
    return null
  } catch {
    return null
  }
}

export async function saveServerConfig({ host, port }) {
  const cfg = { host: String(host).trim(), port: String(port).trim() }
  await AsyncStorage.setItem(SERVER_KEY, JSON.stringify(cfg))
  cachedBaseUrl = baseUrlFromConfig(cfg)
  return cfg
}

export async function clearServerConfig() {
  await AsyncStorage.removeItem(SERVER_KEY)
  cachedBaseUrl = null
}

function baseUrlFromConfig(cfg) {
  return `http://${cfg.host}:${cfg.port}/api`
}

async function ensureBaseUrl() {
  if (cachedBaseUrl) return cachedBaseUrl
  const cfg = await getServerConfig()
  if (!cfg) return null
  cachedBaseUrl = baseUrlFromConfig(cfg)
  return cachedBaseUrl
}

export async function getToken() {
  if (cachedToken !== null) return cachedToken
  try {
    cachedToken = (await AsyncStorage.getItem(TOKEN_KEY)) || null
  } catch {
    cachedToken = null
  }
  return cachedToken
}

export async function setToken(token) {
  cachedToken = token
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token)
  else await AsyncStorage.removeItem(TOKEN_KEY)
}

const api = axios.create({
  timeout: 8000,
  headers: { Accept: 'application/json' },
})

api.interceptors.request.use(async (config) => {
  if (!config.baseURL) {
    const base = await ensureBaseUrl()
    if (!base) {
      // Surface a clear error rather than letting axios hit a relative URL.
      throw new axios.Cancel('Server not configured')
    }
    config.baseURL = base
  }
  const token = await getToken()
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ---------- Connectivity check (called from ServerConfigScreen) ----------

// Standalone — doesn't go through `api` because we want to test ARBITRARY
// host/port combos before persisting them.
export async function pingServer({ host, port, timeoutMs = 5000 }) {
  const url = `http://${String(host).trim()}:${String(port).trim()}/api/health`
  const res = await axios.get(url, { timeout: timeoutMs })
  return res.data
}

// ---------- Public ----------

export async function fetchManagers() {
  const { data } = await api.get('/scanner/managers')
  return Array.isArray(data) ? data : []
}

export async function fetchDeviceByMac(mac) {
  try {
    const { data } = await api.get(`/scanner/device/${encodeURIComponent(mac)}`)
    return data
  } catch (e) {
    if (e?.response?.status === 404) return null
    throw e
  }
}

// ---------- Auth ----------

export async function loginManager({ managerId, pin, deviceMac }) {
  try {
    const { data } = await api.post('/scanner/login', { managerId, pin, deviceMac })
    if (data?.token) await setToken(data.token)
    return data
  } catch (e) {
    const body = e?.response?.data
    if (body?.reason === 'device_not_registered') {
      return { error: 'device_not_registered', message: body.message }
    }
    const status = e?.response?.status
    if (status === 401 || status === 403) return null
    throw e
  }
}

export async function logout() {
  await setToken(null)
}

// ---------- Authenticated ----------

export async function fetchMe() {
  const { data } = await api.get('/scanner/me')
  return data
}

function normalizeScanResponse(data) {
  if (!data || typeof data !== 'object') {
    return { status: 'error', reason: 'network' }
  }
  const employee = data.employee
    ? {
        name: data.employee.name,
        employee_code: data.employee.laborCode,
        designation: data.employee.designation,
        profile_picture: data.employee.profile_picture ?? data.employee.profilePicture ?? null,
        site: null,
      }
    : null
  const isAllowed = data.status === 'eligible'
  return {
    status: isAllowed ? 'allowed' : data.status === 'error' ? 'error' : 'denied',
    reason: data.reason ?? null,
    employee,
    meal_rule: data.meal ? { name: data.meal } : null,
    scanned_at: data.scan?.time,
  }
}

export async function postScan(code, deviceMac) {
  try {
    const { data } = await api.post('/scanner/scan', { code, deviceMac })
    return normalizeScanResponse(data)
  } catch (e) {
    const body = e?.response?.data
    if (body && typeof body === 'object' && body.status) {
      return normalizeScanResponse(body)
    }
    return { status: 'error', reason: 'network' }
  }
}

// ---------- Home dashboard ----------
// All scoped server-side by the scanner token (manager's camp + today), so the
// siteId the HomeScreen passes is ignored.

export async function fetchSiteStats() {
  const { data } = await api.get('/scanner/stats')
  return data
}

export async function fetchSiteLogs(_siteId, limit = 10) {
  const { data } = await api.get('/scanner/logs', { params: { limit } })
  return {
    data: Array.isArray(data?.data) ? data.data : [],
    hasMore: !!data?.hasMore,
  }
}

export async function fetchPublicMealRules() {
  try {
    const { data } = await api.get('/scanner/meal-rules')
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// No branding endpoint in the mealtrack backend.
export async function fetchPublicSettings() { return null }

// Employee profile photos ARE served by the mealtrack backend now — the API
// returns an absolute URL (built from the request host, i.e. this same server),
// so usually we just pass it through. Relative paths are resolved against the
// configured server origin as a fallback.
export function pictureUrl(p) {
  if (typeof p !== 'string' || !p) return null
  if (/^https?:\/\//i.test(p)) return p
  if (cachedBaseUrl) {
    const origin = cachedBaseUrl.replace(/\/api\/?$/, '')
    return `${origin}${p.startsWith('/') ? '' : '/'}${p}`
  }
  return p
}
