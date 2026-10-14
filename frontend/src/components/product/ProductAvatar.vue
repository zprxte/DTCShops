<script setup lang="ts">
import { computed } from 'vue'

// วงกลมตัวย่อชื่อสินค้า สีคงที่ตามชื่อ (ใช้แทนรูปเมื่อไม่มีรูป)
const PALETTE = ['#00AEEF', '#1fa24a', '#0c2a45', '#0077ab', '#158a3c', '#003d59']

const props = withDefaults(defineProps<{ name: string; size?: number; className?: string }>(), {
  size: 56,
  className: '',
})

// สีจาก hash ของชื่อ
function colorFor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

// ตัวย่อ 2 ตัวจากชื่อ
function initialsFor(name: string) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

const bg = computed(() => colorFor(props.name))
const initials = computed(() => initialsFor(props.name))
const fontSize = computed(() => props.size * 0.32)
</script>

<template>
  <div
    :class="['flex items-center justify-center rounded-xl font-bold text-white shrink-0', className]"
    :style="{ width: `${size}px`, height: `${size}px`, background: bg, fontSize: `${fontSize}px` }"
    aria-hidden="true"
  >
    {{ initials }}
  </div>
</template>
