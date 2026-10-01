<script setup lang="ts">
/**
 * โครงร่างการ์ดสินค้าระหว่างโหลด — สัดส่วนตรงกับ ProductCard.vue ทุกส่วน
 * (กรอบรูป 4:3, ชื่อ 2 บรรทัด, ราคา, ปุ่มเปรียบเทียบ) เพื่อให้ตอนข้อมูลจริง
 * มาถึงแล้วการ์ดไม่ขยับ/หน้าไม่กระโดด
 */
import SkeletonBox from '../common/SkeletonBox.vue'
</script>

<template>
  <div class="bg-white border rounded-xl overflow-hidden flex flex-col h-full">
    <div class="aspect-[4/3] border-b p-3">
      <SkeletonBox class="w-full h-full" />
    </div>
    <div class="p-3 flex-1 flex flex-col gap-2">
      <SkeletonBox class="h-3.5 w-full" />
      <SkeletonBox class="h-3.5 w-3/5" />
      <SkeletonBox class="h-4 w-1/2 mt-1" />
      <SkeletonBox class="h-7 w-full rounded-lg mt-1" />
    </div>
  </div>
</template>
