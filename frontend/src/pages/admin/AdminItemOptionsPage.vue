<script setup lang="ts">
// "สินค้า" > "ตัวเลือกสินค้า" — ของเสริม/อุปกรณ์เสริมที่ซื้อเพิ่มพร้อมสินค้าได้
// (SD Card, เซ็นเซอร์วัดน้ำมัน, เครื่องอ่านบัตร DLT) เก็บใน tbl_item_option
// ผูกกับสินค้าผ่าน tbl_item.itm_option_code (คอมม่าคั่น)
//
// ต่างจาก "โมเดลสินค้า" 2 จุดสำคัญ:
//   1. ใช้ร่วมกันได้ — สินค้าหลายตัวติ๊กตัวเลือกเดียวกันพร้อมกันได้ ไม่ต้องแย่งเจ้าของ
//   2. ไม่ถูกดึงเข้าตารางเปรียบเทียบ (คำขอผู้ใช้ 2026-09-09)
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Plus, SquarePen, Trash2, X } from 'lucide-vue-next'
import { adminAPI } from '../../services/api'
import { toast } from '../../stores/toast'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'

interface OptionRow {
  option_id: string
  option_name: string
  addon_price: number
  stock_quantity: number
  products: { product_id: string; product_name: string }[]
}

interface ProductPick {
  product_id: string
  product_name: string
}

const rows = ref<OptionRow[]>([])
const products = ref<ProductPick[]>([])
const q = ref('')
const loading = ref(true)
const pendingDeleteId = ref<string | null>(null)

//ฟอร์มเพิ่ม/แก้ไข — ทำเป็น popup ในหน้าเดียวกัน (ฟิลด์น้อยกว่าโมเดลมาก
//ไม่มีสเปคย่อย จึงไม่ต้องแยกเป็นฟอร์มเต็มหน้าเหมือน AdminModelFormPage)
const formOpen = ref(false)
const editingId = ref<string | null>(null)
const form = ref({ option_name: '', addon_price: '', stock_quantity: '' })
const selectedProductIds = ref<string[]>([])
const productFilter = ref('')
const saving = ref(false)

// เลขคำขอล่าสุด — พิมพ์เร็วๆ คำขอเก่าอาจตอบกลับทีหลังคำขอใหม่ ให้ใช้ผลของคำขอล่าสุดเท่านั้น
let latestRequest = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined

function load() {
  clearTimeout(searchTimer)
  const requestId = ++latestRequest
  loading.value = true
  adminAPI
    .listOptions({ q: q.value })
    .then((res) => { if (requestId === latestRequest) rows.value = res.data })
    .catch(() => { if (requestId === latestRequest) toast.error('โหลดตัวเลือกสินค้าไม่สำเร็จ') })
    .finally(() => { if (requestId === latestRequest) loading.value = false })
}

// ค้นหาทันทีขณะพิมพ์ (แบบเดียวกับหน้าสินค้า/คุณสมบัติ) — รอหยุดพิมพ์ 300ms ก่อนยิงคำขอ
function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 300)
}
onBeforeUnmount(() => clearTimeout(searchTimer))

onMounted(() => {
  load()
  adminAPI
    .listProducts({ limit: 500 })
    .then((res) => {
      const list = res.data.products ?? res.data ?? []
      products.value = list.map((p: { product_id: string; product_name: string }) => ({
        product_id: p.product_id,
        product_name: p.product_name,
      }))
    })
    .catch(() => { products.value = [] })
})

const filteredProducts = computed(() => {
  const term = productFilter.value.trim().toLowerCase()
  if (!term) return products.value
  return products.value.filter((p) => p.product_name?.toLowerCase().includes(term))
})

function openCreate() {
  editingId.value = null
  form.value = { option_name: '', addon_price: '', stock_quantity: '' }
  selectedProductIds.value = []
  productFilter.value = ''
  formOpen.value = true
}

function openEdit(row: OptionRow) {
  editingId.value = row.option_id
  form.value = {
    option_name: row.option_name ?? '',
    addon_price: String(row.addon_price ?? 0),
    stock_quantity: String(row.stock_quantity ?? 0),
  }
  selectedProductIds.value = row.products.map((p) => p.product_id)
  productFilter.value = ''
  formOpen.value = true
}

function toggleProduct(productId: string) {
  selectedProductIds.value = selectedProductIds.value.includes(productId)
    ? selectedProductIds.value.filter((id) => id !== productId)
    : [...selectedProductIds.value, productId]
}

