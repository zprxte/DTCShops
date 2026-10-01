<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LayoutGrid, ChevronLeft, ChevronRight, MapPin, Phone } from 'lucide-vue-next'
import type * as LeafletTypes from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIconUrl from 'leaflet/dist/images/marker-icon.png'
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png'
import { bannerAPI, categoryAPI, productAPI, shopAPI, resolveImageUrl } from '../../services/api'
import ProductCard from '../../components/product/ProductCard.vue'
import ProductCardSkeleton from '../../components/product/ProductCardSkeleton.vue'
import SkeletonBox from '../../components/common/SkeletonBox.vue'
import type { BannerSlide, ProductCardData, ShopBranch } from '../../types/product'
import { useLanguage } from '../../language/useLanguage'

// Leaflet โหลดแบบ dynamic import (Week 15 — code splitting): ตัวไลบรารีหนัก
// ~140 kB แต่ใช้แค่แผนที่สาขาซึ่งอยู่ล่างสุดของหน้าแรก — ถ้า import ตรงๆ ทุกคน
// ที่เปิดหน้าแรกต้องดาวน์โหลดมันก่อนถึงจะเห็นอะไรเลย ตอนนี้โหลดตอนจะวาดแผนที่จริง
let L: typeof LeafletTypes | null = null

async function loadLeaflet() {
  if (L) return L
  L = await import('leaflet')
  // Vite doesn't run Leaflet's own CSS-relative asset resolution for its
  // default marker icon (a well-known Leaflet+bundler gotcha — without this,
  // every marker on the map below renders as a broken image) — point it at
  // the actual hashed asset URLs Vite produces for these three PNGs instead.
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
  L.Icon.Default.mergeOptions({
    iconUrl: markerIconUrl,
    iconRetinaUrl: markerIcon2xUrl,
    shadowUrl: markerShadowUrl,
  })
  return L
}

interface CategoryWithImage {
  category_id: string
  category_name: string
  sample_image?: string | null
}

const products = ref<ProductCardData[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const router = useRouter()
const { langs } = useLanguage()

const categories = ref<CategoryWithImage[]>([])
// แยก flag ของหมวดหมู่ต่างหากจาก loading ของ "สินค้าแนะนำ" — สอง endpoint นี้
// โหลดคู่ขนานกัน ใครเสร็จก่อนก็แสดงส่วนของตัวเองได้เลย ไม่ต้องรอกัน
const categoriesLoading = ref(true)
//ข้อมูลแบนเนอร์
const banners = ref<BannerSlide[]>([])
//อนิเมชันของแบนเนอร์
const BANNER_SLIDE_TRANSITION = 'transform 500ms cubic-bezier(0.4, 0, 0.2, 1)'
//ตำแหน่งของแบนเนอร์
const trackIndex = ref(0)
//เปิดปิดอนิเมชัน
const trackTransitionEnabled = ref(true)
//กันกดรัวๆ
const isSliding = ref(false)
const displaySlides = computed<BannerSlide[]>(() => {
  const list = banners.value
  return list.length > 1 ? [list[list.length - 1], ...list, list[0]] : list
})
// ตำแหน่งสไลด์จริง (0..length-1) คำนวณย้อนกลับจาก trackIndex
const bannerIndex = computed(() => {
  const length = banners.value.length
  if (length <= 1) return 0
  if (trackIndex.value === 0) return length - 1
  if (trackIndex.value === length + 1) return 0
  return trackIndex.value - 1
})
//อัตราส่วนของกรอบแบนเนอร์
const DEFAULT_BANNER_RATIO = 21 / 9
const bannerFrameRatio = ref(DEFAULT_BANNER_RATIO)
//โหลดรูปภาพแบนเนอร์
function loadImageRatio(src: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null)
    img.onerror = () => resolve(null)
    img.src = src
  })
}
async function computeAverageBannerRatio(list: BannerSlide[]) {
  const urls = list.map((b) => resolveImageUrl(b.image)).filter((u): u is string => !!u)
  if (urls.length === 0) return
  const ratios = (await Promise.all(urls.map(loadImageRatio))).filter((r): r is number => r !== null)
  if (ratios.length === 0) return
  bannerFrameRatio.value = ratios.reduce((sum, r) => sum + r, 0) / ratios.length
}

