<script setup lang="ts">
// "สินค้า" > "โมเดลสินค้า" — a browse-everything view across all products'
// models. เพิ่ม/แก้ไข ย้ายไปเป็นฟอร์มเต็มหน้า (AdminModelFormPage.vue, 4 ก.ย.
// 2026 — เดิมเป็น popup) หน้านี้เหลือแค่รายการ + ลบ, จัดกลุ่มแถวตามประเภท
// สินค้าของสินค้าที่เป็นเจ้าของโมเดลนั้น (โมเดลที่ยังไม่มีเจ้าของ หรือสินค้า
// เจ้าของยังไม่ได้ตั้งประเภท จะอยู่กลุ่ม "ยังไม่ได้ผูกกับสินค้า/ไม่มีประเภท")
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Plus, SquarePen, Trash2 } from 'lucide-vue-next'
import { adminAPI } from '../../services/api'
import { toast } from '../../stores/toast'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'

interface ModelRow {
  model_id: string
  model_name: string
  product_price: number | null
  stock_quantity: number | null
  product: { product_id: string; product_name: string; category_id: string | null; category_name: string | null } | null
}

const UNGROUPED_KEY = '__ungrouped__'
const UNGROUPED_LABEL = 'ยังไม่ได้ผูกกับสินค้า / ไม่มีประเภท'

const rows = ref<ModelRow[]>([])
const q = ref('')
const loading = ref(true)
const pendingDeleteId = ref<string | null>(null)
const deleting = ref(false)

// เลขคำขอล่าสุด — พิมพ์เร็วๆ คำขอเก่าอาจตอบกลับทีหลังคำขอใหม่ ให้ใช้ผลของคำขอล่าสุดเท่านั้น
let latestRequest = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined

function load() {
  clearTimeout(searchTimer)
  const requestId = ++latestRequest
  loading.value = true
  adminAPI
    .listModels({ q: q.value })
    .then((res) => { if (requestId === latestRequest) rows.value = res.data })
    .catch(() => { if (requestId === latestRequest) toast.error('โหลดโมเดลสินค้าไม่สำเร็จ') })
    .finally(() => { if (requestId === latestRequest) loading.value = false })
}
onMounted(load)

// ค้นหาทันทีขณะพิมพ์ (แบบเดียวกับหน้าสินค้า/คุณสมบัติ) — รอหยุดพิมพ์ 300ms ก่อนยิงคำขอ
function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 300)
}
onBeforeUnmount(() => clearTimeout(searchTimer))

const groups = computed(() => {
  const map = new Map<string, { label: string; rows: ModelRow[] }>()
  for (const r of rows.value) {
    const key = r.product?.category_id ?? UNGROUPED_KEY
    const label = r.product?.category_name ?? UNGROUPED_LABEL
    if (!map.has(key)) map.set(key, { label, rows: [] })
    map.get(key)!.rows.push(r)
  }
  return Array.from(map.values())
    .sort((a, b) => (a.label === UNGROUPED_LABEL ? 1 : b.label === UNGROUPED_LABEL ? -1 : a.label.localeCompare(b.label, 'th')))
})

async function handleDelete(id: string) {
  deleting.value = true
  try {
    await adminAPI.deleteModel(id)
    toast.success('ลบโมเดลแล้ว')
    load()
  } catch {
    toast.error('ลบไม่สำเร็จ')
  } finally {
    deleting.value = false
    pendingDeleteId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-gray-800">โมเดลสินค้า</h1>
      <router-link to="/admin/models/new" class="flex items-center gap-1.5 bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800">
        <Plus aria-hidden="true" class="w-4 h-4" />
        เพิ่มโมเดล
      </router-link>
    </div>

    <div class="bg-white border rounded-xl p-4 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-gray-500 max-w-md">
          รวมโมเดลของสินค้าทุกชิ้นมาไว้ที่เดียว จัดกลุ่มตามประเภทสินค้าของสินค้าที่เป็นเจ้าของโมเดลนั้น
        </p>
        <input v-model="q" @input="onSearchInput" @keydown.enter.prevent="load" placeholder="ค้นหาโมเดล/สินค้า..." class="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      <p v-if="loading" class="py-6 text-center text-sm text-gray-500">กำลังโหลด...</p>
      <p v-else-if="rows.length === 0" class="py-6 text-center text-sm text-gray-500">ยังไม่มีโมเดลสินค้า</p>

      <div v-else class="space-y-6">
        <div v-for="group in groups" :key="group.label">
          <h2 class="text-sm font-bold text-brand-700 mb-2 pb-1 border-b">{{ group.label }} <span class="text-gray-500 font-normal">({{ group.rows.length }})</span></h2>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b">
                <th class="py-2 font-medium">โมเดลสินค้า</th>
                <th class="py-2 font-medium">สินค้า</th>
                <th class="py-2 font-medium">ราคา</th>
                <th class="py-2 font-medium">สต็อก</th>
                <th class="py-2 font-medium w-40 text-right">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in group.rows" :key="r.model_id" class="border-b last:border-0">
                <td class="py-2.5">{{ r.model_name }}</td>
                <td class="py-2.5 text-gray-500">
                  <router-link v-if="r.product" :to="`/admin/products/${r.product.product_id}/edit`" class="text-brand-700 hover:underline">
                    {{ r.product.product_name }}
                  </router-link>
                  <span v-else>-</span>
                </td>
                <td class="py-2.5">{{ r.product_price != null ? `฿${Number(r.product_price).toLocaleString()}` : '-' }}</td>
                <td class="py-2.5">{{ r.stock_quantity ?? '-' }}</td>
                <td class="py-2.5 text-right">
                  <div class="flex justify-end gap-3">
                    <router-link :to="`/admin/models/${r.model_id}/edit`" class="flex items-center gap-1 text-brand-700 hover:underline">
                      <SquarePen aria-hidden="true" class="w-3.5 h-3.5" />
                      แก้ไข
                    </router-link>
                    <button type="button" @click="pendingDeleteId = r.model_id" class="flex items-center gap-1 text-red-600 hover:underline">
                      <Trash2 aria-hidden="true" class="w-3.5 h-3.5" />
                      ลบ
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p class="text-xs text-gray-500">จำนวนข้อมูลทั้งหมด {{ rows.length }} รายการ</p>
    </div>

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      message="ยืนยันการลบโมเดลนี้? คุณสมบัติย่อยเฉพาะโมเดลนี้จะถูกลบไปด้วย"
      @confirm="pendingDeleteId !== null && handleDelete(pendingDeleteId)"
      @cancel="pendingDeleteId = null"
    />
  </div>
</template>
