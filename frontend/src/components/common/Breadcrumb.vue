<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'

// รายการลำดับหน้า — ตัวสุดท้ายไม่มี to = หน้าปัจจุบัน
defineProps<{
  items: { label: string; to?: string }[]
}>()
</script>

<template>
  <nav class="flex items-center flex-wrap gap-1 text-xs text-gray-500" aria-label="breadcrumb">
    <template v-for="(item, i) in items" :key="i">
      <router-link v-if="item.to" :to="item.to" class="hover:text-brand-700 truncate max-w-[10rem]">{{ item.label }}</router-link>
      <span v-else class="text-gray-500 font-medium truncate max-w-[14rem]">{{ item.label }}</span>
      <ChevronRight aria-hidden="true" v-if="i < items.length - 1" class="w-3.5 h-3.5 shrink-0" />
    </template>
  </nav>
</template>
