<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Home, ChevronRight, Save, RotateCcw } from 'lucide-vue-next'
import { adminAPI } from '../../services/api'
import { toast } from '../../stores/toast'
import AutoGrowTextarea from '../../components/common/AutoGrowTextarea.vue'

// เพิ่ม/แก้ไขคุณสมบัติสินค้า — หน้าฟอร์มเดี่ยว (ไม่ใช่ popup อีกต่อไป) ตาม
// แพทเทิร์นเดียวกับ AdminBannerFormPage.vue/AdminProductEditPage.vue —
// component เดียวรองรับทั้งสร้าง/แก้ไข (isNew = !route.params.id) — เพิ่ม 4
// ก.ย. 2026: ตั้งค่าคุณสมบัตินี้ให้สินค้าที่เลือกได้ตรงจากฟอร์มนี้เลย (แทนที่
// จะต้องไปเปิดฟอร์มสินค้าทีละตัว) — tbl_attribute เองไม่ผูกกับหมวดหมู่สินค้า
// เลย (ตาราง Category_attribute เดิมถูกลบไปตั้งแต่ 14 ส.ค. 2026)

const route = useRoute()
const router = useRouter()
const isNew = () => !route.params.id

interface ProductOption {
  product_id: string
  product_name: string
}

const form = reactive({ attribute_name: '' })
const loading = ref(true)
const saving = ref(false)
const allProducts = ref<ProductOption[]>([])
const productSearch = ref('')
// product_id -> ค่าที่กรอก — มี key แปลว่า "ติ๊กสินค้านี้ไว้" (แม้ค่าจะว่างอยู่
// ระหว่างพิมพ์ก็ตาม), ไม่มี key แปลว่ายังไม่ได้ติ๊ก
const productValues = ref<Record<string, string>>({})

