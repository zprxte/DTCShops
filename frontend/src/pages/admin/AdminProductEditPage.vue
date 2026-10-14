<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, X, Save, RotateCcw, Home, ChevronRight, Trash2, ImagePlus, GripVertical } from 'lucide-vue-next'
import { adminAPI, resolveImageUrl } from '../../services/api'
import { toast } from '../../stores/toast'
import AttributeNameCombobox from '../../components/common/AttributeNameCombobox.vue'
import AutoGrowTextarea from '../../components/common/AutoGrowTextarea.vue'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'

// ฟอร์มเพิ่ม/แก้ไขสินค้า 5 แท็บ (isNew = ไม่มี :id → POST, มี → PUT)

interface Attribute {
  attribute_id: number
  attribute_name: string
}
interface Category {
  category_id: string
  category_name: string
}

const route = useRoute()
const router = useRouter()
const isNew = () => !route.params.id

const emptyForm = () => ({
  sku: '', product_name: '', category_id: '',
  product_price: '', description: '',
  stock_quantity: '', sold_count: '',
  sale_start_date: '', sale_end_date: '',
  shopee_link: '', lazada_link: '', tiktok_link: '', line_link: '',
  warranty_text: '', shipping_text: '',
  slug: '', canonical_url: '', seo_title: '', seo_description: '',
  video_url: '',
})

// โมเดลทั้งระบบ (คลังกลาง) — ฟอร์มนี้แค่ติ๊กว่าสินค้าใช้โมเดลไหน แก้โมเดลที่หน้าโมเดลสินค้า
interface CatalogModel {
  model_id: string
  model_name: string
  product_price: number | null
  stock_quantity: number | null
  updated_at?: string | null
  product: { product_id: string; product_name: string } | null
}
const allModels = ref<CatalogModel[]>([])
// โมเดลที่ติ๊กไว้ ส่งเป็น model_ids ตอนบันทึก
const selectedModelIds = ref<Set<string>>(new Set())
// ติ๊ก/ถอนติ๊กโมเดล
function toggleModelSelected(modelId: string) {
  if (selectedModelIds.value.has(modelId)) selectedModelIds.value.delete(modelId)
  else selectedModelIds.value.add(modelId)
  // Set ต้อง reassign ถึงจะ reactive
  selectedModelIds.value = new Set(selectedModelIds.value)
}

const modelSearchQuery = ref('')
const modelPage = ref(1)
const MODEL_PAGE_SIZE = 10
const filteredModels = computed(() => {
  const term = modelSearchQuery.value.trim().toLowerCase()
  if (!term) return allModels.value
  return allModels.value.filter((m) => m.model_name?.toLowerCase().includes(term))
})
const modelTotalPages = computed(() => Math.max(1, Math.ceil(filteredModels.value.length / MODEL_PAGE_SIZE)))
const paginatedModels = computed(() => {
  const start = (modelPage.value - 1) * MODEL_PAGE_SIZE
  return filteredModels.value.slice(start, start + MODEL_PAGE_SIZE)
})
watch(modelSearchQuery, () => { modelPage.value = 1 })
function goToModelPage(page: number) {
  modelPage.value = Math.min(Math.max(1, page), modelTotalPages.value)
}

// ตัวเลือกเสริมทั้งระบบ — ติ๊กได้หลายสินค้าพร้อมกัน ไม่แย่ง
interface CatalogOption {
  option_id: string
  option_name: string
  addon_price: number
  stock_quantity: number | null
}
const allOptions = ref<CatalogOption[]>([])
const selectedOptionIds = ref<Set<string>>(new Set())
function toggleOptionSelected(optionId: string) {
  if (selectedOptionIds.value.has(optionId)) selectedOptionIds.value.delete(optionId)
  else selectedOptionIds.value.add(optionId)
  selectedOptionIds.value = new Set(selectedOptionIds.value)
}
const optionSearchQuery = ref('')
const filteredOptions = computed(() => {
  const term = optionSearchQuery.value.trim().toLowerCase()
  if (!term) return allOptions.value
  return allOptions.value.filter((o) => o.option_name?.toLowerCase().includes(term))
})

// แท็บใช้ v-show ไม่ใช่ v-if — สลับแท็บแล้วค่าที่พิมพ์ไม่หาย
type TabKey = 'general' | 'details' | 'models' | 'addons' | 'options' | 'media'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'general', label: 'ข้อมูลทั่วไป' },
  { key: 'details', label: 'รายละเอียด' },
  { key: 'models', label: 'โมเดลสินค้า' },
  { key: 'addons', label: 'ตัวเลือกสินค้า' },
  { key: 'options', label: 'คุณสมบัติสินค้า' },
  { key: 'media', label: 'รูปภาพหรือวีดีโอ' },
]
const activeTab = ref<TabKey>('general')