// เลื่อนไปสไลด์จริงตำแหน่ง i (0..length-1) แบบกระโดดตรงๆ — ใช้กับจุดไล่
// ตำแหน่ง ซึ่งไม่ต้องการการันตีทิศทางต่อเนื่องเหมือนปุ่มลูกศร
function scrollToBannerSlide(i: number) {
  if (isSliding.value || i + 1 === trackIndex.value) return
  ensureTrackIndexInRange()
  isSliding.value = true
  trackTransitionEnabled.value = true
  trackIndex.value = i + 1
}

// ผู้ใช้กดเลือกสไลด์เอง (ปุ่มลูกศร/จุด) — เลื่อนแล้วรีเซ็ตนาฬิกา auto banner
// ใหม่ กันเลื่อนสไลด์ถัดไปทันทีซ้อนกับที่เพิ่งกดไป
function scrollToBannerSlideManual(i: number) {
  scrollToBannerSlide(i)
  restartBannerAutoplay()
}

// เพื่อดึง trackIndex กลับเข้าตำแหน่งสไลด์แรก (real index 0) แบบไม่มีอนิเมชันก่อนเสมอ
function ensureTrackIndexInRange() {
  const length = banners.value.length
  const max = length > 1 ? length + 1 : 0
  if (trackIndex.value < 0 || trackIndex.value > max) {
    trackTransitionEnabled.value = false
    trackIndex.value = length > 1 ? 1 : 0
    requestAnimationFrame(() => requestAnimationFrame(() => { trackTransitionEnabled.value = true }))
  }
}

function scrollBannerByCards(direction: 1 | -1) {
  if (banners.value.length <= 1 || isSliding.value) return
  ensureTrackIndexInRange()
  isSliding.value = true
  trackTransitionEnabled.value = true
  trackIndex.value += direction
}

function scrollBannerByCardsManual(direction: 1 | -1) {
  scrollBannerByCards(direction)
  restartBannerAutoplay()
}

// track เลื่อนไปจบที่ "โคลน" หัว/ท้ายแล้ว (transitionend ยิงเฉพาะตอนอนิเมชัน
// จบจริง ไม่ใช่ตอน trackIndex ถูกตั้งค่าตรงๆ) — สลับกลับไปสไลด์จริงตำแหน่ง
// เดียวกันทันทีโดยปิด transition ไว้ 1 เฟรม ผู้ใช้จะไม่เห็นการกระโดดนี้เลย
// เพราะภาพที่โคลนกับภาพจริงตำแหน่งเดียวกันหน้าตาเหมือนกันทุกประการ — ทำให้
// กดปุ่มทิศทางเดิมต่อได้เรื่อยๆ โดยไม่มีวันโดนดีดย้อนทิศกลับ
function handleTrackTransitionEnd() {
  const length = banners.value.length
  if (length > 1 && (trackIndex.value === 0 || trackIndex.value === length + 1)) {
    trackTransitionEnabled.value = false
    trackIndex.value = trackIndex.value === 0 ? length : 1
    // ค้าง isSliding ไว้จนกว่าเฟรม "สลับกลับ" (ไม่มีอนิเมชัน) จะถูกวาดจริง
    // ก่อนปลดล็อกปุ่ม — กันคลิกรัวๆ ตรงจังหวะนี้พอดีมาสั่งเลื่อนซ้อนก่อนที่
    // transition จะถูกเปิดกลับ ซึ่งจะทำให้เฟรมสลับกลับกลายเป็นเห็นอนิเมชัน
    // เป็นภาพกระตุกแทนที่จะมองไม่เห็นเหมือนตั้งใจไว้
    requestAnimationFrame(() => requestAnimationFrame(() => {
      trackTransitionEnabled.value = true
      isSliding.value = false
    }))
  } else {
    isSliding.value = false
  }
}

