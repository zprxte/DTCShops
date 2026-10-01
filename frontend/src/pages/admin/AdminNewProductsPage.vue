<script setup lang="ts">
// "โฆษณาร้านค้า" > "สินค้าใหม่" — no new table for this at all: it's just
// existing products (tbl_item) that have a sale_start_date/sale_end_date
// set, the same two fields the product-edit form's own "ข้อมูลทั่วไป" tab
// already collects. "เพิ่มรายการใหม่" here just picks an existing product
// and sets those two dates via PATCH /admin/products/:id/sale-dates — NOT the
// edit form's PUT /admin/products/:id, which requires product_name and
// full-replaces the whole product (that mismatch made this page fail with 400
// on every save until 2026-09-11).
import { computed, onMounted, ref } from 'vue'
import TableRowsSkeleton from '../../components/common/TableRowsSkeleton.vue'
import { Plus, Trash2, X } from 'lucide-vue-next'
import { adminAPI } from '../../services/api'
import { toast } from '../../stores/toast'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'

interface Product {
  product_id: string
  product_name: string
  sale_start_date: string | null
  sale_end_date: string | null
}

const allProducts = ref<Product[]>([])
const loading = ref(true)
const pendingRemoveId = ref<string | null>(null)

const newProducts = computed(() => allProducts.value.filter((p) => p.sale_start_date || p.sale_end_date))

function load() {
  loading.value = true
  adminAPI
    .listProducts({ limit: 200 })
    .then((res) => { allProducts.value = res.data.products ?? [] })
    .catch(() => toast.error('โหลดรายการสินค้าไม่สำเร็จ'))
    .finally(() => { loading.value = false })
}
onMounted(load)

// Add-new modal
const modalOpen = ref(false)
const pickProductId = ref('')
const pickStart = ref('')
const pickEnd = ref('')
const saving = ref(false)
const eligibleProducts = computed(() => allProducts.value.filter((p) => !p.sale_start_date && !p.sale_end_date))

function openAdd() {
  pickProductId.value = ''
  pickStart.value = ''
  pickEnd.value = ''
  modalOpen.value = true
}

async function handleAdd() {
  if (!pickProductId.value) {
    toast.error('กรุณาเลือกสินค้า')
    return
  }
  if (pickStart.value && pickEnd.value && pickStart.value > pickEnd.value) {
    toast.error('วันที่จำหน่ายต้องไม่เกินวันที่สิ้นสุด')
    return
  }
  saving.value = true
  try {
    await adminAPI.updateProductSaleDates(pickProductId.value, { sale_start_date: pickStart.value || null, sale_end_date: pickEnd.value || null })
    toast.success('เพิ่มรายการใหม่แล้ว')
    modalOpen.value = false
    load()
  } catch {
    toast.error('บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

async function handleRemove(id: string) {
  try {
    await adminAPI.updateProductSaleDates(id, { sale_start_date: null, sale_end_date: null })
    toast.success('นำออกจากรายการสินค้าใหม่แล้ว')
    load()
  } catch {
    toast.error('ลบไม่สำเร็จ')
  } finally {
    pendingRemoveId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold text-gray-800">รายการสินค้าใหม่</h1>

    <div class="bg-white border rounded-xl p-4 space-y-4">
      <div class="flex items-center justify-between">
        <button type="button" @click="openAdd" class="flex items-center gap-1.5 bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800">
          <Plus aria-hidden="true" class="w-4 h-4" />
          เพิ่มรายการใหม่
        </button>
      </div>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b">
            <th class="py-2 font-medium">รหัสสินค้า</th>
            <th class="py-2 font-medium">ชื่อสินค้า</th>
            <th class="py-2 font-medium">วันที่จำหน่าย</th>
            <th class="py-2 font-medium">ถึงวันที่</th>
            <th class="py-2 font-medium w-32 text-right">การดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          <TableRowsSkeleton v-if="loading" :columns="5" />
          <tr v-if="!loading && newProducts.length === 0"><td colspan="5" class="py-6 text-center text-gray-500">ยังไม่มีสินค้าใหม่</td></tr>
          <tr v-for="p in newProducts" :key="p.product_id" class="border-b last:border-0">
            <td class="py-2.5 text-gray-500">{{ p.product_id }}</td>
            <td class="py-2.5">
              <router-link :to="`/admin/products/${p.product_id}/edit`" class="text-brand-700 hover:underline">{{ p.product_name }}</router-link>
            </td>
            <td class="py-2.5 text-gray-500">{{ p.sale_start_date ? String(p.sale_start_date).slice(0, 10) : '-' }}</td>
            <td class="py-2.5 text-gray-500">{{ p.sale_end_date ? String(p.sale_end_date).slice(0, 10) : '-' }}</td>
            <td class="py-2.5 text-right">
              <button @click="pendingRemoveId = p.product_id" class="flex items-center gap-1 text-red-600 hover:underline ml-auto">
                <Trash2 aria-hidden="true" class="w-3.5 h-3.5" />
                ลบ
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <p class="text-xs text-gray-500">จำนวนข้อมูลทั้งหมด {{ newProducts.length }} รายการ</p>
    </div>

    <div v-if="modalOpen" class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" @click.self="modalOpen = false">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between px-5 py-4 border-b">
          <h2 class="text-base font-bold text-gray-800">เพิ่มรายการใหม่</h2>
          <button type="button" @click="modalOpen = false" class="text-gray-500 hover:text-gray-600" aria-label="ปิด">
            <X aria-hidden="true" class="w-5 h-5" />
          </button>
        </div>
        <form @submit.prevent="handleAdd" class="p-5 space-y-4">
          <label class="text-sm space-y-1 block">
            <span class="text-gray-600">สินค้า <span class="text-red-600">*</span></span>
            <select v-model="pickProductId" class="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">— เลือกสินค้า —</option>
              <option v-for="p in eligibleProducts" :key="p.product_id" :value="p.product_id">{{ p.product_name }}</option>
            </select>
          </label>
          <div class="grid grid-cols-2 gap-4">
            <label class="text-sm space-y-1 block">
              <span class="text-gray-600">วันที่จำหน่าย</span>
              <input v-model="pickStart" type="date" class="w-full border rounded-lg px-3 py-2 text-sm" />
            </label>
            <label class="text-sm space-y-1 block">
              <span class="text-gray-600">ถึงวันที่</span>
              <input v-model="pickEnd" type="date" class="w-full border rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>
          <div class="flex justify-end gap-2 pt-2 border-t">
            <button type="button" @click="modalOpen = false" class="px-4 py-2 text-sm rounded-lg border text-gray-600 hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" :disabled="saving" class="bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50">
              {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <ConfirmDialog
      :open="pendingRemoveId !== null"
      message="นำสินค้านี้ออกจากรายการสินค้าใหม่? (ไม่ได้ลบตัวสินค้า แค่ล้างวันที่จำหน่าย)"
      @confirm="pendingRemoveId !== null && handleRemove(pendingRemoveId)"
      @cancel="pendingRemoveId = null"
    />
  </div>
</template>
