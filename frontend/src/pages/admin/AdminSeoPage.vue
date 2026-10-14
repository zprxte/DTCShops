<script setup lang="ts">
// "ข้อมูล SEO" — placeholder (SEO รายสินค้ายังแก้ได้ในฟอร์มสินค้า · endpoint ถูกลบแล้ว 10 ก.ย. 2026)
import { Search } from 'lucide-vue-next'
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold text-gray-800">รายการข้อมูล SEO</h1>

    <div class="bg-white border rounded-xl p-12 flex flex-col items-center justify-center text-center gap-3">
      <div class="w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
        <Search aria-hidden="true" class="w-6 h-6" />
      </div>
      <p class="text-sm text-gray-500 max-w-sm">
        หน้านี้ยังไม่เปิดใช้งาน — ระบบนี้ไม่มีการตั้งค่า SEO รายหน้าเว็บเหมือนต้นแบบ (SEO ของสินค้าแต่ละชิ้นตั้งได้ในฟอร์มแก้ไขสินค้า)
      </p>
    </div>
  </div>
</template>
