<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import TableRowsSkeleton from '../../components/common/TableRowsSkeleton.vue'
import { Plus, RotateCcw, SquarePen, Trash2, Undo2 } from 'lucide-vue-next'
import { adminAPI, resolveImageUrl } from '../../services/api'
import { toast } from '../../stores/toast'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'

interface Product {
  product_id: string
  sku: string | null
  product_name: string
  product_price: number | string | null
  product_image?: string | null
  category?: { category_name: string } | null
  _count?: { product_model: number }
  removed_at?: string | null
}

const products = ref<Product[]>([])
const total = ref(0)
const q = ref('')
const loading = ref(true)
const pendingDeleteId = ref<string | null>(null)
// แท็บ "สินค้าที่ถูกลบ" — ดึงจาก GET /admin/products?deleted=1 (ตัวเดียวกับ
// ลิสต์ปกติ แค่กลับด้านเงื่อนไข itm_flag) ให้กู้คืนสินค้าที่ลบผิดได้ (เดิมกด
// "ลบ" แล้วไม่มีทางย้อนกลับเลยนอกจากแก้ DB ตรงๆ)
const viewDeleted = ref(false)
const restoringId = ref<string | null>(null)

// เลขคำขอล่าสุด — พิมพ์เร็วๆ คำขอเก่าอาจตอบกลับทีหลังคำขอใหม่ ให้ใช้ผลของคำขอล่าสุดเท่านั้น
let latestRequest = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined

function load() {
  clearTimeout(searchTimer)
  const requestId = ++latestRequest
  loading.value = true
  adminAPI
    .listProducts({ q: q.value, limit: 50, deleted: viewDeleted.value ? '1' : undefined })
    .then((res) => {
      if (requestId !== latestRequest) return
      products.value = res.data.products ?? []
      total.value = res.data.total ?? 0
    })
    .catch(() => { if (requestId === latestRequest) toast.error('โหลดรายการสินค้าไม่สำเร็จ') })
    .finally(() => { if (requestId === latestRequest) loading.value = false })
}

onMounted(load)
onBeforeUnmount(() => clearTimeout(searchTimer))

// ค้นหาทันทีขณะพิมพ์ แบบเดียวกับหน้าคุณสมบัติสินค้า — แต่ยังค้นฝั่ง backend (fuzzy)
// จึงรอให้หยุดพิมพ์ 300ms ก่อนยิงคำขอ ไม่ยิงทุกตัวอักษร
function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 300)
}

function resetSearch() {
  q.value = ''
  load()
}

function switchTab(deleted: boolean) {
  if (viewDeleted.value === deleted) return
  viewDeleted.value = deleted
  q.value = ''
  load()
}

async function handleDelete(id: string) {
  try {
    await adminAPI.deleteProduct(id)
    toast.success('ลบสินค้าแล้ว')
    load()
  } catch {
    toast.error('ลบไม่สำเร็จ')
  } finally {
    pendingDeleteId.value = null
  }
}

