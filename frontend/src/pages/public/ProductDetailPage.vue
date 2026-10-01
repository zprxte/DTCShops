<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { GitCompare, Check, Play, ChevronLeft, ChevronRight, Minus, Plus, Mail, Link2 } from 'lucide-vue-next'
import { productAPI, resolveImageUrl } from '../../services/api'
import { useCompareStore } from '../../stores/compare'
import { useLanguage } from '../../language/useLanguage'
import { copyLink } from '../../utils/share'
import ProductCard from '../../components/product/ProductCard.vue'
import Breadcrumb from '../../components/common/Breadcrumb.vue'
import SkeletonBox from '../../components/common/SkeletonBox.vue'
import type { ProductDetail, ProductAttributeValue } from '../../types/product'
import { pageTitleOverride } from '../../composables/usePageTitle'

const route = useRoute()
const { langs } = useLanguage()
const compareStore = useCompareStore()

const product = ref<ProductDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const activeImage = ref<string | null>(null)
const activeMedia = ref<'image' | 'video'>('image')

function load() {
  const identifier = String(route.params.slug ?? '')
  if (!identifier) {
    error.value = langs('productNotFound')
    loading.value = false
    return
  }
  loading.value = true
  error.value = null

  productAPI
    .getById(identifier)
    .then((res) => {
      product.value = res.data
      // ชื่อแท็บ = ชื่อสินค้า (เช็คว่ายังอยู่หน้าสินค้าตัวนี้ ไม่ให้ผลที่ตอบช้ามาทับชื่อสินค้าตัวใหม่)
      if (identifier === String(route.params.slug ?? '')) pageTitleOverride.value = res.data.product_name
      activeImage.value = res.data.product_gallery?.[0]?.product_image ?? null
      activeMedia.value = 'image'
      selectedModelId.value = res.data.product_model?.[0]?.model_id ?? null
      selectedOptionId.value = null
    })
    .catch(() => { error.value = langs('productLoadError') })
    .finally(() => {
      // เหมือน HomePage.vue's "สินค้าแนะนำ" — loading ต้องเป็น false ก่อน
      // ถึงจะเรียก nextTick ได้ เพราะ track div ยังไม่ mount ตอน loading=true
      loading.value = false
      nextTick(() => {
        updateGalleryScrollState()
        updateRelatedScrollState()
      })
    })
}

onMounted(load)
watch(() => route.params.slug, load)

const selectedModelId = ref<string | null>(null)
const selectedModel = computed(() =>
  product.value?.product_model?.find((v) => v.model_id === selectedModelId.value) ?? null
)
const effectivePrice = computed(() => selectedModel.value?.product_price ?? product.value?.product_price ?? null)
const effectiveAttributes = computed<ProductAttributeValue[]>(() => {
  const base = product.value?.product_attribute_value ?? []
  const overrides = selectedModel.value?.product_attribute_value ?? []
  const overrideNames = new Set(overrides.map((o) => o.attribute.attribute_name))
  return [...base.filter((b) => !overrideNames.has(b.attribute.attribute_name)), ...overrides]
})

