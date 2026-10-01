<script setup lang="ts">
// หน้าแรกของ Admin — ทำตามหน้าเดียวกันของ back office ต้นแบบ
// (spd-demo.dtc.co.th:3304): ตัวกรองช่วงวันที่ + การ์ดสรุป 4 ใบ +
// ตาราง 10 อันดับสินค้าเข้าชมมากที่สุด
//
// ตัวเลขทั้งหมดมาจาก tbl_logs ซึ่งเป็นตารางบันทึกกิจกรรมจริงของ
// dtcshops.com (restore มาพร้อมดัมป์ มีข้อมูลจริงถึง 3 ส.ค. 2026) และ
// ฝั่ง public ของโปรเจกต์นี้เขียนต่อเข้าไปด้วยแล้ว — ดู
// backend/src/utils/activityLog.js
//
// ต่างจากต้นแบบตรงที่ต้นแบบนับ "ร้านค้า" ของผู้ขายหลายราย ส่วนที่นี่นับ
// สาขา DTC จาก tbl_shop (ข้อมูลเดียวกับหน้า "ข้อมูลร้านค้า")
import { onMounted, ref, computed } from 'vue'
import TableRowsSkeleton from '../../components/common/TableRowsSkeleton.vue'
import { adminAPI } from '../../services/api'

type TopProduct = {
  product_id: string
  product_name: string
  product_price: number | null
  views: number
}

// ตัวเลือกช่วงวันที่ — number = จำนวนวันย้อนหลัง, 'all' = ทั้งหมด,
// 'custom' = ผู้ใช้เลือกวันเอง
const RANGE_OPTIONS = [
  { value: '1', label: 'วันนี้' },
  { value: '7', label: '7 วันที่ผ่านมา' },
  { value: '30', label: '30 วันที่ผ่านมา' },
  { value: '90', label: '90 วันที่ผ่านมา' },
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'custom', label: 'กำหนดเอง' },
]

// ข้อมูลจริงในระบบเริ่มตั้งแต่ ม.ค. 2025 — ใช้เป็นจุดเริ่มของตัวเลือก "ทั้งหมด"
const ALL_TIME_START = '2025-01-01'

function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDisplayDate(value: string): string {
  const [y, m, d] = value.split('-')
  return d && m && y ? `${d}/${m}/${y}` : value
}

const rangeMode = ref('30')
const customStart = ref(toInputDate(new Date()))
const customEnd = ref(toInputDate(new Date()))

// ช่วงวันที่ที่จะส่งไป backend ตามตัวเลือกปัจจุบัน (ยังไม่ใช่ช่วงที่โหลดอยู่
// จริง — จะมีผลต่อเมื่อกดปุ่ม "ค้นหา")
const pendingRange = computed(() => {
  if (rangeMode.value === 'custom') {
    return { start: customStart.value, end: customEnd.value }
  }
  const end = new Date()
  if (rangeMode.value === 'all') {
    return { start: ALL_TIME_START, end: toInputDate(end) }
  }
  const start = new Date()
  start.setDate(start.getDate() - (Number(rangeMode.value) - 1))
  return { start: toInputDate(start), end: toInputDate(end) }
})

const rangeLabel = computed(
  () => `${formatDisplayDate(pendingRange.value.start)} - ${formatDisplayDate(pendingRange.value.end)}`
)

const websiteViews = ref(0)
const productViews = ref(0)
const totalProducts = ref(0)
const totalShops = ref(0)
const topProducts = ref<TopProduct[]>([])
const loading = ref(true)
const error = ref('')

const cards = computed(() => [
  { label: 'การเข้าชมเว็บไซต์ทั้งหมด', value: websiteViews.value },
  { label: 'การเข้าชมสินค้าทั้งหมด', value: productViews.value },
  { label: 'จำนวนสินค้าทั้งหมด', value: totalProducts.value },
  { label: 'จำนวนร้านค้าทั้งหมด', value: totalShops.value },
])

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await adminAPI.getDashboard(pendingRange.value)
    websiteViews.value = res.data.website_views
    productViews.value = res.data.product_views
    totalProducts.value = res.data.total_products
    totalShops.value = res.data.total_shops
    topProducts.value = res.data.top_products
  } catch (err) {
    console.error('Failed to load dashboard:', err)
    error.value = 'ไม่สามารถโหลดข้อมูลสรุปได้'
  } finally {
    loading.value = false
  }
}