async function handleRestore(id: string) {
  restoringId.value = id
  try {
    await adminAPI.restoreProduct(id)
    toast.success('กู้คืนสินค้าแล้ว')
    load()
  } catch {
    toast.error('กู้คืนไม่สำเร็จ')
  } finally {
    restoringId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-gray-800">สินค้าของฉัน</h1>
      <div class="flex gap-2">
        <router-link to="/admin/products/new" class="flex items-center gap-1.5 bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800">
          <Plus aria-hidden="true" class="w-4 h-4" />
          เพิ่มสินค้าใหม่
        </router-link>
        <button @click="resetSearch" class="flex items-center gap-1.5 bg-accent-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-accent-800">
          <RotateCcw aria-hidden="true" class="w-4 h-4" />
          รีเซ็ต
        </button>
      </div>
    </div>

    <div class="bg-white border rounded-xl p-4 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex gap-4">
          <button
            type="button"
            @click="switchTab(false)"
            class="text-sm font-medium pb-1 border-b-2 transition-colors"
            :class="!viewDeleted ? 'text-brand-700 border-brand-600' : 'text-gray-500 border-transparent hover:text-gray-600'"
          >
            สินค้าทั้งหมด{{ !viewDeleted ? ` (${total})` : '' }}
          </button>
          <button
            type="button"
            @click="switchTab(true)"
            class="flex items-center gap-1 text-sm font-medium pb-1 border-b-2 transition-colors"
            :class="viewDeleted ? 'text-brand-700 border-brand-600' : 'text-gray-500 border-transparent hover:text-gray-600'"
          >
            <Trash2 aria-hidden="true" class="w-3.5 h-3.5" />
            สินค้าที่ถูกลบ{{ viewDeleted ? ` (${total})` : '' }}
          </button>
        </div>
        <input v-model="q" @input="onSearchInput" @keydown.enter.prevent="load" placeholder="ค้นหาสินค้า..." class="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b">
            <th class="py-2 font-medium">สินค้า</th>
            <th class="py-2 font-medium">หมวดหมู่</th>
            <th class="py-2 font-medium">ราคา</th>
            <th class="py-2 font-medium w-40 text-right">การดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          <TableRowsSkeleton v-if="loading" :columns="5" />
          <tr v-if="!loading && products.length === 0">
            <td colspan="5" class="py-6 text-center text-gray-500">
              <template v-if="viewDeleted">ไม่มีสินค้าที่ถูกลบ</template>
              <template v-else-if="q.trim()">
                ไม่พบสินค้าที่ตรงกับ "{{ q.trim() }}"
                <button type="button" class="ml-2 text-brand-700 hover:underline" @click="q = ''; load()">ล้างคำค้น</button>
              </template>
              <template v-else>
                ยังไม่มีสินค้า
                <router-link to="/admin/products/new" class="ml-2 text-brand-700 hover:underline">เพิ่มสินค้า</router-link>
                ·
                <router-link to="/admin/import" class="text-brand-700 hover:underline">นำเข้าจาก Excel</router-link>
              </template>
            </td>
          </tr>
          <tr v-for="p in products" :key="p.product_id" class="border-b last:border-0 align-top">
            <td class="py-3 pr-4">
              <div class="flex gap-3">
                <img loading="lazy" decoding="async"
                  :src="resolveImageUrl(p.product_image) || '/DTC_icon.png'"
                  class="w-12 h-12 rounded-lg border object-cover shrink-0 bg-gray-50"
                  alt=""
                />
                <div>
                  <p class="font-medium text-gray-800 leading-snug">{{ p.product_name }}</p>
                  <p class="text-xs text-gray-500 mt-1">SKU: {{ p.sku || 'ไม่มีข้อมูล' }}</p>
                  <p class="text-xs text-gray-500">รหัสสินค้า: {{ p.product_id }}</p>
                  <p v-if="viewDeleted && p.removed_at" class="text-xs text-red-400 mt-1">
                    ลบเมื่อ: {{ new Date(p.removed_at).toLocaleString('th-TH') }}
                  </p>
                </div>
              </div>
            </td>
            <td class="py-3">{{ p.category?.category_name ?? '-' }}</td>
            <td class="py-3">{{ p.product_price ? `฿${Number(p.product_price).toLocaleString()}` : '-' }}</td>
            <td class="py-3 text-right">
              <div v-if="!viewDeleted" class="flex justify-end gap-3">
                <router-link :to="`/admin/products/${p.product_id}/edit`" class="flex items-center gap-1 text-brand-700 hover:underline">
                  <SquarePen aria-hidden="true" class="w-3.5 h-3.5" />
                  แก้ไข
                </router-link>
                <button @click="pendingDeleteId = p.product_id" class="flex items-center gap-1 text-red-600 hover:underline">
                  <Trash2 aria-hidden="true" class="w-3.5 h-3.5" />
                  ลบ
                </button>
              </div>
              <div v-else class="flex justify-end">
                <button
                  @click="handleRestore(p.product_id)"
                  :disabled="restoringId === p.product_id"
                  class="flex items-center gap-1 text-brand-700 hover:underline disabled:opacity-50"
                >
                  <Undo2 aria-hidden="true" class="w-3.5 h-3.5" />
                  {{ restoringId === p.product_id ? 'กำลังกู้คืน...' : 'กู้คืน' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      message="ยืนยันการลบสินค้านี้?"
      @confirm="pendingDeleteId !== null && handleDelete(pendingDeleteId)"
      @cancel="pendingDeleteId = null"
    />
  </div>
</template>
