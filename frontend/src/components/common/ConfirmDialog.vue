<script setup lang="ts">
// Simple centered modal used in place of the native `confirm()` popup for
// destructive admin actions (delete buttons). Admin-only component, so text
// is plain Thai (no i18n needed here).
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title?: string
  message: string
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

const confirmButton = ref<HTMLButtonElement | null>(null)

//เปิดป็อปอัปแล้วโฟกัสไปที่ปุ่ม "ลบ" ทันที กด Enter ได้เลยโดยไม่ต้องเลื่อนเมาส์
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) nextTick(() => confirmButton.value?.focus())
  },
  { immediate: true }
)

//Enter = ยืนยันลบ, Esc = ยกเลิก — ข้าม Enter ตอนโฟกัสอยู่บนปุ่มอยู่แล้ว
//เพราะเบราว์เซอร์จะสั่ง click ของปุ่มนั้นเองอยู่แล้ว (กด Enter บน "ยกเลิก" ต้องได้ยกเลิก ไม่ใช่ลบ)
function onKeydown(event: KeyboardEvent) {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
    return
  }
  if (event.key === 'Enter' && (document.activeElement as HTMLElement | null)?.tagName !== 'BUTTON') {
    event.preventDefault()
    emit('confirm')
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" @click="emit('cancel')">
    <div
      class="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4"
      role="alertdialog"
      aria-modal="true"
      @click.stop
    >
      <div>
        <h2 class="text-base font-semibold text-gray-900">{{ title || 'ยืนยันการลบ' }}</h2>
        <p class="text-sm text-gray-500 mt-1">{{ message }}</p>
      </div>
      <div class="flex justify-end gap-2">
        <button @click="emit('cancel')" class="px-3 py-1.5 text-sm rounded-lg border text-gray-600 hover:bg-gray-50">
          ยกเลิก
        </button>
        <button
          ref="confirmButton"
          @click="emit('confirm')"
          class="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
        >
          ลบ
        </button>
      </div>
    </div>
  </div>
</template>
