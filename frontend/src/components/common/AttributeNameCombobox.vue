<script setup lang="ts">
// ช่องกรอกชื่อคุณสมบัติ + dropdown แนะนำชื่อที่มีอยู่ — Teleport ไป body เพราะฟอร์มแม่มี overflow-hidden ที่ตัด dropdown
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps<{
  modelValue: string
  options: string[]
  placeholder?: string
  // ต้องรับเป็น prop — attribute ที่ตกลงมาเองจะไปเกาะ div ครอบ ไม่ถึง <input>
  ariaLabel?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const open = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

const filtered = computed(() => {
  const query = props.modelValue.trim().toLowerCase()
  return query ? props.options.filter((name) => name.toLowerCase().includes(query)) : props.options
})

// ความสูงสูงสุดของ dropdown (หดลงถ้าพื้นที่ในจอไม่พอ)
const PREFERRED_MAX_HEIGHT = 288
const GAP = 4
const VIEWPORT_MARGIN = 8

// วาง dropdown ใต้ช่องกรอก หรือเปิดขึ้นบนถ้าด้านล่างไม่พอ
function updatePanelPosition() {
  const el = inputRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN
  const spaceAbove = rect.top - GAP - VIEWPORT_MARGIN

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

// โฟกัสแล้วเปิด dropdown
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

// หน่วง blur ไว้ ไม่ให้ dropdown ปิดก่อน click บนรายการทำงาน
function handleBlur() {
  setTimeout(closePanel, 150)
}

// เลือกชื่อจากรายการ
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
