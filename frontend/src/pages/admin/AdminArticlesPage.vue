<script setup lang="ts">
// "บทความ" > "ข้อมูลบทความ" — placeholder เท่านั้น
//
// เดิมหน้านี้ทำ CRUD กับ tbl_articles ได้จริง (restore มาพร้อมดัมป์ของ
// dtcshops.com) แต่ปิดไว้ตามคำขอผู้ใช้ เพราะ "บทความ" เป็นฟีเจอร์ของเว็บ
// ร้านค้าต้นแบบ ไม่ได้อยู่ในขอบเขตของระบบค้นหา/เปรียบเทียบสินค้านี้ —
// คงเมนูไว้ให้ sidebar ตรงกับ back office ต้นแบบ 1:1 เหมือนหน้า
// "ตัวเลือกสินค้า" (AdminItemOptionsPage.vue)
//
// endpoint ฝั่ง backend (GET/POST/PUT/DELETE /api/admin/articles) ยังอยู่
// ครบ ไม่ได้ลบ — ถ้าจะเปิดใช้อีกครั้ง โค้ดเดิมของหน้านี้กู้กลับได้จากไฟล์
// สำรองที่แจ้งไว้ในบทสนทนา
import { Newspaper } from 'lucide-vue-next'
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold text-gray-800">ข้อมูลบทความ</h1>

    <div class="bg-white border rounded-xl p-12 flex flex-col items-center justify-center text-center gap-3">
      <div class="w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
        <Newspaper aria-hidden="true" class="w-6 h-6" />
      </div>
      <p class="text-sm text-gray-500 max-w-sm">
        หน้านี้ยังไม่เปิดใช้งาน — ระบบนี้เป็นระบบค้นหาและเปรียบเทียบสินค้า ไม่มีส่วนจัดการบทความ/คอนเทนต์เหมือนต้นแบบ
      </p>
    </div>
  </div>
</template>
