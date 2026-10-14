<script setup lang="ts">
// แถวโครงร่างของตารางแอดมินระหว่างโหลด (ตารางไม่ยุบ/กระโดด)
import SkeletonBox from './SkeletonBox.vue'

withDefaults(defineProps<{ columns: number; rows?: number }>(), { rows: 5 })
</script>

<template>
  <tr v-for="row in rows" :key="row" class="border-b last:border-0">
    <td v-for="col in columns" :key="col" class="py-3 pr-4">
      <SkeletonBox class="h-4" :class="col === 1 ? 'w-2/3' : 'w-1/2'" />
    </td>
  </tr>
</template>
