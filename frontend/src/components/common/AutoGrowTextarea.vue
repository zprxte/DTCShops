<script setup lang="ts">
/**
 * ช่องกรอกค่าที่ "สูงขึ้นเอง" เมื่อข้อความยาวเกินความกว้างช่อง
 *
 * ใช้แทน <input> ในช่องกรอกค่าคุณสมบัติสินค้า — ค่าพวกนี้มักเป็นรายการยาว
 * คั่นจุลภาค (เช่น "เครื่องอ่านบัตรแถบแม่เหล็ก, ฟังก์ชั่นตัดสตาร์ท, เซ็นเซอร์
 * วัดระดับน้ำมัน") ซึ่งใน <input> บรรทัดเดียวจะโดนตัดหายไปทางขวา แอดมินต้อง
 * เลื่อน cursor ไล่อ่านเองทีละส่วน มองไม่เห็นค่าเต็มพร้อมกันเลย
 *
 * พฤติกรรม:
 *   • ขึ้นบรรทัดใหม่ได้ (Enter / วางข้อความหลายบรรทัด) และบันทึก \n ลงฐานข้อมูล
 *     ตามที่พิมพ์ — หน้าสินค้า/หน้าเปรียบเทียบฝั่งลูกค้าแสดงด้วย
 *     whitespace-pre-line จึงขึ้นบรรทัดตรงกับที่แอดมินกรอก (หน้าเปรียบเทียบ
 *     ถือว่าบรรทัดใหม่เป็นตัวคั่นรายการเหมือนจุลภาค)
 *   • ซ่อน scrollbar และปิดการลากขยายมุมขวาล่าง (resize-none) — ความสูงคุม
 *     ด้วยเนื้อหาอย่างเดียว ไม่ให้ช่องสูงต่ำไม่เท่ากันจนตารางดูรก
 *   • สูงได้ไม่เกิน maxRows บรรทัด (ค่าเริ่มต้น 5) เกินกว่านั้นค่อยเลื่อนใน
 *     ช่อง กันช่องเดียวยืดจนดันช่องอื่นหลุดจอ
 */
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = withDefaults(defineProps<{ modelValue: string; maxRows?: number }>(), {
  maxRows: 5,
})
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const el = ref<HTMLTextAreaElement | null>(null)

function resize() {
  const node = el.value
  // clientWidth 0 = ตอนนี้ถูกซ่อนอยู่ (แท็บที่ยังไม่ได้เปิด ใช้ v-show ซึ่ง
  // mount ไว้แล้วแต่ display:none) วัดตอนนี้จะได้ scrollHeight 0 แล้วช่องจะถูก
  // ตั้งความสูงเป็น 0 ค้างไว้ — ข้ามไปก่อน เดี๋ยว ResizeObserver ด้านล่างจะ
  // เรียกซ้ำให้เองตอนแท็บถูกเปิดจริง
  if (!node || node.clientWidth === 0) return
  // ต้องรีเซ็ตเป็น auto ก่อนทุกครั้ง ไม่งั้น scrollHeight จะคาความสูงเดิมไว้
  // แล้วช่องจะโตขึ้นอย่างเดียว ลบข้อความออกก็ไม่ยอมเตี้ยลง
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

// ค่าที่ถูกเติมจากข้างนอก (โหลดข้อมูลเดิมมาใส่ฟอร์ม) ต้องวัดความสูงใหม่ด้วย
watch(() => props.modelValue, () => nextTick(resize))

// ดูการเปลี่ยน "ความกว้าง" ของช่อง ซึ่งครอบคลุมทั้ง 2 กรณีที่ต้องวัดใหม่:
// เปลี่ยนขนาดจอ/ย่อขยายหน้าต่าง และตอนช่องเปลี่ยนจากซ่อน (กว้าง 0) เป็นแสดง
// เทียบกับความกว้างครั้งก่อนเสมอ ไม่งั้นการที่เราไปตั้ง height เองจะทำให้
// observer เด้งกลับมาเรียกตัวเองวนไม่จบ
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