// ตัวเลือกสินค้า / ของเสริมที่ซื้อเพิ่มได้ (tbl_item_option) — เลือกได้ทีละตัว
// (คำขอผู้ใช้ 2026-09-09) ราคาที่เพิ่มถูกบวกเข้ากับราคาสินค้าที่แสดงด้านบนเลย
// ไม่แยกบรรทัดรวมยอด จะได้เห็นชัดว่าเลือกแล้วจ่ายเท่าไร; เป็นการแสดงผลอย่างเดียว
// ระบบนี้ไม่มีตะกร้าสั่งซื้อจริง และตัวเลือกไม่ถูกส่งเข้าตารางเปรียบเทียบ
const selectedOptionId = ref<string | null>(null)
// กดตัวที่เลือกอยู่ซ้ำ = ยกเลิกการเลือก (radio ปกติยกเลิกเองไม่ได้ ต้องดักที่ @click)
function selectOption(optionId: string) {
  selectedOptionId.value = selectedOptionId.value === optionId ? null : optionId
}
const selectedOption = computed(() =>
  product.value?.product_option?.find((option) => option.option_id === selectedOptionId.value) ?? null
)
const optionAddon = computed(() => Number(selectedOption.value?.addon_price ?? 0))
// ราคาที่โชว์ในกล่องราคาด้านบน = ราคาโมเดลที่เลือก + ราคาตัวเลือกที่เลือก
// ราคาฐานเป็น 0 = "ติดต่อสอบถาม" → คงเป็น 0 ไม่ว่าเลือกตัวเลือกราคาเท่าไร
// (ไม่งั้นจะโชว์แค่ราคาตัวเลือกเหมือนเป็นราคาสินค้า, คำขอผู้ใช้ 15 ก.ย. 2026)
const hasBasePrice = computed(() => Number(effectivePrice.value ?? 0) > 0)

// สินค้าหมวด Software ขายแบบสมัครสมาชิก คิดราคาต่อผู้ใช้ต่อเดือน ไม่ใช่ต่อชิ้น
// (คำขอผู้ใช้ 25 ก.ย. 2026) · tbl_item ไม่มีคอลัมน์หน่วยราคา จึงดูจากรหัสหมวดแทน
const SUBSCRIPTION_CATEGORY_ID = 'PT-00006'
const isSubscription = computed(() => product.value?.category?.category_id === SUBSCRIPTION_CATEGORY_ID)
const displayPrice = computed(() => (hasBasePrice.value ? Number(effectivePrice.value) + optionAddon.value : 0))

//ตรรกะการตรวจสอบว่าสินค้านี้อยู่ในรายการเปรียบเทียบแล้วหรือไม่
//ถ้ามีการเลือกรุ่นสินค้า (selectedModelId) จะตรวจสอบเฉพาะรุ่นนั้น
//ถ้าไม่ได้เลือกรุ่น (selectedModelId เป็น null) จะตรวจสอบทั้งสินค้า
const inCompare = computed(() =>
  product.value ? compareStore.isExactInCompare(product.value.product_id, selectedModelId.value) : false
)

function toggleCompare() {
  if (!product.value) return
  if (inCompare.value) {
    compareStore.removeItemExact(product.value.product_id, selectedModelId.value)
  } else {
    compareStore.addItem({
      product_id: product.value.product_id,
      product_name: product.value.product_name,
      product_image: product.value.product_image ?? undefined,
      product_price: Number(effectivePrice.value) || 0,
      model_id: selectedModelId.value ?? undefined,
    })
  }
}

// แชร์หน้าสินค้า — Facebook/Line ผ่าน share-intent URL, อีเมลผ่าน mailto,
// คัดลอกลิงก์ (แพทเทิร์นเดียวกับ ComparePage.vue's shareCompareLink)
const facebookShareUrl = computed(
  () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`
)
const lineShareUrl = computed(
  () => `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(window.location.href)}`
)
const emailShareUrl = computed(
  () => `mailto:?subject=${encodeURIComponent(product.value?.product_name ?? '')}&body=${encodeURIComponent(window.location.href)}`
)
function copyProductLink() {
  copyLink(window.location.href, langs('shareLinkCopiedToast'))
}

const galleryImages = computed(() => product.value?.product_gallery?.map((g) => g.product_image) ?? [])

// Product video (admin's "วิดีโอสินค้า" field, itm_video_master)
const youtubeId = computed(() => {
  const url = product.value?.video_url
  if (!url) return null
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{6,})/)
  return match ? match[1] : null
})
const videoThumbnail = computed(() => (youtubeId.value ? `https://img.youtube.com/vi/${youtubeId.value}/hqdefault.jpg` : null))
const videoEmbedUrl = computed(() => (youtubeId.value ? `https://www.youtube.com/embed/${youtubeId.value}` : null))

