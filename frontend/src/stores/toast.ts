import { reactive } from 'vue'

// คิวข้อความ toast (ToastContainer.vue เป็นตัวแสดง)
export type ToastKind = 'success' | 'error' | 'info'
export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

let nextId = 1
export const toastState = reactive<{ items: ToastItem[] }>({ items: [] })

const DURATION_MS = 3000

// เพิ่ม toast แล้วลบเองเมื่อครบเวลา
function push(kind: ToastKind, message: string) {
  const id = nextId++
  toastState.items.push({ id, kind, message })
  setTimeout(() => {
    const i = toastState.items.findIndex((t) => t.id === id)
    if (i !== -1) toastState.items.splice(i, 1)
  }, DURATION_MS)
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
}
