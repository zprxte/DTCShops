<script setup lang="ts">
// ช่องกรอกชื่อคุณสมบัติ พร้อม dropdown แนะนำชื่อที่มีอยู่แล้วในระบบ — ใช้แทน
// native <datalist> เพราะ datalist ควบคุมตำแหน่ง/สไตล์ dropdown ไม่ได้เลย
// (เป็น browser UI ล้วนๆ) พิมพ์กรองรายการได้ และยังพิมพ์ชื่อใหม่ที่ไม่มีในลิสต์
// แล้วใช้ต่อได้ตามปกติ
//
// dropdown ถูก Teleport ออกไปที่ <body> แทนที่จะวางไว้ใน DOM ตรงจุดนี้ — เพราะ
// ฟอร์มแม่ (AdminProductEditPage.vue) มี `overflow-hidden` ครอบไว้ (ไว้บังคับมุมโค้ง
// ของแท็บบาร์) ซึ่งจะ clip เนื้อหาที่ยื่นเกินขอบฟอร์มออกไปแม้จะเป็น position:absolute
// ก็ตาม (ตัว element เองมีขนาดถูกต้องอยู่แล้ว แค่ถูกครอบไม่ให้ "วาด" ส่วนที่เกิน) —
// Teleport ไป body แล้วคำนวณตำแหน่งเองด้วย getBoundingClientRect() จึงไม่โดน clip
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps<{
  modelValue: string
  options: string[]
  placeholder?: string
  // ต้องรับเป็น prop ไม่ใช่ปล่อยให้ attribute ตกลงมาเอง — root ของคอมโพเนนต์นี้
  // เป็น <div> ครอบไว้ attribute ที่ส่งมาจะไปเกาะที่ div ไม่ถึง <input> ข้างใน
  ariaLabel?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const open = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

const filtered = computed(() => {
  const query = props.modelValue.trim().toLowerCase()
  // แสดงครบทุกรายการ ไม่ตัดจำนวน — กล่องมี scroll ในตัวอยู่แล้ว
  return query ? props.options.filter((name) => name.toLowerCase().includes(query)) : props.options
})

// ความสูงสูงสุดที่อยากได้ถ้าพื้นที่พอ (ตรงกับ max-h-72 เดิม) — ถ้าพื้นที่จริงในจอ
// เหลือน้อยกว่านี้ จะหดลงมาให้พอดีกับขอบจอแทน ไม่ให้ล้นออกไปนอกจออีก
const PREFERRED_MAX_HEIGHT = 288
const GAP = 4
const VIEWPORT_MARGIN = 8

function updatePanelPosition() {
  const el = inputRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN
  const spaceAbove = rect.top - GAP - VIEWPORT_MARGIN

  // เปิดด้านล่างตามปกติถ้าพื้นที่ด้านล่างพอสมควร (หรือมากกว่าด้านบน) — ถ้าช่องกรอก
  // อยู่ใกล้ขอบล่างจอเกินไปจนไม่พอ ให้เปิดขึ้นด้านบนแทน แล้วจำกัดความสูงตามพื้นที่จริง
  // เสมอทั้งสองทาง กันล้นจอไม่ว่าจะเปิดทางไหน
  if (spaceBelow >= 120 || spaceBelow >= spaceAbove) {
    panelStyle.value = {
      position: 'fixed',
      top: `${rect.bottom + GAP}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      maxHeight: `${Math.max(80, Math.min(PREFERRED_MAX_HEIGHT, spaceBelow))}px`,
    }
  } else {
    panelStyle.value = {
      position: 'fixed',
      bottom: `${window.innerHeight - rect.top + GAP}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      maxHeight: `${Math.max(80, Math.min(PREFERRED_MAX_HEIGHT, spaceAbove))}px`,
    }
  }
}

async function handleFocus() {
  open.value = true
  await nextTick()
  updatePanelPosition()
  window.addEventListener('scroll', updatePanelPosition, true)
  window.addEventListener('resize', updatePanelPosition)
}

function closePanel() {
  open.value = false
  window.removeEventListener('scroll', updatePanelPosition, true)
  window.removeEventListener('resize', updatePanelPosition)
}

// หน่วง blur ไว้เล็กน้อย กันกด mousedown บนรายการแล้ว blur ปิด dropdown ไปก่อน
// click จะถูกยิง (ใช้ @mousedown.prevent บนแต่ละ li ช่วยอีกชั้นด้วย)
function handleBlur() {
  setTimeout(closePanel, 150)
}

function select(name: string) {
  emit('update:modelValue', name)
  closePanel()
}

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updatePanelPosition, true)
  window.removeEventListener('resize', updatePanelPosition)
})
</script>

<template>
  <div>
    <input
      ref="inputRef"
      :value="modelValue"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @focus="handleFocus"
      @blur="handleBlur"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      class="w-full border rounded-lg px-3 py-2 text-sm"
    />
    <Teleport to="body">
      <ul
        v-if="open && filtered.length > 0"
        :style="panelStyle"
        class="z-50 bg-white border rounded-lg shadow-lg overflow-y-auto text-sm"
      >
        <li
          v-for="name in filtered"
          :key="name"
          @mousedown.prevent="select(name)"
          class="px-3 py-1.5 hover:bg-brand-50 cursor-pointer"
        >
          {{ name }}
        </li>
      </ul>
    </Teleport>
  </div>
</template>