async function load() {
  loading.value = true
  try {
    const [productsRes, attrRes] = await Promise.all([
      adminAPI.listProducts({ limit: 200 }),
      isNew() ? Promise.resolve(null) : adminAPI.getAttribute(String(route.params.id)),
    ])
    allProducts.value = (productsRes.data.products ?? []).map((p: { product_id: string; product_name: string }) => ({ product_id: p.product_id, product_name: p.product_name }))
    if (attrRes) {
      form.attribute_name = attrRes.data.attribute_name ?? ''
      const values: Record<string, string> = {}
      for (const v of attrRes.data.product_values ?? []) values[v.product_id] = v.value
      productValues.value = values
    }
  } catch {
    toast.error(isNew() ? 'โหลดข้อมูลฟอร์มไม่สำเร็จ' : 'โหลดข้อมูลคุณสมบัติไม่สำเร็จ')
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

// ที่พักค่าตอนติ๊กออก — สถานะ "ติ๊กไว้ไหม" กับ "ค่าที่กรอก" อยู่ใน object
// เดียวกัน (มี key = ติ๊ก) การติ๊กออกจึงต้องลบ key ทิ้ง ซึ่งเดิมทำให้ค่าที่
// พิมพ์ไว้หายไปด้วย พอติ๊กกลับก็ได้ช่องว่างเปล่า ต้องพิมพ์ใหม่ทุกครั้ง —
// เก็บค่าไว้ตรงนี้ก่อนลบ แล้วเติมคืนตอนติ๊กกลับ (อยู่แค่ในหน้านี้ รีเฟรช
// แล้วหาย ซึ่งถูกแล้วเพราะโหลดใหม่จะได้ค่าจริงจาก DB มาแทนอยู่ดี)
const stashedValues: Record<string, string> = {}

function toggleProduct(id: string) {
  const next = { ...productValues.value }
  if (id in next) {
    stashedValues[id] = next[id]
    delete next[id]
  } else {
    next[id] = stashedValues[id] ?? ''
  }
  productValues.value = next
}
const selectedCount = computed(() => Object.keys(productValues.value).length)

async function handleSubmit() {
  if (!form.attribute_name.trim()) {
    toast.error('กรุณากรอกชื่อคุณสมบัติ')
    return
  }
  saving.value = true
  const product_values = Object.entries(productValues.value)
    .filter(([, value]) => value.trim())
    .map(([product_id, value]) => ({ product_id, value: value.trim() }))
  try {
    if (isNew()) {
      await adminAPI.createAttribute({ attribute_name: form.attribute_name.trim(), product_values })
      toast.success('เพิ่มคุณสมบัติแล้ว')
    } else {
      await adminAPI.updateAttribute(Number(route.params.id), { attribute_name: form.attribute_name.trim(), product_values })
      toast.success('บันทึกข้อมูลคุณสมบัติแล้ว')
    }
    router.push('/admin/attributes')
  } catch {
    toast.error(isNew() ? 'เพิ่มคุณสมบัติไม่สำเร็จ' : 'บันทึกข้อมูลคุณสมบัติไม่สำเร็จ')
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
      <router-link to="/admin/attributes" class="hover:text-brand-700 hover:underline">คุณสมบัติสินค้า</router-link>
      <ChevronRight aria-hidden="true" class="w-3.5 h-3.5" />
      <span>ฟอร์มข้อมูล</span>
    </nav>
    <!--ฟอร์มคุณสมบัติสินค้า-->
    <form @submit.prevent="handleSubmit">
      <h1 class="text-xl font-bold text-gray-800">{{ isNew() ? 'เพิ่มคุณสมบัติสินค้า' : 'แก้ไขคุณสมบัติสินค้า' }}</h1>
      <div class="bg-white border rounded-xl p-6 mt-6 space-y-5 max-w-7xl">
        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-center">
          <label class="text-sm text-gray-600 sm:text-right" for="attr-name"><span class="text-red-600">*</span>ชื่อคุณสมบัติ</label>
          <input id="attr-name" v-model="form.attribute_name" placeholder="เช่น RAM" class="w-full border rounded-lg px-3 py-2" autofocus />
        </div>
        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-start pt-2 border-t">
          <span class="text-sm text-gray-600 pt-2 sm:text-right">ค่าคุณสมบัติของสินค้า</span>
          <div class="space-y-2">
            <p class="text-xs text-gray-500">ติ๊กสินค้าที่จะกำหนดค่าคุณสมบัตินี้ให้ แล้วกรอกค่าต่อรายการ</p>
            <input v-model="productSearch" placeholder="ค้นหาสินค้า..." class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <div class="border rounded-lg max-h-72 overflow-y-auto divide-y">
              <p v-if="filteredProducts.length === 0" class="p-3 text-sm text-gray-500 text-center">ไม่พบสินค้า</p>
              <div
                v-for="p in filteredProducts"
                :key="p.product_id"
                class="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50"
              >
                <label class="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="p.product_id in productValues"
                    @change="toggleProduct(p.product_id)"
                    class="rounded border-gray-300 text-brand-700 focus:ring-brand-500 shrink-0"
                  />
                  <span class="truncate">{{ p.product_name }}</span>
                </label>
                <div v-if="p.product_id in productValues" class="w-56 shrink-0" @click.stop>
                  <AutoGrowTextarea v-model="productValues[p.product_id]" placeholder="ค่า เช่น 8GB" :aria-label="`ค่าของ ${p.product_name}`" class="text-sm" />
                </div>
              </div>
            </div>
            <p v-if="selectedCount > 0" class="text-xs text-gray-500">เลือกแล้ว {{ selectedCount }} รายการ</p>
          </div>
        </div>

        <div class="flex gap-2 pt-2">
          <button type="submit" :disabled="saving" class="flex items-center gap-1.5 bg-accent-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-accent-800 disabled:opacity-50">
            <Save aria-hidden="true" class="w-4 h-4" />
            {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
          </button>
          <router-link to="/admin/attributes" class="flex items-center gap-1.5 border text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50">
            <RotateCcw aria-hidden="true" class="w-4 h-4" />
            ย้อนกลับ
          </router-link>
        </div>
      </div>
    </form>
  </div>
</template>