// Auto banner — เลื่อนสไลด์เองทุก 5 วิ, หยุดพักตอนเมาส์ชี้ (mouseenter/leave)
// และรีเซ็ตนับใหม่ทุกครั้งที่ผู้ใช้สั่งเลื่อนเอง (ปุ่มลูกศร/จุด/สไลด์มือ) กัน
// สลับสไลด์ซ้อนกันขณะผู้ใช้กำลังโต้ตอบอยู่
const BANNER_AUTOPLAY_MS = 5000
let bannerAutoplayTimer: ReturnType<typeof setInterval> | null = null
function stopBannerAutoplay() {
  if (bannerAutoplayTimer) {
    clearInterval(bannerAutoplayTimer)
    bannerAutoplayTimer = null
  }
}
function startBannerAutoplay() {
  stopBannerAutoplay()
  if (banners.value.length <= 1) return
  bannerAutoplayTimer = setInterval(() => scrollBannerByCards(1), BANNER_AUTOPLAY_MS)
}
function restartBannerAutoplay() {
  startBannerAutoplay()
}
onUnmounted(stopBannerAutoplay)

// สลับตารางแบนเนอร์จริงของ dtcshops.com บางแถวมีชื่อไฟล์รูปอ้างอิงไม่ตรงกับที่
// อัปโหลดจริงอยู่แล้ว (404 จาก CDN) — ตัดออกจากรายการทันทีที่โหลดรูปไม่สำเร็จ
// แทนที่จะปล่อยให้ผู้ใช้เห็นไอคอนรูปพัง
function handleBannerImageError(bannerId: string) {
  const i = banners.value.findIndex((b) => b.banner_id === bannerId)
  if (i === -1) return
  banners.value.splice(i, 1)
  trackTransitionEnabled.value = false
  trackIndex.value = banners.value.length > 1 ? 1 : 0
  isSliding.value = false
  requestAnimationFrame(() => requestAnimationFrame(() => { trackTransitionEnabled.value = true }))
}

const scrollTrack = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
const activeIndex = ref(0)

function cardStep(el: HTMLElement) {
  const card = el.firstElementChild as HTMLElement | null
  return (card?.offsetWidth ?? el.clientWidth / 4) + 16
}

function updateScrollState() {
  const el = scrollTrack.value
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 4
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
  activeIndex.value = canScrollRight.value
    ? Math.round(el.scrollLeft / cardStep(el))
    : products.value.length - 1
}

function scrollByCards(direction: 1 | -1) {
  const el = scrollTrack.value
  if (!el) return
  if (direction === 1 && !canScrollRight.value) {
    el.scrollTo({ left: 0, behavior: 'smooth' })
    return
  }
  if (direction === -1 && !canScrollLeft.value) {
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
    return
  }
  el.scrollBy({ left: cardStep(el) * direction, behavior: 'smooth' })
}

function scrollToIndex(i: number) {
  const el = scrollTrack.value
  if (!el) return
  el.scrollTo({ left: cardStep(el) * i, behavior: 'smooth' })
}

const numDots = computed(() => Math.max(1, products.value.length - 5))
const activeDot = computed(() => Math.min(activeIndex.value, numDots.value - 1))

// ===== DTC Shop & Services — branch map + shop card carousel =====
const shops = ref<ShopBranch[]>([])
const mapEl = ref<HTMLElement | null>(null)
let leafletMap: LeafletTypes.Map | null = null
const shopMarkers = new Map<string, LeafletTypes.Marker>()

