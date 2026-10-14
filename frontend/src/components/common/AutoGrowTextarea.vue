<script setup lang="ts">
// ช่องกรอกที่สูงขึ้นเองตามข้อความ (สูงสุด maxRows บรรทัด) ขึ้นบรรทัดใหม่ได้ — ใช้กรอกค่าคุณสมบัติ
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = withDefaults(defineProps<{ modelValue: string; maxRows?: number }>(), {
  maxRows: 5,
})
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const el = ref<HTMLTextAreaElement | null>(null)

// ปรับความสูงตามเนื้อหา
function resize() {
  const node = el.value
  // ถูกซ่อนอยู่ (แท็บ v-show) วัดได้ 0 — ข้ามไป ResizeObserver จะเรียกซ้ำตอนแสดง
  if (!node || node.clientWidth === 0) return
  // ต้องรีเซ็ตเป็น auto ก่อน ไม่งั้นลบข้อความแล้วช่องไม่เตี้ยลง
  node.style.height = 'auto'
  const styles = getComputedStyle(node)
  const lineHeight = parseFloat(styles.lineHeight) || 20
  const padding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
  const border = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth)
  const max = lineHeight * props.maxRows + padding + border
  node.style.height = `${Math.min(node.scrollHeight + border, max)}px`
  node.style.overflowY = node.scrollHeight + border > max ? 'auto' : 'hidden'
}

function onInput(event: Event) {
  const node = event.target as HTMLTextAreaElement
  emit('update:modelValue', node.value)
  resize()
}

// ค่าที่เติมจากข้างนอกต้องวัดความสูงใหม่
watch(() => props.modelValue, () => nextTick(resize))

// วัดใหม่เมื่อความกว้างเปลี่ยน (ย่อจอ / เปลี่ยนจากซ่อนเป็นแสดง) — เทียบกับค่าเดิมกันวนไม่จบ
let observer: ResizeObserver | null = null
let lastWidth = -1
onMounted(() => {
  resize()
  observer = new ResizeObserver(() => {
    const width = el.value?.clientWidth ?? 0
    if (width === lastWidth) return
    lastWidth = width
    resize()
  })
  if (el.value) observer.observe(el.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <textarea
    ref="el"
    rows="1"
    :value="modelValue"
    @input="onInput"
    class="w-full border rounded-lg px-3 py-2 resize-none overflow-hidden focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
  ></textarea>
</template>
