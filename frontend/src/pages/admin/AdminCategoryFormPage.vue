<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Home, ChevronRight, Save, RotateCcw, ImagePlus, Trash2 } from 'lucide-vue-next'
import { adminAPI, resolveImageUrl } from '../../services/api'
import { toast } from '../../stores/toast'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'

// เพิ่ม/แก้ไขประเภทสินค้า — หน้าฟอร์มเดี่ยว (ไม่ใช่ popup อีกต่อไป) ตาม
// แพทเทิร์นเดียวกับ AdminBannerFormPage.vue — component เดียวรองรับทั้ง
// สร้าง/แก้ไข (isNew = !route.params.id) — มีช่องเลือกสินค้าที่จะย้ายเข้ามา
// อยู่ในหมวดนี้ (ไม่บังคับ) เหมือนตอนเป็น popup, ตอนแก้ไขจะ pre-check สินค้า
// ที่อยู่ในหมวดนี้อยู่แล้วให้ (จาก GET /admin/categories/:id's product_ids)

const route = useRoute()
const router = useRouter()
const isNew = () => !route.params.id

interface ProductOption {
  product_id: string
  product_name: string
}

const form = reactive({ category_name: '' })
const loading = ref(true)
const saving = ref(false)
const allProducts = ref<ProductOption[]>([])
const productSearch = ref('')
const selectedProductIds = ref<Set<string>>(new Set())
// รูปหมวดหมู่ (tbl_item_type.thumbnail) — แสดงในการ์ดหมวดหมู่หน้าแรกของเว็บและแอป
const thumbnail = ref<string | null>(null)
const uploadingImage = ref(false)
const pendingImageDelete = ref(false)