async function save() {
  if (!form.value.option_name.trim()) {
    toast.error('กรุณากรอกชื่อตัวเลือกสินค้า')
    return
  }
  saving.value = true
  const payload = {
    option_name: form.value.option_name.trim(),
    addon_price: form.value.addon_price === '' ? 0 : Number(form.value.addon_price),
    stock_quantity: form.value.stock_quantity === '' ? 0 : Number(form.value.stock_quantity),
    product_ids: selectedProductIds.value,
  }
  try {
    if (editingId.value) {
      await adminAPI.updateOption(editingId.value, payload)
      toast.success('บันทึกตัวเลือกสินค้าแล้ว')
    } else {
      await adminAPI.createOption(payload)
      toast.success('เพิ่มตัวเลือกสินค้าแล้ว')
    }
    formOpen.value = false
    load()
  } catch {
    toast.error('บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: string) {
  try {
    await adminAPI.deleteOption(id)
    toast.success('ลบตัวเลือกสินค้าแล้ว')
    load()
  } catch {
    toast.error('ลบไม่สำเร็จ')
  } finally {
    pendingDeleteId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-gray-800">รายการตัวเลือกสินค้า</h1>
      <button
        type="button"
        @click="openCreate"
        class="flex items-center gap-1.5 bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800"
      >
        <Plus aria-hidden="true" class="w-4 h-4" />
        เพิ่มตัวเลือก
      </button>
    </div>

    <div class="bg-white border rounded-xl p-4 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-gray-500 max-w-lg">
          ของเสริมที่ลูกค้าเลือกซื้อเพิ่มพร้อมสินค้าได้ (เช่น SD Card, เซ็นเซอร์วัดน้ำมัน) —
          ใช้ร่วมกันได้หลายสินค้า และไม่ถูกนำไปแสดงในตารางเปรียบเทียบสินค้า
        </p>
        <input
          v-model="q"
          @input="onSearchInput"
          @keydown.enter.prevent="load"
          placeholder="ค้นหาตัวเลือก..."
          class="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <p v-if="loading" class="py-6 text-center text-sm text-gray-500">กำลังโหลด...</p>
      <p v-else-if="rows.length === 0" class="py-6 text-center text-sm text-gray-500">ยังไม่มีตัวเลือกสินค้า</p>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b">
            <th class="py-2 font-medium">ตัวเลือกสินค้า</th>
            <th class="py-2 font-medium">ราคาเพิ่ม</th>
            <th class="py-2 font-medium">สต็อก</th>
            <th class="py-2 font-medium">ใช้กับสินค้า</th>
            <th class="py-2 font-medium w-40 text-right">การดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.option_id" class="border-b last:border-0 align-top">
            <td class="py-2.5">{{ r.option_name }}</td>
            <td class="py-2.5">{{ r.addon_price > 0 ? `+฿${Number(r.addon_price).toLocaleString()}` : 'ไม่มีค่าใช้จ่ายเพิ่ม' }}</td>
            <td class="py-2.5">{{ r.stock_quantity ?? '-' }}</td>
            <td class="py-2.5 text-gray-500">
              <div v-if="r.products.length > 0" class="space-y-0.5">
                <router-link
                  v-for="p in r.products"
                  :key="p.product_id"
                  :to="`/admin/products/${p.product_id}/edit`"
                  class="block text-brand-700 hover:underline truncate max-w-xs"
                >
                  {{ p.product_name }}
                </router-link>
              </div>
              <span v-else>ยังไม่ได้ผูกกับสินค้าใด</span>
            </td>
            <td class="py-2.5 text-right">
              <div class="flex justify-end gap-3">
                <button type="button" @click="openEdit(r)" class="flex items-center gap-1 text-brand-700 hover:underline">
                  <SquarePen aria-hidden="true" class="w-3.5 h-3.5" />
                  แก้ไข
                </button>
                <button type="button" @click="pendingDeleteId = r.option_id" class="flex items-center gap-1 text-red-600 hover:underline">
                  <Trash2 aria-hidden="true" class="w-3.5 h-3.5" />
                  ลบ
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <p class="text-xs text-gray-500">จำนวนข้อมูลทั้งหมด {{ rows.length }} รายการ</p>
    </div>

    <!-- ฟอร์มเพิ่ม/แก้ไข -->
    <div v-if="formOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" @click="formOpen = false">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[85vh] overflow-y-auto" @click.stop>
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-900">
            {{ editingId ? 'แก้ไขตัวเลือกสินค้า' : 'เพิ่มตัวเลือกสินค้า' }}
          </h2>
          <button type="button" @click="formOpen = false" class="text-gray-500 hover:text-gray-600">
            <X aria-hidden="true" class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-3">
          <div>
            <label class="block text-sm text-gray-600 mb-1">ชื่อตัวเลือก <span class="text-red-600">*</span></label>
            <input
              v-model="form.option_name"
              placeholder="เช่น SD Card 64GB (Class10 U1)"
              class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm text-gray-600 mb-1">ราคาเพิ่ม (บาท)</label>
              <input v-model="form.addon_price" type="number" min="0" class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label class="block text-sm text-gray-600 mb-1">สต็อก</label>
              <input v-model="form.stock_quantity" type="number" min="0" class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-sm text-gray-600">ใช้กับสินค้า ({{ selectedProductIds.length }})</label>
              <input
                v-model="productFilter"
                placeholder="ค้นหาสินค้า..."
                class="border rounded-lg px-2 py-1 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div class="border rounded-lg max-h-52 overflow-y-auto divide-y">
              <label
                v-for="p in filteredProducts"
                :key="p.product_id"
                class="flex items-start gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="selectedProductIds.includes(p.product_id)"
                  @change="toggleProduct(p.product_id)"
                  class="mt-0.5"
                />
                <span class="text-gray-700">{{ p.product_name }}</span>
              </label>
              <p v-if="filteredProducts.length === 0" class="px-3 py-4 text-center text-xs text-gray-500">ไม่พบสินค้า</p>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" @click="formOpen = false" class="px-3 py-1.5 text-sm rounded-lg border text-gray-600 hover:bg-gray-50">
            ยกเลิก
          </button>
          <button
            type="button"
            :disabled="saving"
            @click="save"
            class="px-3 py-1.5 text-sm rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      message="ยืนยันการลบตัวเลือกสินค้านี้? ตัวเลือกจะถูกปลดออกจากสินค้าทุกชิ้นที่ใช้อยู่"
      @confirm="pendingDeleteId !== null && handleDelete(pendingDeleteId)"
      @cancel="pendingDeleteId = null"
    />
  </div>
</template>
