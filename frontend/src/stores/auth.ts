import { defineStore } from 'pinia'
import api from '../services/api'

interface Admin {
  admin_id: number
  username: string
}

// error type
export type LoginErrorCode = 'missingCredentials' | 'invalidCredentials' | 'loginFailedGeneric' | 'networkError'
const KNOWN_ERROR_CODES = new Set<LoginErrorCode>(['missingCredentials', 'invalidCredentials', 'loginFailedGeneric'])

// เก็บ token
const STORAGE_KEY = 'auth-storage'

// decode token
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

// โหลด token
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
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ admin: this.admin, token: this.token }))
    },

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

    // แจ้ง backend ให้ยกเลิก token ใบนี้ก่อน แล้วค่อยล้างของในเครื่อง (14 ก.ย. 2026)
    //
    // เดิมล้างเฉพาะฝั่งนี้ ซึ่งแปลว่า token ใบเดิมยังใช้งานได้ต่อจนหมดอายุเอง —
    // ใครที่คัดลอก token ไปแล้วยังเรียก API ของแอดมินได้ต่อ การกดออกจากระบบจึง
    // ไม่ได้ปิดประตูจริง ตอนนี้ backend มีบัญชีดำแล้ว (ดู utils/tokenBlacklist.js)
    //
    // เป็น async แต่ผู้เรียกไม่จำเป็นต้อง await — การล้างฝั่งนี้เกิดขึ้นเสมอไม่ว่า
    // คำขอจะสำเร็จหรือไม่ (เน็ตหลุด/เซิร์ฟเวอร์ล่ม ก็ต้องออกจากระบบได้อยู่ดี)
    async logout() {
      const hadToken = !!this.token
      // ล้างสถานะฝั่งนี้ก่อน เพื่อไม่ให้ interceptor ที่ดัก 401 เด้งไปหน้าล็อกอินซ้ำซ้อน
      delete api.defaults.headers.common['Authorization']
      const token = this.token
      this.admin = null
      this.token = null
      this.error = null
      localStorage.removeItem(STORAGE_KEY)
      if (!hadToken) return
      try {
        // ส่ง {} ไม่ใช่ null — axios จะ serialize null เป็นข้อความ "null" ซึ่ง
        // express.json() โหมด strict ปฏิเสธเป็น 400 ทำให้ยกเลิก token ไม่สำเร็จเงียบๆ
        await api.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } })
      } catch {
        // ยกเลิกฝั่งเซิร์ฟเวอร์ไม่สำเร็จก็ไม่เป็นไร token จะหมดอายุเองใน 2 ชม.
        // ที่สำคัญกว่าคือผู้ใช้ต้องออกจากระบบได้เสมอ ซึ่งทำไปแล้วด้านบน
      }
    },

    clearError() {
      this.error = null
    },
  },
})
