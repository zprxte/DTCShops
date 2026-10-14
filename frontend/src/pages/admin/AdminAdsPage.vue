<script setup lang="ts">
// "ADS สินค้าแนะนำ" — placeholder (คงเมนูให้ตรงหลังบ้านต้นแบบ · endpoint ถูกลบแล้ว 10 ก.ย. 2026)
import { Megaphone } from 'lucide-vue-next'
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold text-gray-800">ADS สินค้าแนะนำ</h1>

    <div class="bg-white border rounded-xl p-12 flex flex-col items-center justify-center text-center gap-3">
      <div class="w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
        <Megaphone aria-hidden="true" class="w-6 h-6" />
      </div>
      <p class="text-sm text-gray-500 max-w-sm">
        หน้านี้ยังไม่เปิดใช้งาน — ระบบนี้ไม่มีส่วนจัดการโฆษณา/โปรโมชันสินค้าเหมือนต้นแบบ
      </p>
    </div>
  </div>
</template>
