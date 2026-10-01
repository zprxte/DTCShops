<script setup lang="ts">
/**
 * กันหน้าจอขาวทั้งหน้าเวลาคอมโพเนนต์ลูกพัง (Week 14 — error boundaries)
 *
 * ก่อนหน้านี้ระบบดักเฉพาะ error ที่เกิดตอนยิง API ผ่าน try/catch ของแต่ละหน้า
 * เท่านั้น — ถ้าพังตอน render (เช่นข้อมูลจริงมีรูปแบบไม่ตรงกับที่โค้ดคาดไว้)
 * Vue จะถอดทั้ง component tree ทิ้งแล้วเหลือหน้าขาวโดยไม่มีข้อความอะไรเลย
 * ตัวนี้ดักไว้ที่ระดับ <router-view> แล้วแสดงกล่องแจ้งเตือน + ปุ่มลองใหม่แทน
 *
 * onErrorCaptured คืน false เพื่อหยุดไม่ให้ error วิ่งต่อขึ้นไปข้างบน (เรา
 * จัดการเองแล้ว) แต่ยัง console.error ไว้ให้ดีบักได้เหมือนเดิม
 */
import { ref, onErrorCaptured, watch } from 'vue'
import { useRoute } from 'vue-router'
import { AlertTriangle, RotateCw } from 'lucide-vue-next'
import { useLanguage } from '../../language/useLanguage'

const props = withDefaults(defineProps<{ thai?: boolean }>(), { thai: false })

const { langs } = useLanguage()
const route = useRoute()
const failed = ref(false)
// รีเซ็ตเองเมื่อผู้ใช้เปลี่ยนหน้า — ไม่ให้ error ของหน้าเดิมค้างบังหน้าถัดไป
watch(() => route.fullPath, () => { failed.value = false })

onErrorCaptured((err) => {
  console.error('[ErrorBoundary]', err)
  failed.value = true
  return false
})

// ฝั่งแอดมินเป็นภาษาไทยล้วน ไม่ผ่าน i18n (ดู CLAUDE.md) จึงส่ง thai ให้ใช้
// ข้อความไทยตรงๆ แทนการเรียก langs()
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