function showImage(img: string) {
  activeImage.value = img
  activeMedia.value = 'image'
}
function showVideo() {
  activeMedia.value = 'video'
}

// จำนวนรูปย่อทั้งหมด (รูปภาพ + วิดีโอ ถ้ามี) ไว้ใช้คำนวณแคโรเซล
const galleryThumbCount = computed(() => galleryImages.value.length + (videoThumbnail.value ? 1 : 0))

// แคโรเซลแถบรูปย่อ — โครงสร้างเดียวกับ HomePage.vue's "สินค้าแนะนำ" (ปุ่มลูกศร
// วงกลมลอย + จุดไล่ตำแหน่งด้านล่าง) เห็นทีละ 4 ชิ้น
const galleryTrack = ref<HTMLElement | null>(null)
const canScrollGalleryLeft = ref(false)
const canScrollGalleryRight = ref(false)
const galleryActiveIndex = ref(0)

function galleryCardStep(el: HTMLElement) {
  const card = el.firstElementChild as HTMLElement | null
  return (card?.offsetWidth ?? el.clientWidth / 4) + 8 // + gap-2
}

function updateGalleryScrollState() {
  const el = galleryTrack.value
  if (!el) return
  canScrollGalleryLeft.value = el.scrollLeft > 4
  canScrollGalleryRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
  galleryActiveIndex.value = canScrollGalleryRight.value
    ? Math.round(el.scrollLeft / galleryCardStep(el))
    : galleryThumbCount.value - 1
}

function scrollGalleryByCards(direction: 1 | -1) {
  const el = galleryTrack.value
  if (!el) return
  if (direction === 1 && !canScrollGalleryRight.value) {
    el.scrollTo({ left: 0, behavior: 'smooth' })
    return
  }
  if (direction === -1 && !canScrollGalleryLeft.value) {
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
    return
  }
  el.scrollBy({ left: galleryCardStep(el) * direction, behavior: 'smooth' })
}

function scrollGalleryToIndex(i: number) {
  const el = galleryTrack.value
  if (!el) return
  el.scrollTo({ left: galleryCardStep(el) * i, behavior: 'smooth' })
}

const numGalleryDots = computed(() => Math.max(1, galleryThumbCount.value - 3))
const activeGalleryDot = computed(() => Math.min(galleryActiveIndex.value, numGalleryDots.value - 1))

// ตัวเลือกจำนวนสินค้า — เป็นแค่ตัวเลขแสดงผลบนหน้าเว็บเท่านั้น ระบบนี้ไม่มีตะกร้าสั่งซื้อ/checkout จริง
const quantity = ref(1)
function decreaseQuantity() {
  if (quantity.value > 1) quantity.value -= 1
}
function increaseQuantity() {
  quantity.value += 1
}

// แปลงราคาเป็นข้อความรูปแบบ ฿x,xxx
function formatPrice(value: number | string) {
  return `฿${Number(value).toLocaleString()}`
}
// ช่วงราคาต่ำสุด-สูงสุด (จากราคาของแต่ละโมเดล) แสดงเป็นราคาขีดฆ่าคู่กับราคาปัจจุบัน
const priceRangeText = computed(() => {
  if (!product.value || product.value.product_price == null || product.value.product_price_max == null) return null
  return `${formatPrice(product.value.product_price)}-${formatPrice(product.value.product_price_max)}`
})

// แคโรเซล "สินค้าที่เกี่ยวข้อง" — โครงสร้างเดียวกับ HomePage.vue's "สินค้าแนะนำ"
// (ปุ่มลูกศรวงกลมลอย + จุดไล่ตำแหน่งด้านล่าง) เห็นทีละ 4 ชิ้นบนจอกว้าง
const relatedTrack = ref<HTMLElement | null>(null)
const canScrollRelatedLeft = ref(false)
const canScrollRelatedRight = ref(false)
const relatedActiveIndex = ref(0)

