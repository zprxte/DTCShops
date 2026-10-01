<script setup lang="ts">
// "ข้อมูล SEO" — placeholder เท่านั้น
//
// เดิมหน้านี้ทำ CRUD กับ tbl_page ได้จริง (restore มาพร้อมดัมป์ของ
// dtcshops.com) แต่ปิดไว้ตามคำขอผู้ใช้ เพราะเป็นการตั้งค่า SEO ราย "หน้าเว็บ"
// ของร้านค้าต้นแบบ (หน้าแรก/เกี่ยวกับเรา/ติดต่อ ฯลฯ) ซึ่งระบบนี้ไม่มี —
// คงเมนูไว้ให้ sidebar ตรงกับ back office ต้นแบบ 1:1 เหมือนหน้า
// "ตัวเลือกสินค้า" (AdminItemOptionsPage.vue)
//
// หมายเหตุ: SEO ระดับ "สินค้า" (slug/canonical/title/description) ยังทำได้
// ตามปกติในแท็บ "รายละเอียด" ของฟอร์มแก้ไขสินค้า — คนละส่วนกับหน้านี้
//
// endpoint ฝั่ง backend (GET/POST/PUT/DELETE /api/admin/seo-pages) ยังอยู่
// ครบ ไม่ได้ลบ — ถ้าจะเปิดใช้อีกครั้ง โค้ดเดิมของหน้านี้กู้กลับได้จากไฟล์
// สำรองที่แจ้งไว้ในบทสนทนา
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
