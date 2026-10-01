<script setup lang="ts">
/**
 * แถวโครงร่างสำหรับตารางในหน้าแอดมินระหว่างโหลด (Week 14 — loading skeletons)
 *
 * แทนแถว "กำลังโหลด..." กลางตารางแบบเดิม ซึ่งทำให้ตารางยุบเหลือแถวเดียวแล้ว
 * กระโดดกลับมาสูงเท่าเดิมตอนข้อมูลมาถึง — โครงร่างกินพื้นที่ใกล้เคียงของจริง
 * ตั้งแต่แรก หน้าจึงนิ่ง
 */
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