function formatPrice(price: number | null): string {
  if (price === null) return '-'
  return `฿${price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <!-- ตัวกรองช่วงวันที่ -->
    <div class="bg-white border rounded-xl p-5 space-y-3">
      <h1 class="text-lg font-bold text-gray-800">วันที่แสดงข้อมูล</h1>
      <div class="flex flex-wrap items-center gap-3">
        <select
          v-model="rangeMode"
          aria-label="ช่วงวันที่"
          class="border rounded-lg px-3 py-2 text-sm min-w-[11rem] focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option v-for="opt in RANGE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>

        <!-- โหมดกำหนดเอง: เลือกวันเริ่ม-สิ้นสุดเอง / โหมดอื่น: โชว์ช่วงที่คำนวณให้ -->
        <template v-if="rangeMode === 'custom'">
          <input v-model="customStart" type="date" class="border rounded-lg px-3 py-2 text-sm" />
          <span class="text-gray-500">-</span>
          <input v-model="customEnd" type="date" class="border rounded-lg px-3 py-2 text-sm" />
        </template>
        <div v-else class="border rounded-lg px-4 py-2 text-sm text-gray-500 bg-gray-50 min-w-[15rem]">
          {{ rangeLabel }}
        </div>

        <button
          @click="load"
          :disabled="loading"
          class="px-6 py-2 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50"
        >
          ค้นหา
        </button>
      </div>
    </div>

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <!-- การ์ดสรุป -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div v-for="card in cards" :key="card.label" class="bg-white border rounded-xl p-6 text-center">
        <p class="text-sm text-gray-600">{{ card.label }}</p>
        <p class="mt-4 text-3xl font-bold text-navy-900">
          <span v-if="loading" class="text-gray-300">...</span>
          <span v-else>{{ card.value.toLocaleString('th-TH') }}</span>
        </p>
      </div>
    </div>

    <!-- 10 อันดับสินค้าเข้าชมมากที่สุด -->
    <div class="bg-white border rounded-xl p-5 space-y-3">
      <h2 id="top-products-heading" class="text-base font-bold text-gray-800">10 อันดับสินค้าเข้าชมมากที่สุด</h2>
      <!-- tabindex: จอแคบตารางเลื่อนแนวนอนได้ ต้องโฟกัสด้วยคีย์บอร์ดได้ถึงจะเลื่อนด้วยลูกศรได้ -->
      <div class="overflow-x-auto" tabindex="0" role="region" aria-labelledby="top-products-heading">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-gray-500 border-b">
              <th class="text-left font-medium py-2 pr-4 whitespace-nowrap">รหัสสินค้า</th>
              <th class="text-left font-medium py-2 pr-4">ชื่อสินค้า</th>
              <th class="text-right font-medium py-2 pr-4 whitespace-nowrap">ราคา (บาท)</th>
              <th class="text-right font-medium py-2 whitespace-nowrap">เข้าชม (ครั้ง)</th>
            </tr>
          </thead>
          <tbody>
            <TableRowsSkeleton v-if="loading" :columns="4" />
            <tr v-else-if="topProducts.length === 0">
              <td colspan="4" class="py-6 text-center text-gray-500">ไม่มีข้อมูลการเข้าชมในช่วงวันที่ที่เลือก</td>
            </tr>
            <tr v-for="product in topProducts" :key="product.product_id" class="border-b last:border-0">
              <td class="py-3 pr-4 text-gray-500 whitespace-nowrap align-top">{{ product.product_id }}</td>
              <td class="py-3 pr-4 text-gray-800">{{ product.product_name }}</td>
              <td class="py-3 pr-4 text-right whitespace-nowrap align-top">{{ formatPrice(product.product_price) }}</td>
              <td class="py-3 text-right whitespace-nowrap align-top">{{ product.views.toLocaleString('th-TH') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
