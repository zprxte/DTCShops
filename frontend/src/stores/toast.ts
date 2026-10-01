import { reactive } from 'vue'

// Minimal hand-rolled toast queue — replaces react-hot-toast. Kept dependency-free
// since this is the only thing that library was used for; ToastContainer.vue renders it.
export type ToastKind = 'success' | 'error' | 'info'
export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

let nextId = 1
export const toastState = reactive<{ items: ToastItem[] }>({ items: [] })

const DURATION_MS = 3000

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
