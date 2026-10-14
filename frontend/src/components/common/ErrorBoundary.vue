<script setup lang="ts">
// ดัก error ตอน render ของคอมโพเนนต์ลูก แสดงกล่องแจ้งเตือน + ปุ่มลองใหม่แทนหน้าขาว
import { ref, onErrorCaptured, watch } from 'vue'
import { useRoute } from 'vue-router'
import { AlertTriangle, RotateCw } from 'lucide-vue-next'
import { useLanguage } from '../../language/useLanguage'

const props = withDefaults(defineProps<{ thai?: boolean }>(), { thai: false })

const { langs } = useLanguage()
const route = useRoute()
const failed = ref(false)
// เปลี่ยนหน้าแล้วรีเซ็ต ไม่ให้ error ค้างบังหน้าถัดไป
watch(() => route.fullPath, () => { failed.value = false })

onErrorCaptured((err) => {
  console.error('[ErrorBoundary]', err)
  failed.value = true
  return false
})

// thai = ใช้ข้อความไทยตรงๆ (หลังบ้านไม่มี i18n)
const title = () => (props.thai ? 'เกิดข้อผิดพลาด' : langs('errorBoundaryTitle'))
const body = () => (props.thai ? 'ส่วนนี้ทำงานผิดพลาด ลองโหลดหน้านี้ใหม่อีกครั้ง' : langs('errorBoundaryBody'))
const retry = () => (props.thai ? 'โหลดใหม่' : langs('errorBoundaryRetry'))
</script>

<template>
  <div v-if="failed" role="alert" class="max-w-lg mx-auto my-12 border rounded-xl bg-white p-6 text-center space-y-3">
    <AlertTriangle class="w-8 h-8 mx-auto text-yellow-500" aria-hidden="true" />
    <h2 class="font-semibold text-navy-900">{{ title() }}</h2>
    <p class="text-sm text-gray-500">{{ body() }}</p>
    <button
      type="button"
      @click="$router.go(0)"
      class="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-brand-700 text-white hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <RotateCw class="w-4 h-4" aria-hidden="true" />
      {{ retry() }}
    </button>
  </div>
  <slot v-else></slot>
</template>