async function load() {
  loading.value = true
  try {
    const [productsRes, categoryRes] = await Promise.all([
      adminAPI.listProducts({ limit: 200 }),
      isNew() ? Promise.resolve(null) : adminAPI.getCategory(String(route.params.id)),
    ])
    allProducts.value = (productsRes.data.products ?? []).map((p: { product_id: string; product_name: string }) => ({ product_id: p.product_id, product_name: p.product_name }))
    if (categoryRes) {
      form.category_name = categoryRes.data.category_name ?? ''
      thumbnail.value = categoryRes.data.thumbnail ?? null
      selectedProductIds.value = new Set((categoryRes.data.product_ids ?? []) as string[])
    }
  } catch {
    toast.error(isNew() ? 'โหลดข้อมูลฟอร์มไม่สำเร็จ' : 'โหลดข้อมูลประเภทสินค้าไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}
load()

async function handleImageFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  uploadingImage.value = true
  try {
    const res = await adminAPI.uploadImage(file)
    thumbnail.value = res.data.url
    toast.success('เพิ่มรูปภาพแล้ว')
  } catch {
    toast.error('อัปโหลดรูปไม่สำเร็จ')
  } finally {
    uploadingImage.value = false
  }
}
function confirmImageDelete() {
  thumbnail.value = null
  pendingImageDelete.value = false
}

const filteredProducts = computed(() => {
  const term = productSearch.value.trim().toLowerCase()
  if (!term) return allProducts.value
  return allProducts.value.filter((p) => p.product_name.toLowerCase().includes(term))
})

function toggleSelectedProduct(id: string) {
  const next = new Set(selectedProductIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedProductIds.value = next
}

async function handleSubmit() {
  if (!form.category_name.trim()) {
    toast.error('กรุณากรอกชื่อประเภทสินค้า')
    return
  }
  saving.value = true
  const payload = {
    category_name: form.category_name.trim(),
    thumbnail: thumbnail.value,
    product_ids: Array.from(selectedProductIds.value),
  }
  try {
    if (isNew()) {
      await adminAPI.createCategory(payload)
      toast.success('เพิ่มประเภทสินค้าแล้ว')
    } else {
      await adminAPI.updateCategory(String(route.params.id), payload)
      toast.success('บันทึกข้อมูลประเภทสินค้าแล้ว')
    }
    router.push('/admin/categories')
  } catch {
    toast.error(isNew() ? 'เพิ่มประเภทสินค้าไม่สำเร็จ' : 'บันทึกข้อมูลประเภทสินค้าไม่สำเร็จ')
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
      <router-link to="/admin/categories" class="hover:text-brand-700 hover:underline">ประเภทสินค้า</router-link>
      <ChevronRight aria-hidden="true" class="w-3.5 h-3.5" />
      <span>ฟอร์มข้อมูล</span>
    </nav>

    <form @submit.prevent="handleSubmit">
      <h1 class="text-xl font-bold text-gray-800">{{ isNew() ? 'เพิ่มประเภทสินค้า' : 'แก้ไขประเภทสินค้า' }}</h1>

      <div class="bg-white border rounded-xl p-6 mt-6 space-y-5 max-w-7xl">
        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-center">
          <label class="text-sm text-gray-600 sm:text-right" for="cat-name"><span class="text-red-600">*</span>ชื่อประเภทสินค้า</label>
          <input id="cat-name" v-model="form.category_name" placeholder="เช่น กล้องติดรถยนต์" class="w-full border rounded-lg px-3 py-2" autofocus />
        </div>

        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-start">
          <span class="text-sm text-gray-600 pt-2 sm:text-right">รูปภาพ</span>
          <div class="space-y-1.5">
            <div class="w-36 h-36 rounded-lg border overflow-hidden relative group bg-gray-50">
              <img v-if="thumbnail" :src="resolveImageUrl(thumbnail)" alt="" class="w-full h-full object-contain" />
              <label
                v-else
                class="w-full h-full border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer text-gray-500 hover:border-brand-400 hover:text-brand-500"
              >
                <ImagePlus aria-hidden="true" v-if="!uploadingImage" class="w-6 h-6" />
                <span class="text-xs">{{ uploadingImage ? 'กำลังอัปโหลด' : 'เพิ่มรูปภาพ' }}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="handleImageFile" :disabled="uploadingImage" class="hidden" />
              </label>
              <button
                v-if="thumbnail"
                type="button"
                @click="pendingImageDelete = true"
                class="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label="ลบรูปภาพ"
              >
                <Trash2 aria-hidden="true" class="w-3.5 h-3.5" />
              </button>
            </div>
            <p class="text-xs text-gray-500">แสดงในวงกลมบนการ์ดหมวดหมู่หน้าแรก · แนะนำรูปสี่เหลี่ยมจัตุรัสพื้นหลังโปร่งใส (PNG)</p>
          </div>
        </div>

        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-start">
          <span class="text-sm text-gray-600 pt-2 sm:text-right">สินค้าในประเภทนี้</span>
          <div class="space-y-2">
            <input v-model="productSearch" placeholder="ค้นหาสินค้า..." class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <div class="border rounded-lg max-h-64 overflow-y-auto divide-y">
              <p v-if="filteredProducts.length === 0" class="p-3 text-sm text-gray-500 text-center">ไม่พบสินค้า</p>
              <label
                v-for="p in filteredProducts"
                :key="p.product_id"
                class="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  :checked="selectedProductIds.has(p.product_id)"
                  @change="toggleSelectedProduct(p.product_id)"
                  class="rounded border-gray-300 text-brand-700 focus:ring-brand-500"
                />
                {{ p.product_name }}
              </label>
            </div>
            <p v-if="selectedProductIds.size > 0" class="text-xs text-gray-500">เลือกแล้ว {{ selectedProductIds.size }} รายการ</p>
          </div>
        </div>

        <div class="flex gap-2 pt-2">
          <button type="submit" :disabled="saving" class="flex items-center gap-1.5 bg-accent-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-accent-800 disabled:opacity-50">
            <Save aria-hidden="true" class="w-4 h-4" />
            {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
          </button>
          <router-link to="/admin/categories" class="flex items-center gap-1.5 border text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50">
            <RotateCcw aria-hidden="true" class="w-4 h-4" />
            ย้อนกลับ
          </router-link>
        </div>
      </div>
    </form>

    <ConfirmDialog
      :open="pendingImageDelete"
      message="ยืนยันการลบรูปภาพนี้?"
      @confirm="confirmImageDelete"
      @cancel="pendingImageDelete = false"
    />
  </div>
</template>
