// สถานะล็อกอินของแอดมิน (token เก็บใน localStorage)
import { defineStore } from 'pinia'
import api from '../services/api'

interface Admin {
  admin_id: number
  username: string
}

export type LoginErrorCode = 'missingCredentials' | 'invalidCredentials' | 'loginFailedGeneric' | 'networkError'
const KNOWN_ERROR_CODES = new Set<LoginErrorCode>(['missingCredentials', 'invalidCredentials', 'loginFailedGeneric'])

const STORAGE_KEY = 'auth-storage'

// อ่านเวลาหมดอายุจาก JWT
function decodeTokenExpiry(token: string | null): Date | null {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const { exp } = JSON.parse(json)
    return typeof exp === 'number' ? new Date(exp * 1000) : null
  } catch {
    return null
  }
}

// โหลดสถานะล็อกอินที่บันทึกไว้
function loadPersisted(): { admin: Admin | null; token: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { admin: null, token: null }
    const parsed = JSON.parse(raw)
    return { admin: parsed.admin ?? null, token: parsed.token ?? null }
  } catch {
    return { admin: null, token: null }
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    ...loadPersisted(),
    isLoading: false,
    error: null as LoginErrorCode | null,
  }),

  getters: {
    isAuthenticated: (state) => !!state.token,
    tokenExpiresAt: (state) => decodeTokenExpiry(state.token),
  },

  actions: {
    // บันทึกสถานะลง localStorage
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ admin: this.admin, token: this.token }))
    },

    // ล็อกอินแล้วตั้ง token ให้ axios
    async login(username: string, password: string) {
      this.isLoading = true
      this.error = null
      try {
        const res = await api.post('/auth/login', { username, password })
        const { admin, token } = res.data
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
        this.admin = admin
        this.token = token
        this.isLoading = false
        this.persist()
      } catch (err: unknown) {
        const responseCode = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
        const hasResponse = (err as { response?: unknown })?.response !== undefined
        const code: LoginErrorCode =
          responseCode && KNOWN_ERROR_CODES.has(responseCode as LoginErrorCode)
            ? (responseCode as LoginErrorCode)
            : hasResponse
              ? 'loginFailedGeneric'
              : 'networkError'
        this.error = code
        this.isLoading = false
        throw new Error(code)
      }
    },

    // ออกจากระบบ: ล้างในเครื่องเสมอ แล้วแจ้ง backend ให้ยกเลิก token (ไม่ต้อง await)
    async logout() {
      const hadToken = !!this.token
      // ล้างก่อน ไม่ให้ interceptor 401 เด้งไปหน้าล็อกอินซ้ำ
      delete api.defaults.headers.common['Authorization']
      const token = this.token
      this.admin = null
      this.token = null
      this.error = null
      localStorage.removeItem(STORAGE_KEY)
      if (!hadToken) return
      try {
        // ส่ง {} ไม่ใช่ null — express.json() strict ปฏิเสธ "null" เป็น 400
        await api.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } })
      } catch {
        // ยกเลิกไม่สำเร็จก็ไม่เป็นไร token หมดอายุเองใน 2 ชม.
      }
    },

    clearError() {
      this.error = null
    },
  },
})