function relatedCardStep(el: HTMLElement) {
  const card = el.firstElementChild as HTMLElement | null
  return (card?.offsetWidth ?? el.clientWidth / 4) + 16 // + gap-4
}

function updateRelatedScrollState() {
  const el = relatedTrack.value
  if (!el) return
  canScrollRelatedLeft.value = el.scrollLeft > 4
  canScrollRelatedRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
  relatedActiveIndex.value = canScrollRelatedRight.value
    ? Math.round(el.scrollLeft / relatedCardStep(el))
    : (product.value?.related_products?.length ?? 1) - 1
}

function scrollRelatedByCards(direction: 1 | -1) {
  const el = relatedTrack.value
  if (!el) return
  if (direction === 1 && !canScrollRelatedRight.value) {
    el.scrollTo({ left: 0, behavior: 'smooth' })
    return
  }
  if (direction === -1 && !canScrollRelatedLeft.value) {
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
    return
  }
  el.scrollBy({ left: relatedCardStep(el) * direction, behavior: 'smooth' })
}

function scrollRelatedToIndex(i: number) {
  const el = relatedTrack.value
  if (!el) return
  el.scrollTo({ left: relatedCardStep(el) * i, behavior: 'smooth' })
}

const numRelatedDots = computed(() => Math.max(1, (product.value?.related_products?.length ?? 0) - 3))
const activeRelatedDot = computed(() => Math.min(relatedActiveIndex.value, numRelatedDots.value - 1))
</script>