async function initShopMap() {
  if (!mapEl.value || shops.value.length === 0) return
  const L = await loadLeaflet()
  // เผื่อผู้ใช้เปลี่ยนหน้าไปแล้วระหว่างรอไลบรารีโหลด
  if (!mapEl.value) return
  leafletMap = L.map(mapEl.value, { scrollWheelZoom: false })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(leafletMap)

  const bounds = L.latLngBounds(shops.value.map((s) => [s.lat, s.lon]))
  leafletMap.fitBounds(bounds, { padding: [24, 24] })

  for (const s of shops.value) {
    const marker = L.marker([s.lat, s.lon]).addTo(leafletMap)
    marker.bindPopup(`<strong>${s.shop_name}</strong><br/>${s.address}`)
    // เดิม scroll การ์ดในแคโรเซลไปหาสาขานี้ทุกครั้งที่กด — ตัดออกตามคำขอ
    // ผู้ใช้ (4 ก.ย. 2026), คลิกหมุดแค่เปิด popup อย่างเดียวไม่ต้องขยับ
    // ตำแหน่ง scroll ของแคโรเซลด้านล่างเลย
    shopMarkers.set(s.shop_id, marker)
  }
}
onUnmounted(() => { leafletMap?.remove() })

// Shop-card carousel — separate ref set from the featured-products one
// above (same pattern this file already uses: two independent rails, not a
// shared composable) but mirrors its behavior exactly: wraparound arrows
// (jump to the opposite end instead of disabling) + dot indicators below.
const shopTrack = ref<HTMLElement | null>(null)
const shopCanScrollLeft = ref(false)
const shopCanScrollRight = ref(false)
const shopActiveIndex = ref(0)

function shopCardStep(el: HTMLElement) {
  const card = el.firstElementChild as HTMLElement | null
  return (card?.offsetWidth ?? el.clientWidth / 4) + 16
}
function updateShopScrollState() {
  const el = shopTrack.value
  if (!el) return
  shopCanScrollLeft.value = el.scrollLeft > 4
  shopCanScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
  shopActiveIndex.value = shopCanScrollRight.value
    ? Math.round(el.scrollLeft / shopCardStep(el))
    : shops.value.length - 1
}
function scrollShopByCards(direction: 1 | -1) {
  const el = shopTrack.value
  if (!el) return
  if (direction === 1 && !shopCanScrollRight.value) {
    el.scrollTo({ left: 0, behavior: 'smooth' })
    return
  }
  if (direction === -1 && !shopCanScrollLeft.value) {
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
    return
  }
  el.scrollBy({ left: shopCardStep(el) * direction, behavior: 'smooth' })
}
function scrollToShopIndex(i: number) {
  const el = shopTrack.value
  if (!el) return
  el.scrollTo({ left: shopCardStep(el) * i, behavior: 'smooth' })
}
// กดการ์ดสาขาแล้วบินไปตำแหน่งบนแผนที่ + เปิด popup เฉยๆ
function focusShopOnMap(s: ShopBranch) {
  if (!leafletMap) return
  leafletMap.flyTo([s.lat, s.lon], 14)
  shopMarkers.get(s.shop_id)?.openPopup()
}

// Capped at 4 cards visible at once (md: w-25%, no lg/xl step beyond that
// — unlike the featured-products rail above, which goes up to 6) — so the
// dot count only needs to account for 3 extra positions past the first
// full screen, not 5.
const shopNumDots = computed(() => Math.max(1, shops.value.length - 3))
const shopActiveDot = computed(() => Math.min(shopActiveIndex.value, shopNumDots.value - 1))

onMounted(() => {
  // สินค้าแนะนำ = 12 อันดับที่มีคนเข้าดูมากที่สุด (ยอดทั้งหมดใน tbl_logs)
  productAPI
    .list({ limit: 12, sort: 'popular' })
    .then((res) => {
      products.value = res.data.products ?? []
    })
    .catch(() => { error.value = langs('loadError') })
    .finally(() => {
      loading.value = false
      nextTick(updateScrollState)
    })

  categoryAPI
    .list()
    .then((res) => { categories.value = res.data ?? [] })
    .catch(() => {})
    .finally(() => { categoriesLoading.value = false })
  shopAPI.list().then((res) => {
    shops.value = res.data ?? []
    nextTick(() => { initShopMap(); updateShopScrollState() })
  }).catch(() => {})
  bannerAPI.list().then((res) => {
    banners.value = res.data ?? []
    trackIndex.value = banners.value.length > 1 ? 1 : 0
    startBannerAutoplay()
    computeAverageBannerRatio(banners.value)
  }).catch(() => {})
})

