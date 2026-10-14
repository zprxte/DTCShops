<script setup lang="ts">
// หน้าสินค้าทั้งหมด / ผลค้นหา: ตัวกรองหมวด+แท็ก (เก็บใน URL) + เรียง + แบ่งหน้า + คุณหมายถึง…?
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Info, Loader2, Search, SlidersHorizontal, X } from 'lucide-vue-next'
import { categoryAPI, productAPI, searchAPI } from '../../services/api'
import ProductCard from '../../components/product/ProductCard.vue'
import ProductCardSkeleton from '../../components/product/ProductCardSkeleton.vue'
import Breadcrumb from '../../components/common/Breadcrumb.vue'
import type { ProductCardData } from '../../types/product'
import { useLanguage } from '../../language/useLanguage'
import { productSlug } from '../../utils/slug'

const route = useRoute()
const router = useRouter()
const { langs } = useLanguage()

const products = ref<ProductCardData[]>([])
// คุณหมายถึง…? (มี slug ทำลิงก์เข้าหน้าสินค้า)
const suggestions = ref<{ product_id: string; product_name: string; slug?: string | null }[]>([])
// คำที่ระบบค้นจริงเมื่อกู้แป้นให้ (null = คำที่พิมพ์)
const searchedAs = ref<string | null>(null)
const total = ref(0)
const totalPages = ref(1)
const loading = ref(false)
// โชว์ตัวหมุนเฉพาะเมื่อรอนานจริง ไม่ให้กะพริบ
const loadingVisible = ref(false)
let loadingTimer: ReturnType<typeof setTimeout> | undefined
watch(loading, (busy) => {
  clearTimeout(loadingTimer)
  if (busy) loadingTimer = setTimeout(() => { loadingVisible.value = true }, 250)
  else loadingVisible.value = false
})
// เคยโหลดสำเร็จหรือยัง (กันโชว์ "พบ 0 รายการ" ตอนเปิดหน้า)
const hasLoaded = ref(false)
const error = ref<string | null>(null)
const categories = ref<{ category_id: string; category_name: string }[]>([])

// ตัวกรอง: หลายหมวด = "หรือ" · หลายแท็ก = "และ" · เก็บใน URL ด้วย router.replace (ไม่ให้ย้อนกลับทีละติ๊ก)
type Facet = { category_id: string; category_name: string; count: number }
type TagFacet = { tag: string; label: string; count: number }

const parseIds = (value: unknown) => String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean)

const categoryFacets = ref<Facet[]>([])
const tagFacets = ref<TagFacet[]>([])
// ?category_id= ค่าเดียว (ลิงก์การ์ดหมวดหมู่/ลิงก์เก่า) ยังใช้ได้
const selectedCategoryIds = ref<string[]>(
  parseIds(route.query.category_ids ?? route.query.category_id),
)
const selectedTags = ref<string[]>(parseIds(route.query.tags))
const tagQuery = ref('')
// แผงตัวกรองย่อ/กางได้ จำค่าในเครื่อง · ยังไม่เคยเลือก = จอเล็กย่อ จอใหญ่กาง
const FILTERS_OPEN_KEY = 'products_filters_open'
// ค่าเริ่มต้นของแผงตัวกรอง
function initialFiltersOpen() {
  // มาจากการ์ดหมวดหมู่หน้าแรก (history state) = ย่อไว้เสมอ ไม่บันทึกทับค่าที่ผู้ใช้เลือก
  if (window.history.state?.collapseFilters) return false
  try {
    const saved = localStorage.getItem(FILTERS_OPEN_KEY)
    if (saved !== null) return saved === '1'
  } catch { /* เบราว์เซอร์ปิด storage — ใช้ค่าเริ่มต้นตามขนาดจอ */ }
  return window.matchMedia('(min-width: 768px)').matches
}
const filtersOpen = ref(initialFiltersOpen())
watch(filtersOpen, (open) => {
  try { localStorage.setItem(FILTERS_OPEN_KEY, open ? '1' : '0') } catch { /* ไม่จำก็ไม่เป็นไร */ }
})
const showAllTags = ref(false)
const TAGS_COLLAPSED = 24