<template>
  <!-- โครงร่างหน้ารายละเอียดระหว่างโหลด — วางกรอบรูป/ชื่อ/ราคา/ปุ่ม ไว้ตำแหน่ง
       เดียวกับของจริง เพื่อไม่ให้หน้ากระโดดตอนข้อมูลมาถึง -->
  <div v-if="loading" class="space-y-6" role="status" :aria-label="langs('loading')">
    <SkeletonBox class="h-4 w-64" />
    <div class="grid md:grid-cols-2 gap-8 bg-white border rounded-2xl p-5 md:p-8">
      <div class="space-y-3">
        <SkeletonBox class="aspect-[4/3] max-w-md mx-auto w-full rounded-xl" />
        <div class="flex gap-2 max-w-md mx-auto">
          <SkeletonBox v-for="n in 4" :key="n" class="w-1/4 aspect-square rounded-lg" />
        </div>
      </div>
      <div class="space-y-4">
        <SkeletonBox class="h-7 w-4/5" />
        <SkeletonBox class="h-4 w-32" />
        <SkeletonBox class="h-16 w-full rounded-xl" />
        <SkeletonBox class="h-4 w-2/3" />
        <SkeletonBox class="h-4 w-1/2" />
        <div class="grid grid-cols-2 gap-2 pt-2">
          <SkeletonBox v-for="n in 4" :key="n" class="h-10 rounded-lg" />
        </div>
      </div>
    </div>
    <SkeletonBox class="h-64 w-full rounded-2xl" />
  </div>
  <div v-else-if="error || !product" class="text-red-600 text-sm">{{ error ?? langs('productNotFound') }}</div>

  <div v-else class="space-y-6">
    <Breadcrumb
      :items="[
        { label: langs('navHome'), to: '/' },
        ...(product.category?.category_name
          ? [{ label: product.category.category_name, to: `/products?category_id=${product.category.category_id}` }]
          : []),
        { label: product.product_name },
      ]"
    />

    <div class="grid md:grid-cols-2 gap-8 bg-white border rounded-2xl p-5 md:p-8">
      <div class="space-y-3">
        <div class="aspect-[4/3] max-w-md mx-auto bg-white border rounded-xl overflow-hidden flex items-center justify-center p-4">
          <iframe
            v-if="activeMedia === 'video' && videoEmbedUrl"
            :src="videoEmbedUrl"
            class="w-full h-full"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          ></iframe>
          <img decoding="async" fetchpriority="high" v-else-if="activeImage" :src="resolveImageUrl(activeImage)" :alt="product.product_name" class="max-w-full max-h-full object-contain" />
          <span v-else class="text-gray-500">{{ langs('noImage') }}</span>
        </div>
        <!-- แถบรูปย่อ — แคโรเซลแบบเดียวกับ "สินค้าแนะนำ" หน้าแรก: ปุ่มลูกศรวงกลมลอย
             ทับขอบซ้าย/ขวา + เลื่อนดูทีละ 4 ชิ้น + จุดไล่ตำแหน่งด้านล่าง -->
        <div v-if="galleryThumbCount > 1" class="max-w-md mx-auto">
          <div class="relative">
            <button
              type="button"
              @click="scrollGalleryByCards(-1)"
              :aria-label="langs('scrollLeft')"
              class="absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg ring-1 ring-black/5 flex items-center justify-center text-navy-900 hover:text-brand-700 hover:scale-105 active:scale-95 transition-all"
            >
              <ChevronLeft aria-hidden="true" class="w-5 h-5" />
            </button>

            <div
              ref="galleryTrack"
              @scroll="updateGalleryScrollState"
              class="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <button
                v-for="(img, i) in galleryImages"
                :key="img"
                @click="showImage(img)"
                :aria-label="langs('productImageLabel', { n: i + 1 })"
                :aria-pressed="activeMedia === 'image' && activeImage === img"
                :class="[
                  'shrink-0 snap-start w-[calc(25%-0.375rem)] aspect-square rounded-lg overflow-hidden border-2',
                  activeMedia === 'image' && activeImage === img ? 'border-brand-500' : 'border-transparent',
                ]"
              >
                <img loading="lazy" decoding="async" :src="resolveImageUrl(img)" alt="" class="w-full h-full object-contain bg-white p-1" />
              </button>
              <!-- แสดงวิดีโอสินค้าเป็นรูปขนาดย่อถัดจากรูปภาพ -->
              <button
                v-if="videoThumbnail"
                @click="showVideo"
                :class="[
                  'relative shrink-0 snap-start w-[calc(25%-0.375rem)] aspect-square rounded-lg overflow-hidden border-2',
                  activeMedia === 'video' ? 'border-brand-500' : 'border-transparent',
                ]"
                :aria-label="langs('productVideoLabel')"
              >
                <img loading="lazy" decoding="async" :src="videoThumbnail" alt="" class="w-full h-full object-contain bg-white p-1" />
                <span class="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play aria-hidden="true" class="w-5 h-5 text-white fill-white" />
                </span>
              </button>
            </div>

            <button
              type="button"
              @click="scrollGalleryByCards(1)"
              :aria-label="langs('scrollRight')"
              class="absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg ring-1 ring-black/5 flex items-center justify-center text-navy-900 hover:text-brand-700 hover:scale-105 active:scale-95 transition-all"
            >
              <ChevronRight aria-hidden="true" class="w-5 h-5" />
            </button>
          </div>

          <div v-if="numGalleryDots > 1" class="flex justify-center items-center gap-1.5 mt-3">
            <button
              v-for="i in numGalleryDots"
              :key="i"
              type="button"
              @click="scrollGalleryToIndex(i - 1)"
              :aria-label="`${i}`"
              :aria-current="i - 1 === activeGalleryDot"
              class="rounded-full transition-all"
              :class="i - 1 === activeGalleryDot ? 'w-6 h-2 bg-brand-500' : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'"
            ></button>
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <h1 class="text-2xl font-bold">{{ product.product_name }}</h1>
        <p v-if="product.sold_count != null" class="text-sm text-gray-500">
          {{ langs('soldCountLabel', { n: product.sold_count }) }}
        </p>

        <!-- กล่องราคา: ราคาปัจจุบันแต่ละโมเดล -->
        <div class="bg-gray-50 rounded-lg px-4 py-3 flex items-baseline gap-3 flex-wrap">
          <span class="text-2xl text-brand-600 font-bold">
            {{ Number(displayPrice) ? formatPrice(displayPrice) : langs('priceOnRequest') }}
          </span>
          <span v-if="Number(displayPrice)" class="text-sm text-gray-500">{{ langs(isSubscription ? 'priceUnitSubscriptionLabel' : 'priceUnitLabel') }}</span>
          <!-- แจกแจงให้เห็นว่าราคาที่เพิ่มมาจากตัวเลือกไหน -->
          <span v-if="optionAddon > 0 && hasBasePrice" class="w-full text-xs text-gray-500">
            {{ langs('priceWithOptionNote', {
              base: formatPrice(effectivePrice ?? 0),
              option: selectedOption?.option_name ?? '',
              addon: formatPrice(optionAddon),
            }) }}
          </span>
        </div>

        <!-- แถวข้อมูล ความคุ้มครอง/การจัดส่ง — เป็น metadata แสดงผลอย่างเดียว -->
        <dl v-if="product.warranty_text || product.shipping_text" class="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <template v-if="product.warranty_text">
            <dt class="text-gray-500">{{ langs('warrantyRowLabel') }}</dt>
            <dd class="text-gray-700">{{ product.warranty_text }}</dd>
          </template>
          <template v-if="product.shipping_text">
            <dt class="text-gray-500">{{ langs('shippingRowLabel') }}</dt>
            <dd class="text-gray-700">{{ product.shipping_text }}</dd>
          </template>
        </dl>

        <!-- ส่วนเลือกดู model สินค้า -->
        <div v-if="product.product_model && product.product_model.length > 0" class="space-y-1.5">
          <p class="text-xs font-medium text-gray-500">{{ langs('modelSelectorLabel') }}</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="model in product.product_model"
              :key="model.model_id"
              type="button"
              @click="selectedModelId = model.model_id"
              :class="[
                'relative flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg border-2 transition-colors',
                model.model_id === selectedModelId
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-gray-200 hover:border-brand-300',
              ]"
            >
              <span class="w-5 h-5 rounded bg-gray-200 shrink-0"></span>
              <span class="text-sm text-gray-700">{{ model.model_name }}</span> 
            </button>
          </div>
        </div>

        <!-- ตัวเลือกสินค้า / ของเสริมที่ซื้อเพิ่มได้ — เลือกได้หลายรายการ -->
        <div v-if="product.product_option && product.product_option.length > 0" class="space-y-1.5">
          <p class="text-xs font-medium text-gray-500">{{ langs('addonOptionsLabel') }}</p>
          <!-- ชิปเล็กๆ เรียงต่อกันแล้วขึ้นบรรทัดใหม่เอง (แบบเดียวกับปุ่มเลือก Model
               ด้านบน) — ไม่ใช้แถวเต็มความกว้างเพราะกินพื้นที่เกินจำเป็น -->
          <div class="flex flex-wrap gap-2">
            <button
              v-for="option in product.product_option"
              :key="option.option_id"
              type="button"
              @click="selectOption(option.option_id)"
              :class="[
                'flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg border-2 transition-colors',
                selectedOptionId === option.option_id
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-gray-200 hover:border-brand-300',
              ]"
            >
              <span class="text-sm" :class="selectedOptionId === option.option_id ? 'text-brand-700 font-medium' : 'text-gray-700'">
                {{ option.option_name }}
              </span>
              <span v-if="option.addon_price > 0" class="text-[11px] text-gray-500">
                +{{ formatPrice(option.addon_price) }}
              </span>
            </button>
          </div>
        </div>

        <!-- ตัวเลือก/จำนวน — เป็นตัวเลขแสดงผลอย่างเดียว ระบบนี้ไม่มีตะกร้าสั่งซื้อ -->
        <div class="space-y-1.5">
          <div class="flex items-center gap-3 text-sm flex-wrap">
            <span class="text-gray-600">{{ langs('quantityLabel') }}</span>
            <div class="flex items-center border rounded-lg overflow-hidden">
              <button type="button" @click="decreaseQuantity" :aria-label="langs('quantityDecrease')" class="w-8 h-8 flex items-center justify-center hover:bg-gray-100 text-gray-500">
                <Minus aria-hidden="true" class="w-4 h-4" />
              </button>
              <span class="w-10 text-center font-medium">{{ quantity }}</span>
              <button type="button" @click="increaseQuantity" :aria-label="langs('quantityIncrease')" class="w-8 h-8 flex items-center justify-center hover:bg-gray-100 text-gray-500">
                <Plus aria-hidden="true" class="w-4 h-4" />
              </button>
            </div>
            <span class="text-gray-500">{{ langs(isSubscription ? 'priceUnitSubscriptionLabel' : 'priceUnitLabel') }}</span>

            <button
              type="button"
              @click="toggleCompare"
              :class="[
                'flex items-center gap-1.5 px-3 py-2 rounded-md text-xs border transition-colors',
                inCompare ? 'bg-brand-700 text-white border-brand-600' : 'text-gray-600 border-gray-200 hover:border-brand-400 hover:text-brand-700',
              ]"
            >
              <Check aria-hidden="true" v-if="inCompare" class="w-3.5 h-3.5" />
              <GitCompare aria-hidden="true" v-else class="w-3.5 h-3.5" />
              {{ inCompare ? langs('inCompareAlready') : langs('addToCompareDetail') }}
            </button>
          </div>
        </div>

        <!-- ปุ่มติดต่อสั่งซื้อผ่านช่องทางต่างๆ ตามลิงก์ที่แอดมินกรอกไว้ — โลโก้ของจริง
             ดึงมาจาก dtcshops.com เอง (เก็บไฟล์ไว้ใน frontend/public/ ไม่ hotlink ตรง
             เพราะ URL ต้นทางมี content-hash ที่เปลี่ยนทุกครั้งที่เขา deploy ใหม่ — แพทเทิร์น
             เดียวกับ DTC_logo.png/footer-bg.png ที่เก็บไว้ในเครื่องเองอยู่แล้ว) -->
        <div class="grid grid-cols-2 gap-3 pt-1">
          <a
            v-if="product.line_link"
            :href="product.line_link"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white bg-line-700 hover:bg-line-800"
          >
            <img loading="lazy" decoding="async" src="/line-icon.png" alt="" class="w-5 h-5 rounded-full" />
            {{ langs('contactOrderButton') }}
          </a>
          <a
            v-if="product.tiktok_link"
            :href="product.tiktok_link"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white bg-black hover:bg-gray-800"
          >
            <img loading="lazy" decoding="async" src="/tiktok-icon.png" alt="" class="w-5 h-5 rounded-full" />
            {{ langs('orderViaTiktok') }}
          </a>
          <a
            v-if="product.shopee_link"
            :href="product.shopee_link"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white bg-shopee-700 hover:bg-shopee-800"
          >
            <img loading="lazy" decoding="async" src="/shopee-icon.png" alt="" class="w-5 h-5 rounded-full" />
            {{ langs('orderViaShopee') }}
          </a>
          <a
            v-if="product.lazada_link"
            :href="product.lazada_link"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white bg-lazada-500 hover:bg-lazada-600"
          >
            <img loading="lazy" decoding="async" src="/lazada-icon.png" alt="" class="w-5 h-5 rounded-full" />
            {{ langs('orderViaLazada') }}
          </a>
        </div>

        <!-- แชร์หน้าสินค้า -->
        <div class="flex items-center gap-2.5 pt-1">
          <span class="text-xs text-gray-500">{{ langs('shareLabel') }}</span>
          <a
            :href="facebookShareUrl"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="langs('shareViaFacebook')"
            class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z"/></svg>
          </a>
          <a
            :href="lineShareUrl"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="langs('shareViaLine')"
            class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center overflow-hidden transition-colors"
          >
            <img loading="lazy" decoding="async" src="/line-icon.png" alt="" class="w-5 h-5 rounded-full" />
          </a>
          <a
            :href="emailShareUrl"
            :aria-label="langs('shareViaEmail')"
            class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
          >
            <Mail aria-hidden="true" class="w-4 h-4" />
          </a>
          <button
            type="button"
            @click="copyProductLink"
            :aria-label="langs('shareMenuLinkOption')"
            class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
          >
            <Link2 aria-hidden="true" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- รายละเอียด + ตารางคุณสมบัติ อยู่ใต้กล่องรูปภาพ/ราคาด้านบน แยกเป็นคนละส่วน -->
    <div v-if="product.description || effectiveAttributes.length > 0" class="bg-white border rounded-2xl p-5 md:p-8 space-y-6">
      <div v-if="product.description">
        <h2 class="font-semibold mb-2">{{ langs('productDescriptionTitle') }}</h2>
        <p class="text-sm text-gray-600 whitespace-pre-line">{{ product.description }}</p>
      </div>

      <div v-if="effectiveAttributes.length > 0">
        <h2 class="font-semibold mb-2">{{ langs('productAttributesTitle') }}</h2>
        <div class="overflow-x-auto border rounded-lg">
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="attr in effectiveAttributes" :key="attr.attribute.attribute_id" class="border-b last:border-0 even:bg-gray-50">
                <td class="px-4 py-2 text-gray-500 w-1/3 align-top">{{ attr.attribute.attribute_name }}</td>
                <td class="px-4 py-2 text-gray-900 whitespace-pre-line">{{ attr.value }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <section v-if="product.related_products && product.related_products.length > 0">
      <div class="flex items-center gap-3 mb-4">
        <span class="w-1.5 h-6 rounded-full bg-brand-500 shrink-0"></span>
        <h2 class="text-lg md:text-xl font-bold text-brand-700">{{ langs('relatedProductsTitle') }}</h2>
      </div>

      <!-- Arrows ลอยทับขอบรางนี้เท่านั้น แยกออกจากแถวจุดด้านล่างเพื่อไม่ให้ทับกัน -->
      <div class="relative">
        <button
          v-if="product.related_products.length > 1"
          type="button"
          @click="scrollRelatedByCards(-1)"
          :aria-label="langs('scrollLeft')"
          class="absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg ring-1 ring-black/5 flex items-center justify-center text-navy-900 hover:text-brand-700 hover:scale-105 active:scale-95 transition-all"
        >
          <ChevronLeft aria-hidden="true" class="w-5 h-5" />
        </button>

        <div
          ref="relatedTrack"
          @scroll="updateRelatedScrollState"
          class="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div
            v-for="p in product.related_products"
            :key="p.product_id"
            class="shrink-0 snap-start w-[calc(50%-0.5rem)] sm:w-[calc(33.333%-0.667rem)] md:w-[calc(25%-0.75rem)]"
          >
            <ProductCard :product="p" />
          </div>
        </div>

        <button
          v-if="product.related_products.length > 1"
          type="button"
          @click="scrollRelatedByCards(1)"
          :aria-label="langs('scrollRight')"
          class="absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg ring-1 ring-black/5 flex items-center justify-center text-navy-900 hover:text-brand-700 hover:scale-105 active:scale-95 transition-all"
        >
          <ChevronRight aria-hidden="true" class="w-5 h-5" />
        </button>
      </div>

      <div v-if="numRelatedDots > 1" class="relative z-20 flex justify-center items-center gap-1.5 mt-4">
        <button
          v-for="i in numRelatedDots"
          :key="i"
          type="button"
          @click="scrollRelatedToIndex(i - 1)"
          :aria-label="`${i}`"
          :aria-current="i - 1 === activeRelatedDot"
          class="rounded-full transition-all"
          :class="i - 1 === activeRelatedDot ? 'w-6 h-2 bg-brand-500' : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'"
        ></button>
      </div>
    </section>
  </div>
</template>
