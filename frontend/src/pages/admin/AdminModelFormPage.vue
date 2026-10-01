<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Home, ChevronRight, Save, RotateCcw, Plus, X } from 'lucide-vue-next'
import { adminAPI } from '../../services/api'
import { toast } from '../../stores/toast'
import AttributeNameCombobox from '../../components/common/AttributeNameCombobox.vue'
import AutoGrowTextarea from '../../components/common/AutoGrowTextarea.vue'

// เพิ่ม/แก้ไขโมเดลสินค้า — หน้าฟอร์มเดี่ยว (ไม่ใช่ popup อีกต่อไป) ตาม
// แพทเทิร์นเดียวกับ AdminBannerFormPage.vue — component เดียวรองรับทั้ง
// สร้าง/แก้ไข (isNew = !route.params.id) — ต่างจาก popup เดิมตรงที่แก้ไขได้
// ทั้งชื่อโมเดลและสินค้าที่ผูกอยู่ด้วย (ของเดิมแก้ได้แค่ราคา/สต็อก/สเปคย่อย)

const route = useRoute()
const router = useRouter()
const isNew = () => !route.params.id

interface ProductOption {
  product_id: string
  product_name: string
}
interface Attribute {
  attribute_id: number
  attribute_name: string
}

const form = reactive({
  model_name: '',
  product_price: '',
  stock_quantity: '',
  attributes: [] as { name: string; value: string }[],
})
const selectedProductId = ref<string | null>(null)
const loading = ref(true)
const saving = ref(false)
const allProducts = ref<ProductOption[]>([])
const productSearch = ref('')
const allAttributeNames = ref<string[]>([])