const sort = ref('relevance')
const PAGE_SIZE = 12
const page = ref(1)

const activeFilterCount = computed(() => selectedCategoryIds.value.length + selectedTags.value.length)

const isTagSelected = (tag: string) => selectedTags.value.some((t) => t.toLowerCase() === tag.toLowerCase())

// ลำดับชิปคงที่ (ตามจำนวนสินค้า) — ห้ามดันตัวที่เลือกขึ้นหน้า ไม่งั้นชิปกระโดด
const visibleTags = computed(() => {
  const q = tagQuery.value.trim().toLowerCase()
  const matched = q ? tagFacets.value.filter((t) => t.label.toLowerCase().includes(q)) : tagFacets.value
  if (q || showAllTags.value) return matched
  const head = matched.slice(0, TAGS_COLLAPSED)
  const pickedButCut = matched.slice(TAGS_COLLAPSED).filter((t) => isTagSelected(t.label))
  return [...head, ...pickedButCut]
})

const hiddenTagCount = computed(() =>
  tagQuery.value.trim() ? 0 : Math.max(0, tagFacets.value.length - TAGS_COLLAPSED),
)

// ตัวที่ติ๊กไว้ แสดงเป็นชิปตอนย่อแผง
const selectedChips = computed(() => [
  ...selectedCategoryIds.value.map((id) => ({
    key: `category:${id}`,
    label: categoryFacets.value.find((c) => String(c.category_id) === id)?.category_name ?? id,
    remove: () => toggleIn(selectedCategoryIds, id),
  })),
  ...selectedTags.value.map((tag) => ({
    key: `tag:${tag}`,
    label: tagFacets.value.find((t) => t.label.toLowerCase() === tag.toLowerCase())?.label ?? tag,
    remove: () => toggleIn(selectedTags, tag),
  })),
])

// ติ๊ก/ถอนติ๊กค่าในรายการ แล้วเขียนลง URL
function toggleIn(list: { value: string[] }, id: string) {
  const i = list.value.indexOf(id)
  if (i >= 0) list.value.splice(i, 1)
  else list.value.push(id)
  syncQuery()
}

// ล้างตัวกรองทั้งหมด
function clearFilters() {
  if (activeFilterCount.value === 0) return
  selectedCategoryIds.value = []
  selectedTags.value = []
  syncQuery()
}

// เขียนตัวกรองลง URL แล้วให้ watcher ของ route โหลด (ทางเดียว กันคำขอซ้อน)
function syncQuery() {
  page.value = 1
  router.replace({
    query: {
      ...route.query,
      category_id: undefined,
      category_ids: selectedCategoryIds.value.join(',') || undefined,
      tags: selectedTags.value.join(',') || undefined,
    },
  })
}

onMounted(() => {
  categoryAPI.list().then((res) => { categories.value = res.data ?? [] }).catch(() => {})
  productAPI.filters()
    .then((res) => {
      categoryFacets.value = res.data.categories ?? []
      tagFacets.value = res.data.tags ?? []
    })
    .catch(() => {})
})

// โหลดสินค้า: มีคำค้น = /search · ไม่มี = /products
function load() {
  const searchword = String(route.query.searchword ?? '')
  const hasQuery = searchword.trim().length > 0
  loading.value = true
  error.value = null
  suggestions.value = []
  searchedAs.value = null

  if (!hasQuery) {
    productAPI
      .list({
        page: page.value,
        limit: PAGE_SIZE,
        category_ids: selectedCategoryIds.value.join(',') || undefined,
        tags: selectedTags.value.join(',') || undefined,
        sort: sort.value === 'relevance' ? undefined : sort.value,
      })
      .then((res) => {
        products.value = res.data.products ?? []
        total.value = res.data.total ?? 0
        totalPages.value = res.data.total_pages ?? 1
      })
      .catch(() => { error.value = langs('loadError') })
      .finally(() => { loading.value = false; hasLoaded.value = true })
    return
  }

  searchAPI
    .search({
      searchword,
      category_ids: selectedCategoryIds.value.join(',') || undefined,
      tags: selectedTags.value.join(',') || undefined,
      sort: sort.value,
      page: page.value,
      limit: PAGE_SIZE,
    })
    .then((res) => {
      products.value = res.data.products ?? []
      suggestions.value = res.data.suggestions ?? []
      searchedAs.value = res.data.searched_as ?? null
      total.value = res.data.total ?? 0
      totalPages.value = res.data.total_pages ?? 1
    })
    .catch(() => { error.value = langs('searchFailedMsg') })
    .finally(() => { loading.value = false; hasLoaded.value = true })
}