const form = reactive(emptyForm())
const categories = ref<Category[]>([])
// ชื่อคุณสมบัติทั้งระบบ ให้ AttributeNameCombobox แนะนำ (พิมพ์ชื่อใหม่ = สร้างตอนบันทึก)
const allAttributeNames = ref<string[]>([])
const attrValues = ref<Record<number, string>>({})
// สเปคที่สินค้ามีค่าอยู่แล้ว
const specFields = ref<Attribute[]>([])
const newSpecs = ref<{ name: string; value: string }[]>([])
// ภาพหลัก + ภาพย่อย 9 รูป — ส่งเป็น gallery [ภาพหลัก, ...ภาพย่อย]
const masterImage = ref<string | null>(null)
const subImages = ref<string[]>([])
const MAX_SUB_IMAGES = 8
// แท็ก (พิมพ์แล้ว Enter)
const tags = ref<string[]>([])
const tagInput = ref('')
const loading = ref(true)
const saving = ref(false)
const uploadingMaster = ref(false)
const uploadingSub = ref(false)

// <input type="date"> ต้องการ YYYY-MM-DD แต่ API คืน ISO เต็ม
function toDateInputValue(iso: string | null | undefined): string {
  return iso ? String(iso).slice(0, 10) : ''
}

// โหลดข้อมูลสินค้า (โหมดแก้) + โมเดล/ตัวเลือก/ชื่อคุณสมบัติทั้งระบบ
async function load() {
  loading.value = true
  activeTab.value = 'general'
  Object.assign(form, emptyForm())
  attrValues.value = {}
  specFields.value = []
  newSpecs.value = []
  masterImage.value = null
  subImages.value = []
  tags.value = []
  tagInput.value = ''
  selectedModelIds.value = new Set()
  modelSearchQuery.value = ''
  modelPage.value = 1
  selectedOptionIds.value = new Set()
  optionSearchQuery.value = ''

  try {
    categories.value = (await adminAPI.listCategories()).data
    allAttributeNames.value = (await adminAPI.listAttributes()).data.map((a: Attribute) => a.attribute_name)
    allModels.value = (await adminAPI.listModels()).data
    allOptions.value = (await adminAPI.listOptions()).data

    if (!isNew()) {
      const productRes = await adminAPI.getProduct(String(route.params.id))
      const p = productRes.data
      Object.assign(form, {
        sku: p.sku ?? '',
        product_name: p.product_name ?? '',
        category_id: p.category_id != null ? String(p.category_id) : '',
        product_price: p.product_price != null ? String(p.product_price) : '',
        description: p.description ?? '',
        stock_quantity: p.stock_quantity != null ? String(p.stock_quantity) : '',
        sold_count: p.sold_count != null ? String(p.sold_count) : '',
        sale_start_date: toDateInputValue(p.sale_start_date),
        sale_end_date: toDateInputValue(p.sale_end_date),
        shopee_link: p.shopee_link ?? '',
        lazada_link: p.lazada_link ?? '',
        tiktok_link: p.tiktok_link ?? '',
        line_link: p.line_link ?? '',
        warranty_text: p.warranty_text ?? '',
        shipping_text: p.shipping_text ?? '',
        slug: p.slug ?? '',
        canonical_url: p.canonical_url ?? '',
        seo_title: p.seo_title ?? '',
        seo_description: p.seo_description ?? '',
        video_url: p.video_url ?? '',
      })
      const values: Record<number, string> = {}
      const fields: Attribute[] = []
      for (const v of p.product_attribute_value ?? []) {
        values[v.attribute.attribute_id] = v.value
        fields.push(v.attribute)
      }
      attrValues.value = values
      specFields.value = fields
      {
        const rawGallery = (p.product_gallery ?? []).map((g: { product_image: string }) => g.product_image)
        masterImage.value = rawGallery[0] ?? null
        subImages.value = rawGallery.slice(1)
      }
      tags.value = p.tags ?? []
      // ติ๊กโมเดลที่สินค้านี้มีอยู่แล้ว
      interface RawModel { model_id: string }
      selectedModelIds.value = new Set((p.product_model ?? []).map((v: RawModel) => v.model_id))
      selectedOptionIds.value = new Set((p.option_ids ?? []) as string[])
    }
  } catch {
    toast.error(isNew() ? 'โหลดข้อมูลฟอร์มไม่สำเร็จ' : 'โหลดข้อมูลสินค้าไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}

load()
watch(() => route.params.id, load)

// อัปโหลดภาพหลัก
async function handleMasterFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  uploadingMaster.value = true
  try {
    const res = await adminAPI.uploadImage(file)
    masterImage.value = res.data.url
    toast.success('เพิ่มภาพหลักแล้ว')
  } catch {
    toast.error('อัปโหลดรูปไม่สำเร็จ')
  } finally {
    uploadingMaster.value = false
  }
}

// อัปโหลดภาพย่อย
async function handleSubImageFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  if (subImages.value.length >= MAX_SUB_IMAGES) {
    toast.error(`เพิ่มได้สูงสุด ${MAX_SUB_IMAGES} รูป`)
    return
  }
  uploadingSub.value = true
  try {
    const res = await adminAPI.uploadImage(file)
    subImages.value.push(res.data.url)
    toast.success('เพิ่มรูปแล้ว')
  } catch {
    toast.error('อัปโหลดรูปไม่สำเร็จ')
  } finally {
    uploadingSub.value = false
  }
}

// ยืนยันก่อนลบรูป
type PendingImageDelete = { kind: 'master' } | { kind: 'sub'; index: number }
const pendingImageDelete = ref<PendingImageDelete | null>(null)
function confirmImageDelete() {
  if (!pendingImageDelete.value) return
  if (pendingImageDelete.value.kind === 'master') masterImage.value = null
  else subImages.value.splice(pendingImageDelete.value.index, 1)
  pendingImageDelete.value = null
}

// ลากจัดลำดับภาพย่อย (HTML5 drag)
const draggedSubIndex = ref<number | null>(null)
function onSubImageDragStart(index: number) {
  draggedSubIndex.value = index
}
function onSubImageDrop(index: number) {
  if (draggedSubIndex.value === null || draggedSubIndex.value === index) return
  const [moved] = subImages.value.splice(draggedSubIndex.value, 1)
  subImages.value.splice(index, 0, moved)
  draggedSubIndex.value = null
}

function addTag() {
  const name = tagInput.value.trim()
  tagInput.value = ''
  if (!name || tags.value.includes(name)) return
  tags.value.push(name)
}
function removeTag(index: number) {
  tags.value.splice(index, 1)
}

// บันทึกสินค้า (PUT เป็น full-replace ต้องส่งครบทั้งก้อน)
async function handleSubmit() {
  // SKU ไม่บังคับ — สินค้าจริงส่วนใหญ่ไม่มี
  if (!form.product_name.trim()) {
    toast.error('กรุณากรอกข้อมูลที่จำเป็นให้ครบ')
    return
  }
  saving.value = true
  const payload = {
    sku: form.sku.trim() || null,
    product_name: form.product_name.trim(),
    category_id: form.category_id || null,
    product_price: form.product_price === '' ? null : form.product_price,
    description: form.description,
    stock_quantity: form.stock_quantity === '' ? null : form.stock_quantity,
    sold_count: form.sold_count === '' ? null : form.sold_count,
    sale_start_date: form.sale_start_date || null,
    sale_end_date: form.sale_end_date || null,
    shopee_link: form.shopee_link,
    lazada_link: form.lazada_link,
    tiktok_link: form.tiktok_link,
    line_link: form.line_link,
    warranty_text: form.warranty_text,
    shipping_text: form.shipping_text,
    slug: form.slug,
    canonical_url: form.canonical_url,
    seo_title: form.seo_title,
    seo_description: form.seo_description,
    video_url: form.video_url,
    // ตำแหน่ง 0 = ภาพหลักเสมอ (ว่างก็คงไว้)
    gallery: [masterImage.value, ...subImages.value],
    tags: tags.value,
    attributes: [
      ...specFields.value.map((a) => ({ attribute_id: a.attribute_id, value: attrValues.value[a.attribute_id] ?? '' })),
      ...newSpecs.value
        .filter((s) => s.name.trim() && s.value.trim())
        .map((s) => ({ attribute_name: s.name.trim(), value: s.value.trim() })),
    ],
    model_ids: Array.from(selectedModelIds.value),
    option_ids: Array.from(selectedOptionIds.value),
  }
  try {
    if (isNew()) {
      await adminAPI.createProduct(payload)
      toast.success('เพิ่มสินค้าแล้ว')
    } else {
      await adminAPI.updateProduct(String(route.params.id), payload)
      toast.success('บันทึกข้อมูลสินค้าแล้ว')
    }
    router.push('/admin/products')
  } catch (err: unknown) {
    const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
    if (code === 'duplicateSku') toast.error('มีสินค้าที่ใช้ SKU นี้อยู่แล้ว')
    else if (code === 'missingRequiredFields') toast.error('กรุณากรอกข้อมูลที่จำเป็นให้ครบ')
    else toast.error(isNew() ? 'เพิ่มสินค้าไม่สำเร็จ' : 'บันทึกข้อมูลสินค้าไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <p v-if="loading" class="p-4 text-sm text-gray-500">กำลังโหลด...</p>

  <div v-else class="space-y-4">
    <nav aria-label="เส้นทางหน้า" class="flex items-center gap-1.5 text-sm text-gray-500">
      <Home aria-hidden="true" class="w-3.5 h-3.5" />
      <router-link to="/admin/products" class="hover:text-brand-700 hover:underline">สินค้าของฉัน</router-link>
      <ChevronRight aria-hidden="true" class="w-3.5 h-3.5" />
      <span>ฟอร์มข้อมูลสินค้า</span>
    </nav>

    <form @submit.prevent="handleSubmit">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-gray-800">{{ isNew() ? 'เพิ่มข้อมูลสินค้าใหม่' : 'แก้ไขข้อมูลสินค้า' }}</h1>
        <div class="flex gap-2">
          <button type="submit" :disabled="saving" class="flex items-center gap-1.5 bg-accent-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-accent-800 disabled:opacity-50">
            <Save aria-hidden="true" class="w-4 h-4" />
            {{ saving ? 'กำลังบันทึก...' : isNew() ? 'เพิ่มสินค้า' : 'อัพเดต' }}
          </button>
          <router-link to="/admin/products" class="flex items-center gap-1.5 border text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50">
            <RotateCcw aria-hidden="true" class="w-4 h-4" />
            ย้อนกลับ
          </router-link>
        </div>
      </div>

      <div class="bg-white border rounded-xl overflow-hidden mt-4">
      <div class="flex border-b overflow-x-auto">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          type="button"
          @click="activeTab = tab.key"
          :class="[
            'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
            activeTab === tab.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700',
          ]"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="p-5 space-y-4">
        <div v-show="activeTab === 'general'" class="space-y-4">
          <label class="text-sm space-y-1">
            <span class="text-gray-600">ชื่อสินค้า <span class="text-red-600">*</span></span>
            <input v-model="form.product_name" class="w-full border rounded-lg px-3 py-2" />
          </label>
          <div class="grid sm:grid-cols-2 lg:grid-cols-2 gap-4">
            <label class="text-sm space-y-1">
              <span class="text-gray-600">หมวดหมู่ <span class="text-red-600">*</span></span>
              <select v-model="form.category_id" class="w-full border rounded-lg px-3 py-2">
                <option value="">— เลือกหมวดหมู่ —</option>
                <option v-for="c in categories" :key="c.category_id" :value="String(c.category_id)">{{ c.category_name }}</option>
              </select>
            </label>
            <label class="text-sm space-y-1">
              <span class="text-gray-600">ราคา</span>
              <input type="text" v-model="form.product_price" class="w-full border rounded-lg px-3 py-2" />
              <span class="text-xs text-gray-500 block">ไม่บังคับ — เว้นว่างได้ถ้าตั้งราคาไว้ที่โมเดลสินค้าแทน (แท็บ "โมเดลสินค้า")</span>
            </label>
          </div>

          <div class="grid sm:grid-cols-4 lg:grid-cols-4 gap-4">
            <label class="text-sm space-y-1">
              <span class="text-gray-600">วันที่จัดจำหน่าย</span>
              <input type="date" v-model="form.sale_start_date" class="w-full border rounded-lg px-3 py-2" />
            </label>
            <label class="text-sm space-y-1">
              <span class="text-gray-600">ถึงวันที่</span>
              <input type="date" v-model="form.sale_end_date" class="w-full border rounded-lg px-3 py-2" />
            </label>
            <label class="text-sm space-y-1">
              <span class="text-gray-600">จำนวนสินค้าคงคลัง</span>
              <input type="number" min="0" v-model="form.stock_quantity" class="w-full border rounded-lg px-3 py-2" />
            </label>
            <label class="text-sm space-y-1">
              <span class="text-gray-600">ขายแล้ว</span>
              <input type="number" min="0" v-model="form.sold_count" class="w-full border rounded-lg px-3 py-2" />
            </label>
          </div>

          <div class="grid sm:grid-cols-2 gap-4 pt-2 border-t">
            <label class="text-sm space-y-1 pt-2">
              <span class="text-gray-600">รหัส SKU</span>
              <input v-model="form.sku" class="w-full border rounded-lg px-3 py-2" />
              <span class="text-xs text-gray-500 block">SKU/ราคานี้ของ "ตัวสินค้าเอง" — ใช้แสดงจริงเฉพาะตอนไม่มีโมเดลในแท็บ "โมเดลสินค้า" เลย ถ้าเพิ่มโมเดลไว้ หน้าสินค้าจะใช้ SKU/ราคาของโมเดลที่ลูกค้าเลือกแทน</span>
            </label>
            <label class="text-sm space-y-1 pt-2">
              <span class="text-gray-600">ลิงก์ร้านค้า Shopee</span>
              <input v-model="form.shopee_link" placeholder="https://shopee.co.th/product/..." class="w-full border rounded-lg px-3 py-2" />
            </label>
            <label class="text-sm space-y-1">
              <span class="text-gray-600">ลิงก์ร้านค้า Lazada</span>
              <input v-model="form.lazada_link" placeholder="https://www.lazada.co.th/products/..." class="w-full border rounded-lg px-3 py-2" />
            </label>
            <label class="text-sm space-y-1">
              <span class="text-gray-600">ลิงก์ร้านค้า Tiktok</span>
              <input v-model="form.tiktok_link" placeholder="https://shop.tiktok.com/view/product/..." class="w-full border rounded-lg px-3 py-2" />
            </label>
          </div>

          <label class="text-sm space-y-1 block">
            <span class="text-gray-600">ลิงก์ร้านค้า Line</span>
            <input v-model="form.line_link" placeholder="https://line.me/R/ti/p/..." class="w-full border rounded-lg px-3 py-2" />
          </label>

          <label class="text-sm space-y-1 block">
            <span class="text-gray-600">ความคุ้มครองอุปกรณ์อิเล็กทรอนิกส์</span>
            <input v-model="form.warranty_text" placeholder="เช่น รับประกันสินค้า 1 ปี" class="w-full border rounded-lg px-3 py-2" />
          </label>

          <label class="text-sm space-y-1 block">
            <span class="text-gray-600">การจัดส่ง</span>
            <input v-model="form.shipping_text" placeholder="เช่น จัดส่งฟรีทั่วประเทศ" class="w-full border rounded-lg px-3 py-2" />
          </label>

          <label class="text-sm space-y-1 block">
            <span class="text-gray-600">Slug url</span>
            <input v-model="form.slug" placeholder="ปล่อยว่างไว้ = สร้างอัตโนมัติจากชื่อสินค้า" class="w-full border rounded-lg px-3 py-2" />
          </label>
          <label class="text-sm space-y-1 block">
            <span class="text-gray-600">Canonical Url</span>
            <input v-model="form.canonical_url" class="w-full border rounded-lg px-3 py-2" />
          </label>
          <label class="text-sm space-y-1 block">
            <span class="text-gray-600">ข้อมูล SEO Title</span>
            <input v-model="form.seo_title" class="w-full border rounded-lg px-3 py-2" />
          </label>
          <label class="text-sm space-y-1 block">
            <span class="text-gray-600">ข้อมูล SEO Description</span>
            <textarea v-model="form.seo_description" rows="2" class="w-full border rounded-lg px-3 py-2" />
          </label>

          <div class="space-y-2">
            <span class="text-gray-600 text-sm block">ป้ายกำกับข้อมูล (Tags)</span>
            <input
              v-model="tagInput"
              @keydown.enter.prevent="addTag"
              placeholder="กด Enter เพื่อเพิ่มป้ายกำกับข้อมูล (Tags)"
              class="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <div v-if="tags.length > 0" class="flex flex-wrap gap-2 pt-1">
              <span
                v-for="(tagName, i) in tags"
                :key="tagName"
                class="inline-flex items-center gap-1.5 bg-brand-50 text-brand-700 text-xs px-2.5 py-1 rounded-full"
              >
                {{ tagName }}
                <button type="button" @click="removeTag(i)" class="hover:text-brand-900" :aria-label="`ลบป้ายกำกับ ${tagName}`">
                  <X aria-hidden="true" class="w-3 h-3" />
                </button>
              </span>
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'details'" class="space-y-4">
          <label class="text-sm space-y-1 block">
            <span class="text-gray-600">รายละเอียดสินค้า</span>
            <textarea v-model="form.description" rows="12" class="w-full border rounded-lg px-3 py-2" />
          </label>
        </div>

        <div v-show="activeTab === 'models'" class="space-y-3">
          <p class="text-xs text-gray-500">
            โมเดลสินค้าเป็นคลังกลางของทั้งระบบ (จัดการชื่อ/ราคา/สต็อก/คุณสมบัติย่อยได้ที่หน้า "โมเดลสินค้า" ในเมนูสินค้า)
            ติ๊กเลือกที่นี่แค่บอกว่าสินค้าตัวนี้ใช้โมเดลไหนบ้าง — ถ้าติ๊กโมเดลที่ตอนนี้เป็นของสินค้าอื่นอยู่ จะย้ายมาเป็นของสินค้านี้แทนทันทีที่กด "อัพเดต"
          </p>

          <div class="flex items-center justify-end">
            <input v-model="modelSearchQuery" placeholder="คีย์เวิร์ด" class="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b">
                <th class="py-2 font-medium w-8"></th>
                <th class="py-2 font-medium">โมเดลสินค้า</th>
                <th class="py-2 font-medium">ราคา</th>
                <th class="py-2 font-medium">คลัง</th>
                <th class="py-2 font-medium">อัพเดตล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="allModels.length === 0"><td colspan="5" class="py-6 text-center text-gray-500">ยังไม่มีโมเดลในระบบ — เพิ่มได้ที่หน้า "โมเดลสินค้า"</td></tr>
              <tr v-if="allModels.length > 0 && filteredModels.length === 0"><td colspan="5" class="py-6 text-center text-gray-500">ไม่พบโมเดลที่ค้นหา</td></tr>
              <tr v-for="model in paginatedModels" :key="model.model_id" class="border-b last:border-0">
                <td class="py-2.5">
                  <input
                    type="checkbox"
                    :checked="selectedModelIds.has(model.model_id)"
                    @change="toggleModelSelected(model.model_id)"
                    class="rounded border-gray-300 text-brand-700 focus:ring-brand-500"
                    :aria-label="`เลือกโมเดล ${model.model_name}`"
                  />
                </td>
                <td class="py-2.5">
                  {{ model.model_name }}
                  <span
                    v-if="model.product && model.product.product_id !== route.params.id"
                    class="block text-xs text-gray-500"
                  >
                    ปัจจุบันใช้กับ: {{ model.product.product_name }}
                  </span>
                </td>
                <td class="py-2.5 text-gray-500">{{ model.product_price != null ? `฿${Number(model.product_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-' }}</td>
                <td class="py-2.5 text-gray-500">{{ model.stock_quantity ?? '-' }}</td>
                <td class="py-2.5 text-gray-500">{{ model.updated_at ? String(model.updated_at).slice(0, 16).replace('T', ' ') : '-' }}</td>
              </tr>
            </tbody>
          </table>

          <div class="flex items-center justify-center gap-1 pt-2" v-if="modelTotalPages > 1">
            <button type="button" @click="goToModelPage(1)" :disabled="modelPage === 1" class="px-2 py-1 text-gray-500 hover:text-brand-700 disabled:opacity-30">«</button>
            <button type="button" @click="goToModelPage(modelPage - 1)" :disabled="modelPage === 1" class="px-2 py-1 text-gray-500 hover:text-brand-700 disabled:opacity-30">‹</button>
            <span class="w-7 h-7 flex items-center justify-center rounded-full bg-brand-50 text-brand-700 text-sm">{{ modelPage }}</span>
            <button type="button" @click="goToModelPage(modelPage + 1)" :disabled="modelPage === modelTotalPages" class="px-2 py-1 text-gray-500 hover:text-brand-700 disabled:opacity-30">›</button>
            <button type="button" @click="goToModelPage(modelTotalPages)" :disabled="modelPage === modelTotalPages" class="px-2 py-1 text-gray-500 hover:text-brand-700 disabled:opacity-30">»</button>
          </div>
        </div>

        <div v-show="activeTab === 'addons'" class="space-y-3">
          <p class="text-xs text-gray-500">
            ของเสริมที่ลูกค้าเลือกซื้อเพิ่มพร้อมสินค้านี้ได้ (เช่น SD Card, เซ็นเซอร์วัดน้ำมัน) —
            เป็นคลังกลางของทั้งระบบ จัดการชื่อ/ราคาเพิ่มได้ที่หน้า "ตัวเลือกสินค้า" ในเมนูสินค้า
            ติ๊กที่นี่แค่บอกว่าสินค้าตัวนี้เสนอตัวเลือกไหนบ้าง (สินค้าอื่นยังใช้ตัวเลือกเดียวกันได้พร้อมกัน ไม่แย่งกัน)
            — ตัวเลือกสินค้าไม่ถูกนำไปแสดงในตารางเปรียบเทียบ
          </p>

          <div class="flex items-center justify-end">
            <input v-model="optionSearchQuery" placeholder="คีย์เวิร์ด" class="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b">
                <th class="py-2 font-medium w-8"></th>
                <th class="py-2 font-medium">ตัวเลือกสินค้า</th>
                <th class="py-2 font-medium">ราคาเพิ่ม</th>
                <th class="py-2 font-medium">คลัง</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="allOptions.length === 0"><td colspan="4" class="py-6 text-center text-gray-500">ยังไม่มีตัวเลือกสินค้าในระบบ — เพิ่มได้ที่หน้า "ตัวเลือกสินค้า"</td></tr>
              <tr v-if="allOptions.length > 0 && filteredOptions.length === 0"><td colspan="4" class="py-6 text-center text-gray-500">ไม่พบตัวเลือกที่ค้นหา</td></tr>
              <tr v-for="option in filteredOptions" :key="option.option_id" class="border-b last:border-0">
                <td class="py-2.5">
                  <input
                    type="checkbox"
                    :checked="selectedOptionIds.has(option.option_id)"
                    @change="toggleOptionSelected(option.option_id)"
                    class="rounded border-gray-300 text-brand-700 focus:ring-brand-500"
                    :aria-label="`เลือกตัวเลือก ${option.option_name}`"
                  />
                </td>
                <td class="py-2.5">{{ option.option_name }}</td>
                <td class="py-2.5 text-gray-500">{{ option.addon_price > 0 ? `+฿${Number(option.addon_price).toLocaleString()}` : 'ไม่มีค่าใช้จ่ายเพิ่ม' }}</td>
                <td class="py-2.5 text-gray-500">{{ option.stock_quantity ?? '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-show="activeTab === 'options'" class="space-y-3">
          <div>
            <h2 class="text-sm font-medium text-gray-700">คุณสมบัติ</h2>
            <p class="text-xs text-gray-500">
              ถ้าค่าเป็นรายการหลายอย่าง (เช่น ใช้ได้กับรถประเภทไหนบ้าง) ให้คั่นด้วยจุลภาคทีละรายการ
              เช่น "รถจักรยานยนต์, รถยนต์ทั่วไป, รถบรรทุก" แทนการเขียนเป็นประโยค — หน้าเปรียบเทียบสินค้าฝั่งลูกค้าใช้ตัวคั่นนี้ตัดสินว่าอันไหนครอบคลุมมากกว่าเวลาเรียงลำดับ
              สเปคที่กรอกไว้ตรงนี้ใช้ร่วมกันทุกโมเดล — สเปคที่ต่างกันเฉพาะบางโมเดลให้ไปกรอกในแท็บ "โมเดลสินค้า" แทน
            </p>
          </div>

          <!-- items-start: ไม่ให้ช่องสั้นถูกยืดตามช่องที่ค่ายาว -->
          <div v-if="specFields.length > 0" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            <label v-for="a in specFields" :key="a.attribute_id" class="text-sm space-y-1">
              <span class="text-gray-600">{{ a.attribute_name }}</span>
              <AutoGrowTextarea v-model="attrValues[a.attribute_id]" placeholder="เช่น รถจักรยานยนต์, รถยนต์ทั่วไป" />
            </label>
          </div>

          <!-- แถวเพิ่มสเปคใหม่ — ชื่อที่ยังไม่มีถูกสร้างตอนบันทึก -->
          <div v-if="newSpecs.length > 0" class="space-y-2">
            <!-- หัวคอลัมน์ถาวร — placeholder หายตั้งแต่พิมพ์ตัวแรก -->
            <div class="flex items-center gap-2 text-xs text-gray-500">
              <span class="flex-1">ชื่อคุณสมบัติ</span>
              <span class="flex-1">ค่า</span>
              <span class="w-4 shrink-0" aria-hidden="true"></span>
            </div>
            <div v-for="(s, i) in newSpecs" :key="i" class="flex items-start gap-2">
              <AttributeNameCombobox v-model="s.name" :options="allAttributeNames" placeholder="ชื่อคุณสมบัติ เช่น RAM" :aria-label="`ชื่อคุณสมบัติแถวที่ ${i + 1}`" class="flex-1" />
              <AutoGrowTextarea v-model="s.value" placeholder="ค่า เช่น 8GB หรือ รถจักรยานยนต์, รถยนต์ทั่วไป" :aria-label="`ค่าของคุณสมบัติแถวที่ ${i + 1}`" class="flex-1 text-sm" />
              <button type="button" @click="newSpecs.splice(i, 1)" class="text-gray-500 hover:text-red-600 shrink-0 mt-2.5" :aria-label="`ลบคุณสมบัติแถวที่ ${i + 1}`">
                <X aria-hidden="true" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <button type="button" @click="newSpecs.push({ name: '', value: '' })" class="flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-700">
            <Plus aria-hidden="true" class="w-4 h-4" />
            เพิ่มคุณสมบัติใหม่
          </button>
        </div>

        <div v-show="activeTab === 'media'" class="space-y-6">
          <div class="space-y-2">
            <span class="text-sm text-gray-600 block">ภาพสินค้าหลัก</span>
            <div class="w-36 h-36 rounded-lg border overflow-hidden relative group">
              <img loading="lazy" decoding="async" v-if="masterImage" :src="resolveImageUrl(masterImage)" alt="" class="w-full h-full object-cover" />
              <label
                v-else
                class="w-full h-full border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer text-gray-500 hover:border-brand-400 hover:text-brand-500"
              >
                <ImagePlus aria-hidden="true" v-if="!uploadingMaster" class="w-6 h-6" />
                <span class="text-xs">{{ uploadingMaster ? 'กำลังอัปโหลด' : 'เพิ่มรูปภาพ' }}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="handleMasterFile" :disabled="uploadingMaster" class="hidden" />
              </label>
              <button
                v-if="masterImage"
                type="button"
                @click="pendingImageDelete = { kind: 'master' }"
                class="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100"
                aria-label="ลบภาพหลัก"
              >
                <Trash2 aria-hidden="true" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div class="space-y-2 pt-2 border-t">
            <div class="pt-2 flex items-center gap-3">
              <div>
                <span class="text-sm text-gray-600">ภาพสินค้า</span>
                <span class="text-red-600 text-sm">*</span>
                <span class="text-xs text-gray-500 ml-1">รูปภาพขนาด 1:1</span>
              </div>
              <label
                class="w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer text-gray-500 hover:border-brand-400 hover:text-brand-500 shrink-0"
              >
                <ImagePlus aria-hidden="true" v-if="!uploadingSub" class="w-5 h-5" />
                <span class="text-[11px] text-center px-1">
                  {{ uploadingSub ? 'กำลังอัปโหลด' : `เพิ่มรูปภาพ (${subImages.length}/${MAX_SUB_IMAGES})` }}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  @change="handleSubImageFile"
                  :disabled="uploadingSub || subImages.length >= MAX_SUB_IMAGES"
                  class="hidden"
                />
              </label>

              <table class="flex-1 text-sm self-start">
                <thead>
                  <tr class="text-left text-gray-500 border-b">
                    <th class="py-2 font-medium w-24">รูป</th>
                    <th class="py-2 font-medium">ลำดับ</th>
                  </tr>
                </thead>
                <tbody v-if="subImages.length > 0">
                  <tr
                    v-for="(img, i) in subImages"
                    :key="img + i"
                    class="border-b last:border-0"
                    @dragover.prevent
                    @drop="onSubImageDrop(i)"
                  >
                    <td class="py-2">
                      <img loading="lazy" decoding="async" :src="resolveImageUrl(img)" alt="" class="w-12 h-12 rounded-lg border object-cover" />
                    </td>
                    <td class="py-2">
                      <div class="flex items-center gap-3">
                        <button
                          type="button"
                          draggable="true"
                          @dragstart="onSubImageDragStart(i)"
                          class="cursor-move text-gray-500 hover:text-gray-600"
                          aria-label="ลากเพื่อเปลี่ยนลำดับ"
                        >
                          <GripVertical aria-hidden="true" class="w-4 h-4" />
                        </button>
                        <span>{{ i + 1 }}</span>
                        <button type="button" @click="pendingImageDelete = { kind: 'sub', index: i }" class="text-red-600 hover:underline text-xs ml-auto mr-2">
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="subImages.length > 0" class="text-xs text-gray-500">
              * คลิกที่รูปไอคอน <GripVertical aria-hidden="true" class="w-3 h-3 inline" /> แล้วลากขึ้นหรือลงเพื่อเปลี่ยนลำดับรูป
            </p>
          </div>

          <label class="text-sm space-y-1 block pt-2 border-t">
            <span class="text-gray-600 block pt-2">วิดีโอสินค้า</span>
            <input v-model="form.video_url" placeholder="เช่น ลิงก์ YouTube" class="w-full border rounded-lg px-3 py-2" />
          </label>
        </div>
      </div>
      </div>
    </form>

    <ConfirmDialog
      :open="pendingImageDelete !== null"
      :message="pendingImageDelete?.kind === 'master' ? 'ยืนยันการลบภาพหลักนี้?' : 'ยืนยันการลบรูปนี้ออกจากแกลเลอรี?'"
      @confirm="confirmImageDelete"
      @cancel="pendingImageDelete = null"
    />
  </div>
</template>