async function load() {
  loading.value = true
  try {
    const [productsRes, attrRes, modelRes] = await Promise.all([
      adminAPI.listProducts({ limit: 200 }),
      adminAPI.listAttributes(),
      isNew() ? Promise.resolve(null) : adminAPI.getModel(String(route.params.id)),
    ])
    allProducts.value = (productsRes.data.products ?? []).map((p: { product_id: string; product_name: string }) => ({ product_id: p.product_id, product_name: p.product_name }))
    allAttributeNames.value = attrRes.data.map((a: Attribute) => a.attribute_name)
    if (modelRes) {
      const m = modelRes.data
      form.model_name = m.model_name ?? ''
      form.product_price = m.product_price != null ? String(m.product_price) : ''
      form.stock_quantity = m.stock_quantity != null ? String(m.stock_quantity) : ''
      form.attributes = (m.product_attribute_value ?? []).map((a: { value: string; attribute: Attribute }) => ({ name: a.attribute.attribute_name, value: a.value }))
      selectedProductId.value = m.product?.product_id ?? null
    }
  } catch {
    toast.error(isNew() ? 'โหลดข้อมูลฟอร์มไม่สำเร็จ' : 'โหลดข้อมูลโมเดลไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}
load()

const filteredProducts = computed(() => {
  const term = productSearch.value.trim().toLowerCase()
  if (!term) return allProducts.value
  return allProducts.value.filter((p) => p.product_name.toLowerCase().includes(term))
})

function toggleSelectedProduct(id: string) {
  selectedProductId.value = selectedProductId.value === id ? null : id
}

function addAttribute() {
  form.attributes.push({ name: '', value: '' })
}
function removeAttribute(index: number) {
  form.attributes.splice(index, 1)
}

async function handleSubmit() {
  if (!selectedProductId.value) {
    toast.error('กรุณาเลือกสินค้า')
    return
  }
  if (!form.model_name.trim()) {
    toast.error('กรุณากรอกชื่อโมเดล')
    return
  }
  saving.value = true
  const attributes = form.attributes.filter((a) => a.name.trim() && a.value.trim()).map((a) => ({ attribute_name: a.name.trim(), value: a.value.trim() }))
  try {
    if (isNew()) {
      await adminAPI.createModel({
        product_id: selectedProductId.value,
        model_name: form.model_name.trim(),
        product_price: form.product_price,
        stock_quantity: form.stock_quantity,
        attributes,
      })
      toast.success('เพิ่มโมเดลแล้ว')
    } else {
      await adminAPI.updateModel(String(route.params.id), {
        product_id: selectedProductId.value,
        model_name: form.model_name.trim(),
        product_price: form.product_price,
        stock_quantity: form.stock_quantity,
        attributes,
      })
      toast.success('บันทึกข้อมูลโมเดลแล้ว')
    }
    router.push('/admin/models')
  } catch {
    toast.error(isNew() ? 'เพิ่มโมเดลไม่สำเร็จ' : 'บันทึกข้อมูลโมเดลไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <p v-if="loading" class="p-4 text-sm text-gray-500">กำลังโหลด...</p>

  <div v-else class="space-y-4">
    <nav class="flex items-center gap-1.5 text-sm text-gray-500">
      <Home aria-hidden="true" class="w-3.5 h-3.5" />
      <router-link to="/admin/models" class="hover:text-brand-700 hover:underline">โมเดลสินค้า</router-link>
      <ChevronRight aria-hidden="true" class="w-3.5 h-3.5" />
      <span>ฟอร์มข้อมูล</span>
    </nav>

    <form @submit.prevent="handleSubmit">
      <h1 class="text-xl font-bold text-gray-800">{{ isNew() ? 'เพิ่มโมเดลสินค้า' : 'แก้ไขโมเดลสินค้า' }}</h1>

      <div class="bg-white border rounded-xl p-4 mt-4 space-y-4">
        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-start">
          <span class="text-sm text-gray-600 pt-2 sm:text-right"><span class="text-red-600">*</span>สินค้า</span>
          <div class="space-y-2">
            <input v-model="productSearch" placeholder="ค้นหาสินค้า..." class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <div class="border rounded-lg max-h-52 overflow-y-auto divide-y">
              <p v-if="filteredProducts.length === 0" class="p-3 text-sm text-gray-500 text-center">ไม่พบสินค้า</p>
              <label
                v-for="p in filteredProducts"
                :key="p.product_id"
                class="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  :checked="selectedProductId === p.product_id"
                  @change="toggleSelectedProduct(p.product_id)"
                  class="rounded border-gray-300 text-brand-700 focus:ring-brand-500"
                />
                {{ p.product_name }}
              </label>
            </div>
          </div>
        </div>

        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-center">
          <label class="text-sm text-gray-600 sm:text-right" for="model-name"><span class="text-red-600">*</span>ชื่อโมเดล</label>
          <input id="model-name" v-model="form.model_name" placeholder="เช่น K2 Car Charger" class="w-full border rounded-lg px-3 py-2" />
        </div>

        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-center">
          <span class="text-sm text-gray-600 sm:text-right">ราคา / สต็อก</span>
          <div class="grid grid-cols-2 gap-3">
            <input v-model="form.product_price" type="number" step="0.01" placeholder="ราคา" class="w-full border rounded-lg px-3 py-2" />
            <input v-model="form.stock_quantity" type="number" placeholder="สต็อก" class="w-full border rounded-lg px-3 py-2" />
          </div>
        </div>

        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-start pt-2 border-t">
          <span class="text-sm text-gray-600 pt-2 sm:text-right">คุณสมบัติย่อยเฉพาะโมเดลนี้</span>
          <div class="space-y-2">
            <p class="text-xs text-gray-500">ทับค่าที่ใช้ร่วมกันในสินค้าแม่ ถ้าตั้งชื่อซ้ำกัน</p>
            <!-- หัวคอลัมน์ — เหตุผลเดียวกับแถวเพิ่มคุณสมบัติในฟอร์มสินค้า:
                 placeholder หายตั้งแต่พิมพ์ตัวแรก ป้ายชื่อต้องอยู่ถาวร -->
            <div v-if="form.attributes.length > 0" class="flex items-center gap-2 text-xs text-gray-500">
              <span class="flex-1">ชื่อสเปค</span>
              <span class="flex-1">ค่า</span>
              <span class="w-4 shrink-0" aria-hidden="true"></span>
            </div>
            <div v-for="(attr, ai) in form.attributes" :key="ai" class="flex items-start gap-2">
              <AttributeNameCombobox v-model="attr.name" :options="allAttributeNames" placeholder="ชื่อสเปค เช่น รูปแบบการติดตั้ง" :aria-label="`ชื่อสเปคแถวที่ ${ai + 1}`" class="flex-1" />
              <AutoGrowTextarea v-model="attr.value" placeholder="ค่า เช่น ต่อที่ช่องจุดบุหรี่" :aria-label="`ค่าของสเปคแถวที่ ${ai + 1}`" class="flex-1 text-sm" />
              <button type="button" @click="removeAttribute(ai)" class="text-gray-500 hover:text-red-600 shrink-0 mt-2.5" :aria-label="`ลบสเปคแถวที่ ${ai + 1}`">
                <X aria-hidden="true" class="w-4 h-4" />
              </button>
            </div>
            <button type="button" @click="addAttribute" class="flex items-center gap-1.5 text-xs text-brand-700 hover:text-brand-700">
              <Plus aria-hidden="true" class="w-3.5 h-3.5" />
              เพิ่มคุณสมบัติย่อย
            </button>
          </div>
        </div>

        <div class="flex gap-2 pt-2">
          <button type="submit" :disabled="saving" class="flex items-center gap-1.5 bg-accent-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-accent-800 disabled:opacity-50">
            <Save aria-hidden="true" class="w-4 h-4" />
            {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
          </button>
          <router-link to="/admin/models" class="flex items-center gap-1.5 border text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50">
            <RotateCcw aria-hidden="true" class="w-4 h-4" />
            ย้อนกลับ
          </router-link>
        </div>
      </div>
    </form>
  </div>
</template>