// เลขหน้า: หน้าแรก/สุดท้าย + หน้ารอบๆ ที่เหลือเป็น …
const pageNumbers = computed<(number | '...')[]>(() => {
  const last = totalPages.value
  const current = page.value
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)
  const around = new Set<number>([1, last, current, current - 1, current + 1])
  if (current <= 3) [2, 3, 4].forEach((n) => around.add(n))
  if (current >= last - 2) [last - 3, last - 2, last - 1].forEach((n) => around.add(n))
  const pages = [...around].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b)
  const out: (number | '...')[] = []
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1] > 1) out.push('...')
    out.push(n)
  })
  return out
})

function goToPage(p: number) {
  if (p < 1 || p > totalPages.value || p === page.value) return
  page.value = p
  load()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(load)
watch(() => route.query.searchword, () => { page.value = 1; load() })
watch(sort, () => { page.value = 1; load() })

// URL เปลี่ยน → อ่านตัวกรองกลับเข้า state แล้วโหลดใหม่
watch(
  () => [route.query.category_ids, route.query.category_id, route.query.tags],
  () => {
    const fromUrl = parseIds(route.query.category_ids ?? route.query.category_id)
    const tagsFromUrl = parseIds(route.query.tags)
    if (fromUrl.join(',') !== selectedCategoryIds.value.join(',')) selectedCategoryIds.value = fromUrl
    if (tagsFromUrl.join(',') !== selectedTags.value.join(',')) selectedTags.value = tagsFromUrl
    page.value = 1
    load()
  },
)

// breadcrumb: หน้าแรก > หมวด (ถ้าติ๊กหมวดเดียว) > หน้านี้
const breadcrumbItems = computed(() => {
  const items: { label: string; to?: string }[] = [{ label: langs('navHome'), to: '/' }]
  const cat = selectedCategoryIds.value.length === 1
    ? categoryFacets.value.find((c) => String(c.category_id) === selectedCategoryIds.value[0])
    : null
  if (cat) items.push({ label: cat.category_name, to: `/products?category_ids=${cat.category_id}` })
  items.push({ label: route.query.searchword ? `${langs('searchResultsFor')} "${route.query.searchword}"` : langs('navProducts') })
  return items
})
</script>

<template>
  <div class="space-y-4">
    <Breadcrumb :items="breadcrumbItems" />

    <!-- min-h เท่าปุ่มแบ่งหน้า กันแถวยุบตอนเหลือหน้าเดียว -->
    <div class="flex items-center justify-between gap-4 flex-wrap min-h-8">
      <h1 class="text-lg font-semibold">
        <template v-if="route.query.searchword">
          {{ langs('searchResultsFor') }} "{{ route.query.searchword }}"
          <span v-if="total > 0" class="text-gray-500 font-normal">({{ langs('searchResultsCount', { n: total }) }})</span>
        </template>
        <template v-else>{{ langs('navProducts') }}</template>
      </h1>

      <div v-if="totalPages > 1" class="flex items-center gap-3 text-sm text-gray-500">
        <span>{{ langs('paginationPageOf', { page, total: totalPages }) }}</span>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            @click="goToPage(page - 1)"
            :disabled="page <= 1"
            :aria-label="langs('paginationPrev')"
            class="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeft aria-hidden="true" class="w-4 h-4" />
          </button>
          <button
            type="button"
            @click="goToPage(page + 1)"
            :disabled="page >= totalPages"
            :aria-label="langs('paginationNext')"
            class="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRight aria-hidden="true" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- บอกว่าผลมาจากคำที่กู้แป้นให้ -->
    <p
      v-if="searchedAs"
      role="status"
      class="flex items-start gap-2 text-sm text-navy-900 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2"
    >
      <Info aria-hidden="true" class="w-4 h-4 shrink-0 mt-0.5 text-brand-700" />
      <span>{{ langs('searchedAsNotice', { typed: String(route.query.searchword ?? ''), corrected: searchedAs }) }}</span>
    </p>

    <hr class="border-gray-200" />

    <section class="rounded-xl border bg-white overflow-hidden" aria-labelledby="product-filters-heading">
      <!-- มือถือใช้ order สลับตำแหน่ง แต่ลำดับใน DOM ตรงจอใหญ่ (ลำดับ Tab) -->
      <div
        class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 bg-gray-50"
        :class="(filtersOpen || selectedChips.length > 0) && 'border-b'"
      >
        <div class="order-1 flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <SlidersHorizontal class="w-4 h-4 shrink-0 text-brand-700" aria-hidden="true" />
          <h2 id="product-filters-heading" class="text-[15px] font-semibold text-navy-900 whitespace-nowrap">{{ langs('filtersHeading') }}</h2>
          <!-- จำนวนผลลัพธ์ (role=status ให้ screen reader อ่าน) ค้างค่าเดิมระหว่างโหลดไม่ให้กะพริบ -->
          <span v-if="hasLoaded" class="flex items-center gap-2 text-sm text-gray-500 whitespace-nowrap">
            <span class="hidden sm:inline text-gray-300" aria-hidden="true">·</span>
            <span role="status" aria-atomic="true" class="tabular-nums">{{ langs('filtersResultCount', { n: total }) }}</span>
            <Loader2 v-if="loadingVisible" class="w-3.5 h-3.5 animate-spin text-brand-500" aria-hidden="true" />
          </span>
        </div>

        <div class="order-3 sm:order-2 w-full sm:w-auto flex items-center justify-between sm:justify-end gap-3">
          <!-- invisible ไม่ใช่ v-if — จองที่ไว้ ไม่ให้ dropdown เรียงลำดับขยับ -->
          <button
            type="button"
            @click="clearFilters"
            :class="activeFilterCount > 0 ? '' : 'invisible'"
            :tabindex="activeFilterCount > 0 ? undefined : -1"
            :aria-hidden="activeFilterCount > 0 ? undefined : 'true'"
            class="text-sm text-gray-600 hover:text-red-600 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {{ langs('filtersClear') }}
          </button>
          <span class="hidden sm:block h-4 w-px bg-gray-300" :class="activeFilterCount > 0 ? '' : 'invisible'" aria-hidden="true"></span>
          <label class="flex items-center gap-2 text-sm text-gray-600">
            <span class="hidden sm:inline whitespace-nowrap">{{ langs('sortByLabel') }}</span>
            <!-- aria-label เพราะจอเล็กซ่อนข้อความ "เรียงตาม" -->
            <select v-model="sort" :aria-label="langs('sortByLabel')" class="border rounded-lg px-3 py-1.5 text-sm text-navy-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
              <option value="relevance">{{ langs('sortRelevance') }}</option>
              <option value="price_asc">{{ langs('sortPriceAsc') }}</option>
              <option value="price_desc">{{ langs('sortPriceDesc') }}</option>
              <option value="name">{{ langs('sortName') }}</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          @click="filtersOpen = !filtersOpen"
          :aria-expanded="filtersOpen"
          aria-controls="product-filters"
          class="order-2 sm:order-3 -mr-1.5 inline-flex items-center gap-1 min-h-8 [@media(pointer:coarse)]:min-h-11 px-2 rounded-lg text-sm font-medium text-brand-700 whitespace-nowrap [@media(hover:hover)]:hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {{ filtersOpen ? langs('filtersHide') : langs('filtersShow') }}
          <ChevronDown
            class="w-4 h-4 transition-transform motion-reduce:transition-none"
            :class="filtersOpen && 'rotate-180'"
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        v-if="!filtersOpen && selectedChips.length > 0"
        class="flex flex-wrap gap-1.5 px-4 py-3"
      >
        <span
          v-for="chip in selectedChips"
          :key="chip.key"
          class="inline-flex items-center gap-1 min-h-8 [@media(pointer:coarse)]:min-h-11 pl-3 pr-1 rounded-lg border border-brand-600 bg-brand-50 text-brand-800 text-[13px] whitespace-nowrap"
        >
          {{ chip.label }}
          <button
            type="button"
            @click="chip.remove()"
            :aria-label="langs('filterRemove', { name: chip.label })"
            class="w-6 h-6 [@media(pointer:coarse)]:w-9 [@media(pointer:coarse)]:h-9 rounded-md flex items-center justify-center hover:bg-brand-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X class="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </span>
      </div>

      <div id="product-filters" v-show="filtersOpen" class="divide-y divide-gray-100">
        <div class="px-4 py-3 sm:grid sm:grid-cols-[6.5rem_1fr] sm:gap-4">
          <h3 class="mb-2 sm:mb-0 sm:pt-1.5 text-[13px] font-medium text-gray-600">{{ langs('filterCategoryGroup') }}</h3>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="c in categoryFacets"
              :key="c.category_id"
              type="button"
              :aria-pressed="selectedCategoryIds.includes(String(c.category_id))"
              @click="toggleIn({ value: selectedCategoryIds }, String(c.category_id))"
              class="inline-flex items-center gap-2 min-h-8 [@media(pointer:coarse)]:min-h-11 pl-3 pr-1.5 rounded-lg border text-[13px] whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              :class="selectedCategoryIds.includes(String(c.category_id))
                ? 'border-brand-600 bg-brand-50 text-brand-800'
                : 'border-gray-200 bg-white text-navy-900 hover:border-brand-300 hover:bg-brand-50/40'"
            >
              {{ c.category_name }}
              <span
                class="min-w-5 px-1.5 rounded text-xs leading-5 text-center tabular-nums transition-colors"
                :class="selectedCategoryIds.includes(String(c.category_id)) ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600'"
              >{{ c.count }}</span>
            </button>
          </div>
        </div>

        <div class="px-4 py-3 sm:grid sm:grid-cols-[6.5rem_1fr] sm:gap-4">
          <h3 class="mb-2 sm:mb-0 sm:pt-1.5 text-[13px] font-medium text-gray-600">{{ langs('filterTagGroup') }}</h3>
          <div class="space-y-2">
            <div v-if="tagFacets.length > TAGS_COLLAPSED" class="relative w-full sm:w-56">
              <Search class="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                v-model="tagQuery"
                type="search"
                :placeholder="langs('filterTagSearch')"
                :aria-label="langs('filterTagSearch')"
                class="w-full border rounded-lg pl-8 pr-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>

            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="t in visibleTags"
                :key="t.tag"
                type="button"
                :aria-pressed="isTagSelected(t.label)"
                @click="toggleIn({ value: selectedTags }, t.label)"
                class="inline-flex items-center gap-2 min-h-8 [@media(pointer:coarse)]:min-h-11 pl-3 pr-1.5 rounded-lg border text-[13px] whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                :class="isTagSelected(t.label)
                  ? 'border-brand-600 bg-brand-50 text-brand-800'
                  : 'border-gray-200 bg-white text-navy-900 hover:border-brand-300 hover:bg-brand-50/40'"
              >
                {{ t.label }}
                <span
                  class="min-w-5 px-1.5 rounded text-xs leading-5 text-center tabular-nums transition-colors"
                  :class="isTagSelected(t.label) ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600'"
                >{{ t.count }}</span>
              </button>
            </div>

            <p v-if="visibleTags.length === 0" class="text-sm text-gray-500">{{ langs('filterTagNoMatch') }}</p>

            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p class="text-xs text-gray-500">{{ langs('filterTagHint') }}</p>
              <button
                v-if="hiddenTagCount > 0"
                type="button"
                @click="showAllTags = !showAllTags"
                class="text-sm text-brand-700 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {{ showAllTags ? langs('filterShowLess') : langs('filterShowMore', { n: hiddenTagCount }) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>

    <div v-if="!loading && !error && products.length === 0 && route.query.searchword" class="text-center text-gray-500 py-10 space-y-2">
      <p>{{ langs('noResultsFound') }}</p>
      <!-- ชื่อสินค้าเป็นลิงก์ จุลภาคอยู่นอกลิงก์ -->
      <p v-if="suggestions.length > 0">
        {{ langs('didYouMean') }}
        <template v-for="(s, i) in suggestions" :key="s.product_id">
          <RouterLink
            :to="`/product/${productSlug(s)}`"
            class="text-brand-700 font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded"
          >{{ s.product_name }}</RouterLink><span v-if="i < suggestions.length - 1">, </span>
        </template>
      </p>
      <div class="flex flex-wrap justify-center gap-2 pt-2">
        <RouterLink :to="{ path: '/products', query: { ...route.query, searchword: undefined } }" class="inline-flex items-center rounded-full bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
          {{ langs('viewAllProducts') }}
        </RouterLink>
        <button v-if="activeFilterCount > 0" type="button" class="inline-flex items-center rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:border-brand-400 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2" @click="clearFilters">
          {{ langs('filtersClear') }}
        </button>
      </div>
    </div>

    <div v-if="!loading && !error && products.length === 0 && !route.query.searchword && activeFilterCount > 0" class="text-center text-gray-500 py-10 space-y-3">
      <p>{{ langs('noFilterMatch') }}</p>
      <button type="button" class="inline-flex items-center rounded-full bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2" @click="clearFilters">{{ langs('filtersClear') }}</button>
    </div>
    <p v-else-if="!loading && !error && products.length === 0 && !route.query.searchword" class="text-gray-500 text-sm" style="margin-top: 20px;">
      {{ langs('noProducts') }}
    </p>

    <h2 class="sr-only">{{ langs('productListHeading') }}</h2>

    <!-- โหลดครั้งแรก = โครงร่างการ์ด · โหลดครั้งต่อไป = หรี่ของเดิมไว้ -->
    <div v-if="loading && products.length === 0" class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4" role="status" :aria-label="langs('loadingProducts')">
      <ProductCardSkeleton v-for="n in 12" :key="n" />
    </div>

    <div
      v-else
      class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4 transition-opacity"
      :aria-busy="loading || undefined"
      :class="loadingVisible && 'opacity-50'"
    >
      <ProductCard v-for="p in products" :key="p.product_id" :product="p" :query="String(route.query.searchword ?? '')" />
    </div>

    <nav v-if="totalPages > 1 && !loading" class="flex items-center justify-center gap-1.5 pt-2" :aria-label="langs('paginationPageOf', { page, total: totalPages })">
      <button
        type="button"
        @click="goToPage(page - 1)"
        :disabled="page <= 1"
        :aria-label="langs('paginationPrev')"
        class="w-9 h-9 rounded-full border flex items-center justify-center hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronLeft aria-hidden="true" class="w-4 h-4" />
      </button>

      <template v-for="(n, i) in pageNumbers" :key="`${n}-${i}`">
        <span v-if="n === '...'" class="w-9 h-9 flex items-center justify-center text-gray-500 select-none">…</span>
        <button
          v-else
          type="button"
          @click="goToPage(n)"
          :aria-current="n === page ? 'page' : undefined"
          :class="[
            'w-9 h-9 rounded-full border text-sm flex items-center justify-center',
            n === page ? 'bg-brand-600 border-brand-600 text-white font-semibold' : 'hover:bg-gray-100',
          ]"
        >
          {{ n }}
        </button>
      </template>

      <button
        type="button"
        @click="goToPage(page + 1)"
        :disabled="page >= totalPages"
        :aria-label="langs('paginationNext')"
        class="w-9 h-9 rounded-full border flex items-center justify-center hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <ChevronRight aria-hidden="true" class="w-4 h-4" />
      </button>
    </nav>
  </div>
</template>