function goToCategory(c: CategoryWithImage) {
  // collapseFilters — ให้หน้าสินค้าย่อแผงตัวกรองไว้ เห็นสินค้าในหมวดทันที (ดู ProductsPage.vue)
  router.push({ path: '/products', query: { category_id: c.category_id }, state: { collapseFilters: true } })
}
</script>

<template>
  <h1 class="sr-only">{{ langs('homeHeading') }}</h1>

  <div class="space-y-12">
    <section v-if="banners.length > 0" class="mx-4 px-4">
      <div
        class="relative rounded-2xl overflow-hidden bg-gray-100"
        :style="{ aspectRatio: String(bannerFrameRatio) }"
        @mouseenter="stopBannerAutoplay"
        @mouseleave="startBannerAutoplay"
      >
        <div
          class="flex h-full"
          :style="{
            transform: `translateX(-${trackIndex * 100}%)`,
            transition: trackTransitionEnabled ? BANNER_SLIDE_TRANSITION : 'none',
          }"
          @transitionend="handleTrackTransitionEnd"
        >
          <a
            v-for="(b, i) in displaySlides"
            :key="`${b.banner_id}-${i}`"
            :href="b.link ?? undefined"
            :target="b.link ? '_blank' : undefined"
            rel="noopener noreferrer"
            class="shrink-0 w-full h-full"
            :class="{ 'pointer-events-none': !b.link }"
          >
            <img decoding="async"
              :src="resolveImageUrl(b.image) ?? undefined"
              :alt="b.title ?? ''"
              class="w-full h-full object-cover"
              @error="handleBannerImageError(b.banner_id)"
            />
          </a>
        </div>

        <template v-if="banners.length > 1">
          <!-- ปุ่มลูกศร — วงกลมทึบโปร่งแสงสีเข้ม + ไอคอนขาว ตาม markup จริง
               (icon-inbg) ของ dtcshops.com -->
          <button
            type="button"
            @click="scrollBannerByCardsManual(-1)"
            :aria-label="langs('scrollLeft')"
            class="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/30 flex items-center justify-center text-white hover:bg-black/50 active:scale-95 transition-all"
          >
            <ChevronLeft aria-hidden="true" class="w-5 h-5" />
          </button>
          <button
            type="button"
            @click="scrollBannerByCardsManual(1)"
            :aria-label="langs('scrollRight')"
            class="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/30 flex items-center justify-center text-white hover:bg-black/50 active:scale-95 transition-all"
          >
            <ChevronRight aria-hidden="true" class="w-5 h-5" />
          </button>

          <!-- จุดไล่ตำแหน่ง (custom-delimiters/dot ในภาพอ้างอิง) -->
          <div class="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
            <button
              v-for="(b, i) in banners"
              :key="b.banner_id"
              type="button"
              @click="scrollToBannerSlideManual(i)"
              :aria-label="`banner ${i + 1}`"
              class="h-2 rounded-full transition-all"
              :class="i === bannerIndex ? 'w-5 bg-white' : 'w-2 bg-white/50 hover:bg-white/75'">
            </button>
          </div>
        </template>
      </div>
    </section>

    <!-- Product Category -->
    <section v-if="categoriesLoading">
      <div class="flex items-center gap-3 mb-6 px-8">
        <span class="w-1.5 h-6 rounded-full bg-brand-500 shrink-0"></span>
        <h2 class="text-lg md:text-xl font-bold text-brand-700">{{ langs('categorySectionTitle') }}</h2>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4 px-8">
        <div v-for="n in 6" :key="n" class="flex flex-col items-center gap-2 border rounded-xl bg-white py-6">
          <SkeletonBox class="w-20 h-20 rounded-full" />
          <SkeletonBox class="h-3 w-16" />
        </div>
      </div>
    </section>

    <section v-else-if="categories.length > 0">
      <div class="flex items-center gap-3 mb-6 px-8">
        <span class="w-1.5 h-6 rounded-full bg-brand-500 shrink-0"></span>
        <h2 class="text-lg md:text-xl font-bold text-brand-700">{{ langs('categorySectionTitle') }}</h2>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4 px-8">
        <button
          v-for="c in categories"
          :key="c.category_id"
          type="button"
          @click="goToCategory(c)"
          class="flex flex-col items-center gap-2 border rounded-xl bg-white py-6 group hover:shadow-sm hover:border-brand-300 transition-all"
        >
          <span
            class="relative w-20 h-20 rounded-full bg-gray-50 border flex items-center justify-center group-hover:shadow-md group-hover:-translate-y-0.5 group-hover:border-brand-300 transition-all"
          >
            <img loading="lazy" decoding="async"
              v-if="c.sample_image"
              :src="resolveImageUrl(c.sample_image)"
              alt=""
              class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 max-w-none object-contain pointer-events-none"
            />
            <LayoutGrid aria-hidden="true" v-else class="w-7 h-7 text-gray-300" />
          </span>
          <span class="text-xs font-medium text-navy-900 text-center leading-tight group-hover:text-brand-700 transition-colors">
            {{ c.category_name }}
          </span>
        </button>
      </div>
    </section>

    <!-- Featured products -->
    <section>
      <div class="flex items-center gap-3 mb-6 px-8">
        <span class="w-1.5 h-6 rounded-full bg-brand-500 shrink-0"></span>
        <h2 class="text-lg md:text-xl font-bold text-brand-700">{{ langs('featuredTitle') }}</h2>
      </div>

      <!-- โครงร่างการ์ดระหว่างโหลด แทนข้อความ "กำลังโหลด" เดิม — เรียงเป็นแถว
           เท่ากับแคโรเซลจริง (สูงสุด 6 ใบต่อจอ) หน้าจึงไม่กระโดดตอนของจริงมา -->
      <div v-if="loading" class="px-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4" role="status" :aria-label="langs('loadingProducts')">
        <ProductCardSkeleton v-for="n in 6" :key="n" />
      </div>
      <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>
      <p v-if="!loading && !error && products.length === 0" class="text-gray-500 text-sm">{{ langs('noProducts') }}</p>

      <div v-if="!loading && !error && products.length > 0">
        <!-- Arrows are centered against this rail only — kept out of the dots
             row below so their absolute box can never sit on top of it. -->
        <div class="relative px-8">
          <button
            v-if="products.length > 1"
            type="button"
            @click="scrollByCards(-1)"
            :aria-label="langs('scrollLeft')"
            class="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg ring-1 ring-black/5 flex items-center justify-center text-navy-900 hover:text-brand-700 hover:scale-105 active:scale-95 transition-all"
          >
            <ChevronLeft aria-hidden="true" class="w-5 h-5" />
          </button>

          <div
            ref="scrollTrack"
            @scroll="updateScrollState"
            class="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div
              v-for="p in products"
              :key="p.product_id"
              class="shrink-0 snap-start w-[calc(50%-0.5rem)] sm:w-[calc(33.333%-0.667rem)] md:w-[calc(25%-0.75rem)] lg:w-[calc(20%-0.8rem)] xl:w-[calc(16.666%-0.833rem)]"
            >
              <ProductCard :product="p" />
            </div>
          </div>

          <button
            v-if="products.length > 1"
            type="button"
            @click="scrollByCards(1)"
            :aria-label="langs('scrollRight')"
            class="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg ring-1 ring-black/5 flex items-center justify-center text-navy-900 hover:text-brand-700 hover:scale-105 active:scale-95 transition-all"
          >
            <ChevronRight aria-hidden="true" class="w-5 h-5" />
          </button>
        </div>

        <div v-if="numDots > 1" class="relative z-20 flex justify-center items-center gap-1.5 mt-4">
          <button
            v-for="i in numDots"
            :key="i"
            type="button"
            @click="scrollToIndex(i - 1)"
            :aria-label="`${i}`"
            :aria-current="i - 1 === activeDot"
            class="rounded-full transition-all"
            :class="i - 1 === activeDot ? 'w-6 h-2 bg-brand-500' : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'">
          </button>
        </div>
      </div>
    </section>

    <!-- DTC Shop & Services — branch map -->
    <section v-if="shops.length > 0" class="px-8">
      <div class="flex items-center gap-3 mb-1">
        <span class="w-1.5 h-6 rounded-full bg-brand-500 shrink-0"></span>
        <h2 class="text-lg md:text-xl font-bold text-brand-700">{{ langs('shopSectionTitle') }}</h2>
      </div>
      <h3 class="text-xl md:text-2xl font-bold text-navy-900 mb-6">{{ langs('shopSectionSubtitle') }}</h3>

      <div ref="mapEl" class="w-full h-[320px] md:h-[420px] rounded-2xl overflow-hidden border z-0"></div>

      <div class="mt-6">
        <!-- Same rail shape as the "สินค้าแนะนำ" carousel above: arrows
             centered against the rail only, wraparound instead of disabled,
             dot row underneath. -->
        <div class="relative">
          <button
            v-if="shops.length > 1"
            type="button"
            @click="scrollShopByCards(-1)"
            :aria-label="langs('scrollLeft')"
            class="absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg ring-1 ring-black/5 flex items-center justify-center text-navy-900 hover:text-brand-700 hover:scale-105 active:scale-95 transition-all"
          >
            <ChevronLeft aria-hidden="true" class="w-5 h-5" />
          </button>

          <div
            ref="shopTrack"
            @scroll="updateShopScrollState"
            class="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              v-for="s in shops"
              :key="s.shop_id"
              type="button"
              @click="focusShopOnMap(s)"
              class="shrink-0 snap-start w-[calc(50%-0.5rem)] sm:w-[calc(33.333%-0.667rem)] md:w-[calc(25%-0.75rem)] text-left bg-white rounded-xl shadow-sm hover:shadow-md transition-all outline-none flex flex-col"
            >
              <div class="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden rounded-t-xl">
                <img loading="lazy" decoding="async" v-if="s.image" :src="resolveImageUrl(s.image)" :alt="s.shop_name" class="w-full h-full object-cover object-top" />
                <MapPin aria-hidden="true" v-else class="w-8 h-8 text-gray-300" />
              </div>
              <!-- Fixed-height text block (regardless of name/address length)
                   so every card in the rail lines up at the same height —
                   title/address each reserve exactly 2 lines' worth of
                   space, the phone block always renders (blank if a shop
                   has none) instead of collapsing away. -->
              <div class="p-4 flex flex-col flex-1">
                <p class="text-base font-bold text-brand-700 leading-snug line-clamp-2 min-h-[2.75rem]">{{ s.shop_name }}</p>
                <p class="text-sm text-gray-500 leading-snug line-clamp-2 min-h-[2.5rem] mt-1.5">{{ s.address }}</p>
                <div class="pt-1 mt-auto min-h-[2.75rem]">
                  <template v-if="s.tel">
                    <p class="flex items-center gap-1 text-xs text-brand-700">
                      <Phone aria-hidden="true" class="w-3.5 h-3.5 shrink-0" />
                      {{ langs('shopTelLabel') }}
                    </p>
                    <p class="text-sm font-bold text-navy-900">{{ s.tel }}</p>
                  </template>
                </div>
              </div>
            </button>
          </div>

          <button
            v-if="shops.length > 1"
            type="button"
            @click="scrollShopByCards(1)"
            :aria-label="langs('scrollRight')"
            class="absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg ring-1 ring-black/5 flex items-center justify-center text-navy-900 hover:text-brand-700 hover:scale-105 active:scale-95 transition-all"
          >
            <ChevronRight aria-hidden="true" class="w-5 h-5" />
          </button>
        </div>

        <div v-if="shopNumDots > 1" class="relative z-20 flex justify-center items-center gap-1.5 mt-4">
          <button
            v-for="i in shopNumDots"
            :key="i"
            type="button"
            @click="scrollToShopIndex(i - 1)"
            :aria-label="`${i}`"
            :aria-current="i - 1 === shopActiveDot"
            class="rounded-full transition-all"
            :class="i - 1 === shopActiveDot ? 'w-6 h-2 bg-brand-500' : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'">
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
