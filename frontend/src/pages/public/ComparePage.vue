<script setup lang="ts">
// หน้าเปรียบเทียบ: ตาราง 2–4 ช่อง (สินค้า + โมเดล) คัดกรองคุณสมบัติ เรียงตามสเปค ป้ายเหมือน/ต่าง แชร์ลิงก์
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { X, Share2, ChevronDown, ChevronLeft, Plus, Check, Trash2 } from 'lucide-vue-next'
import { compareAPI, productAPI, resolveImageUrl } from '../../services/api'
import { COMPARE_SIZES, useCompareStore, compareItemKey } from '../../stores/compare'
import type { CompareProduct } from '../../stores/compare'
import { useLanguage } from '../../language/useLanguage'
import { toast } from '../../stores/toast'
import { productSlug } from '../../utils/slug'
import { copyLink } from '../../utils/share'
import ProductAvatar from '../../components/product/ProductAvatar.vue'
import SkeletonBox from '../../components/common/SkeletonBox.vue'
import type { ProductDetail, ProductCardData, ProductModel } from '../../types/product'

const route = useRoute()
const router = useRouter()
const compareStore = useCompareStore()
const { langs } = useLanguage()

const products = ref<ProductDetail[]>([])
const productById = computed(() => new Map(products.value.map((product) => [product.product_id, product])))
const loading = ref(false)
const error = ref<string | null>(null)
let loggedThisVisit = false

interface CompareColumn {
  key: string
  item: CompareProduct
  product: ProductDetail
}

const columns = computed<CompareColumn[]>(() =>
  compareStore.items
    .map((item) => {
      const product = productById.value.get(item.product_id)
      return product ? { key: compareItemKey(item), item, product } : null
    })
    .filter((column): column is CompareColumn => column !== null)
)

// โมเดลที่คอลัมน์นี้แสดง (ยังไม่เลือก = โมเดลแรก)
function effectiveModel(column: CompareColumn): ProductModel | null {
  const models = column.product.product_model
  if (!models || models.length === 0) return null
  if (column.item.model_id != null) {
    return models.find((model) => model.model_id === column.item.model_id) ?? models[0]
  }
  return models[0]
}

// ราคาของคอลัมน์ (ราคาโมเดล ไม่มีใช้ราคาสินค้า)
function effectivePrice(column: CompareColumn): number | string | null {
  return effectiveModel(column)?.product_price ?? column.product.product_price
}

// หน่วยราคา: หมวด Software "/ เดือน" ที่เหลือ "/ ชิ้น"
const SUBSCRIPTION_CATEGORY_ID = 'PT-00006'
function priceUnitLabel(column: CompareColumn): string {
  return langs(column.product.category?.category_id === SUBSCRIPTION_CATEGORY_ID ? 'priceUnitSubscriptionLabel' : 'priceUnitLabel')
}

onMounted(() => {
  const idsParam = String(route.query.ids ?? '')
  if (idsParam && compareStore.items.length === 0) {
    const pairs = idsParam
      .split(',')
      .map((token) => {
        const [idPart, modelPart] = token.split(':')
        return { productId: idPart, modelId: modelPart || undefined }
      })
      .filter((pair) => pair.productId)
    if (pairs.length >= 2) {
      const uniqueIds = Array.from(new Set(pairs.map((pair) => pair.productId)))
      compareAPI
        .getProducts(uniqueIds)
        .then((res) => {
          // URL อาจเป็น slug หรือ itm_code — ทำ map ค้นได้ทั้งคู่
          const fetchedById = new Map<string, ProductDetail>()
          for (const product of (res.data.products ?? []) as ProductDetail[]) {
            fetchedById.set(product.product_id, product)
            if (product.slug) fetchedById.set(product.slug, product)
          }
          const items: CompareProduct[] = pairs
            .map(({ productId, modelId }): CompareProduct | null => {
              const product = fetchedById.get(productId)
              if (!product) return null
              const model = modelId != null ? product.product_model?.find((v) => v.model_id === modelId) : null
              return {
                // เก็บเป็น itm_code เสมอ
                product_id: product.product_id,
                product_name: product.product_name,
                product_image: product.product_image ?? undefined,
                product_price: Number(model?.product_price ?? product.product_price) || 0,
                model_id: model ? model.model_id : undefined,
              }
            })
            .filter((item): item is CompareProduct => item !== null)
          // กันช่องซ้ำเป๊ะจากลิงก์แชร์ที่ถูกแก้มือ
          const seen = new Set<string>()
          const uniqueItems = items.filter((item) => {
            const key = compareItemKey(item)
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          if (uniqueItems.length >= 2) compareStore.setItems(uniqueItems)
        })
        .catch(() => {})
    }
  }
})

// คำขอล่าสุดชนะ
let fetchProductsRequestId = 0

// โหลดข้อมูลเต็มของสินค้าในตะกร้า
function fetchProducts() {
  const thisRequestId = ++fetchProductsRequestId
  const uniqueIds = Array.from(new Set(compareStore.items.map((item) => item.product_id)))
  if (uniqueIds.length === 0) {
    products.value = []
    return
  }
  loading.value = true
  compareAPI
    .getProducts(uniqueIds)
    .then((res) => {
      if (thisRequestId !== fetchProductsRequestId) return
      products.value = res.data.products ?? []
    })
    .catch(() => {
      if (thisRequestId === fetchProductsRequestId) error.value = langs('compareLoadError')
    })
    .finally(() => {
      if (thisRequestId === fetchProductsRequestId) loading.value = false
    })
}

onMounted(fetchProducts)
// โหลดใหม่เฉพาะเมื่อชุดสินค้าเปลี่ยน (เพิ่มโมเดลของสินค้าเดิมไม่ต้องโหลด)
watch(
  () => Array.from(new Set(compareStore.items.map((item) => item.product_id))).sort().join(','),
  fetchProducts
)

// บันทึกการเปรียบเทียบครั้งเดียวต่อการเข้าหน้า (≥ 2 ชิ้น)
watch(
  () => compareStore.items.length,
  (itemCount) => {
    if (loggedThisVisit || itemCount < 2) return
    loggedThisVisit = true
    compareAPI.logCompare(compareStore.items.map((item) => item.product_id)).catch(() => {})
  },
  { immediate: true }
)

// เอาคอลัมน์ออก
function removeColumn(column: CompareColumn) {
  compareStore.removeItemExact(column.item.product_id, column.item.model_id)
}

const pickerMode = ref<string | null>(null)
const allProducts = ref<ProductCardData[]>([])
const pickerLoading = ref(false)
const pickerFilter = ref('')
const pickerCategory = ref('')
const pickerPendingProduct = ref<ProductCardData | null>(null)
const pickerModelChoices = ref<ProductModel[]>([])
const pickerModelLoading = ref(false)

// เปิดป็อปอัปเพิ่ม/เปลี่ยนสินค้า
function openPicker(mode: string) {
  pickerMode.value = mode
  pickerFilter.value = ''
  pickerCategory.value = ''
  pickerPendingProduct.value = null
  pickerModelChoices.value = []
  if (allProducts.value.length === 0 && !pickerLoading.value) {
    pickerLoading.value = true
    productAPI
      .list({ limit: 100, sort: 'price_asc' })
      .then((res) => { allProducts.value = res.data.products ?? [] })
      .catch(() => { allProducts.value = [] })
      .finally(() => { pickerLoading.value = false })
  }
}

// Esc ปิดป็อปอัป
function handlePickerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closePicker()
}

watch(pickerMode, (mode) => {
  if (mode !== null) window.addEventListener('keydown', handlePickerKeydown)
  else window.removeEventListener('keydown', handlePickerKeydown)
})

function closePicker() {
  pickerMode.value = null
  pickerFilter.value = ''
  pickerCategory.value = ''
  pickerPendingProduct.value = null
  pickerModelChoices.value = []
}

// สินค้านี้ยังมีโมเดลที่ยังไม่อยู่ในตารางไหม
function hasAddableOption(result: ProductCardData) {
  if (!result.has_models) return !compareStore.isInCompare(result.product_id)
  const modelIds = result.model_ids ?? []
  if (modelIds.length === 0) return !compareStore.isInCompare(result.product_id)
  return modelIds.some((modelId) => !compareStore.isExactInCompare(result.product_id, modelId))
}

// หมวดใน popup จากสินค้าที่โหลดมาแล้ว (ไม่กรองด้วย hasAddableOption — ไม่ให้ตัวเลือกหายกลางคัน)
const pickerCategories = computed(() =>
  [...new Set(allProducts.value.map((product) => product.category_name).filter((name): name is string => !!name))].sort(
    (a, b) => a.localeCompare(b, 'th')
  )
)

// กรองสินค้าใน popup ด้วยหมวดและชื่อ
const filteredPickerProducts = computed(() => {
  const query = pickerFilter.value.trim().toLowerCase()
  const category = pickerCategory.value
  let base = allProducts.value.filter(hasAddableOption)
  if (category) base = base.filter((product) => product.category_name === category)
  if (!query) return base
  return base.filter((product) => product.product_name.toLowerCase().includes(query))
})

// คอลัมน์ที่กำลังจะถูกเปลี่ยน (โหมดเปลี่ยนสินค้า)
const pickerTargetColumn = computed(() =>
  pickerMode.value && pickerMode.value !== 'add'
    ? columns.value.find((column) => column.key === pickerMode.value) ?? null
    : null
)

// เลือกสินค้าใน popup — หลายโมเดลไปขั้นเลือกโมเดลก่อน
async function selectPickerProduct(result: ProductCardData) {
  if (pickerMode.value === null) return
  if (!result.has_models) {
    finalizePickerSelection(result, null, Number(result.product_price) || 0)
    return
  }
  pickerModelLoading.value = true
  try {
    const res = await productAPI.getById(result.product_id)
    const models: ProductModel[] = res.data.product_model ?? []
    if (models.length <= 1) {
      finalizePickerSelection(result, models[0]?.model_id ?? null, Number(models[0]?.product_price ?? result.product_price) || 0)
      return
    }
    pickerPendingProduct.value = result
    pickerModelChoices.value = models
  } catch {
    finalizePickerSelection(result, null, Number(result.product_price) || 0)
  } finally {
    pickerModelLoading.value = false
  }
}

function choosePickerModel(model: ProductModel) {
  if (!pickerPendingProduct.value) return
  finalizePickerSelection(pickerPendingProduct.value, model.model_id, Number(model.product_price) || 0)
}

function backToPickerBrowse() {
  pickerPendingProduct.value = null
  pickerModelChoices.value = []
}

// เพิ่มหรือแทนที่ในตาราง แล้วปิด popup
function finalizePickerSelection(result: ProductCardData, modelId: string | null, price: number) {
  const newItem: CompareProduct = {
    product_id: result.product_id,
    product_name: result.product_name,
    product_image: result.product_image ?? undefined,
    product_price: price,
    model_id: modelId ?? undefined,
  }
  keepTableScrollPosition()
  if (pickerMode.value === 'add') {
    // ไม่ขยายขนาดตารางให้เอง — ผู้ใช้เพิ่งเลือกขนาดเองในหน้านี้
    compareStore.addItem(newItem, { grow: false })
    closePicker()
    return
  }
  if (compareStore.isExactInCompare(newItem.product_id, newItem.model_id)) {
    toast.error(langs('swapDuplicateError'))
    return
  }
  const targetColumn = pickerTargetColumn.value
  if (!targetColumn) { closePicker(); return }
  compareStore.replaceItem(targetColumn.item.product_id, targetColumn.item.model_id, newItem)
  closePicker()
}

// คัดลอกลิงก์แชร์ (ใช้ slug)
function shareLink() {
  const ids = compareStore.items
    .map((item) => {
      const product = productById.value.get(item.product_id)
      const slug = product ? productSlug(product) : item.product_id
      return item.model_id != null ? `${slug}:${item.model_id}` : slug
    })
    .join(',')
  const url = `${window.location.origin}/compare?ids=${ids}`
  router.replace({ query: { ids } })
  copyLink(url, langs('shareCompareLinkCopied'))
}

// ชื่อคุณสมบัติทั้งหมดที่เป็นแถวในตาราง (รวมของโมเดลที่เลือก)
const attributeNames = computed(() =>
  Array.from(new Set(columns.value.flatMap((column) => {
    const baseNames = column.product.product_attribute_value?.map((attrValue) => attrValue.attribute.attribute_name) ?? []
    const modelNames = effectiveModel(column)?.product_attribute_value?.map((attrValue) => attrValue.attribute.attribute_name) ?? []
    return [...baseNames, ...modelNames]
  })))
)
// อ่านตัวเลขตัวแรกจากค่าสเปค ("2K" = 2000)
function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const str = String(value)
  
  const kMatch = str.match(/(\d+(?:\.\d+)?)\s*[kK](?!\w)/)
  if (kMatch) return Number(kMatch[1]) * 1000

  const match = str.match(/-?\d+(\.\d+)?/)
  return match ? Number(match[0]) : null
}

// ตัวเลขจากค่าหลายรายการ: แยกรายการก่อนแล้วเอาเลขตัวแรกของแต่ละรายการ (ไม่ให้ W x H ในวงเล็บปน)
function parseAllNumbers(value: string | number | null | undefined): number[] {
  if (value === null || value === undefined) return []
  const segments = String(value).split(/,|\/|และ|\n/)
  const numbers: number[] = []
  for (const segment of segments) {
    const parsed = parseNumber(segment)
    if (parsed !== null) numbers.push(parsed)
  }
  return numbers
}

// ค่าคุณสมบัติของคอลัมน์ (ค่าเฉพาะโมเดลทับค่าร่วม)
function findAttrValue(column: CompareColumn, attributeName: string) {
  const modelValue = effectiveModel(column)?.product_attribute_value?.find(
    (attrValue) => attrValue.attribute.attribute_name === attributeName
  )?.value
  if (modelValue !== undefined) return modelValue
  return column.product.product_attribute_value?.find((attrValue) => attrValue.attribute.attribute_name === attributeName)?.value ?? null
}

const SORT_NONE = ''
const SORT_PRICE = '__price__'
const sortField = ref<string>(SORT_NONE)
const sortDirection = ref<'asc' | 'desc'>('asc')

// ทิศเรียงเริ่มต้น (ราคา = น้อยไปมาก · สเปค = มากไปน้อย)
function defaultDirectionFor(field: string): 'asc' | 'desc' {
  return field === SORT_PRICE ? 'asc' : 'desc'
}

// เปิดเรียงตามฟิลด์นี้ พร้อมติ๊กให้ตรงกัน
function setSortFieldOn(field: string, direction: 'asc' | 'desc' = defaultDirectionFor(field)) {
  sortField.value = field
  sortDirection.value = direction
  if (field !== SORT_PRICE && !selectedFeatures.value.includes(field)) {
    selectedFeatures.value = [...selectedFeatures.value, field]
  }
}

// ปิดเรียงตามฟิลด์นี้
function setSortFieldOff(field: string) {
  if (sortField.value === field) sortField.value = SORT_NONE
}

// เปิด/ปิดเรียงตามราคา
function togglePriceSortOnOff() {
  if (sortField.value === SORT_PRICE) setSortFieldOff(SORT_PRICE)
  else setSortFieldOn(SORT_PRICE)
}

// ค่าที่ dropdown เรียงของฟิลด์นี้แสดง
function sortValueFor(field: string): '' | 'asc' | 'desc' {
  return sortField.value === field ? sortDirection.value : SORT_NONE
}

// เลือกทิศใน dropdown เรียงของแต่ละแถว
function handleSortSelect(field: string, event: Event) {
  const value = (event.target as HTMLSelectElement).value as '' | 'asc' | 'desc'
  if (value === SORT_NONE) setSortFieldOff(field)
  else setSortFieldOn(field, value)
}

// สเปคที่เรียงได้ (เป็นตัวเลขอย่างน้อย 2 คอลัมน์)
const computableAttributeNames = computed(() =>
  attributeNames.value.filter((name) => {
    const numericCount = columns.value.filter((column) => parseNumber(findAttrValue(column, name)) !== null).length
    return numericCount >= 2
  })
)

// สเปคที่ใช้เรียงหายไป = เลิกเรียง
watch(computableAttributeNames, (availableNames) => {
  if (sortField.value === SORT_NONE || sortField.value === SORT_PRICE) return
  if (!availableNames.includes(sortField.value)) sortField.value = SORT_NONE
})

// เทียบคอลัมน์ตามฟิลด์ที่เรียง (ไม่มีค่าไปท้ายเสมอ)
function compareBySortField(columnA: CompareColumn, columnB: CompareColumn): number {
  if (sortField.value === SORT_NONE) return 0
  const sign = sortDirection.value === 'asc' ? 1 : -1
  if (sortField.value === SORT_PRICE) {
    // ราคา 0 = ติดต่อสอบถาม ไปท้ายทั้งสองทิศ
    const priceA = parseNumber(effectivePrice(columnA)) || null
    const priceB = parseNumber(effectivePrice(columnB)) || null
    if (priceA === null && priceB === null) return 0
    if (priceA === null) return 1
    if (priceB === null) return -1
    return (priceA - priceB) * sign
  }
  // เทียบตัวเลขมากสุดของแต่ละคอลัมน์ เท่ากันแล้วคอลัมน์ที่มีหลายค่ากว่าชนะ
  const numbersA = parseAllNumbers(findAttrValue(columnA, sortField.value))
  const numbersB = parseAllNumbers(findAttrValue(columnB, sortField.value))
  if (numbersA.length === 0 && numbersB.length === 0) return 0
  if (numbersA.length === 0) return 1
  if (numbersB.length === 0) return -1
  const maxA = Math.max(...numbersA)
  const maxB = Math.max(...numbersB)
  if (maxA !== maxB) return (maxA - maxB) * sign
  return (numbersA.length - numbersB.length) * sign
}

const NEGATIVE_FEATURE_VALUES = new Set(['', '-', 'ไม่มี', 'ไม่', 'no', 'false', '0', 'x', '✗'])

// คอลัมน์นี้มีคุณสมบัตินี้ไหม (ค่าไม่ว่างและไม่ใช่ "ไม่มี")
function hasFeature(column: CompareColumn, attributeName: string): boolean {
  const raw = findAttrValue(column, attributeName)
  if (raw === null) return false
  return !NEGATIVE_FEATURE_VALUES.has(String(raw).trim().toLowerCase())
}

const selectedFeatures = ref<string[]>([])
// มือถือเริ่มแบบย่อ
const featuresOpen = ref(typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches)

function isFeatureSelected(name: string) {
  return selectedFeatures.value.includes(name)
}

// ติ๊ก/ถอนติ๊กคุณสมบัติ (คำนวณได้ = ตั้งเป็นตัวเรียงให้)
function toggleFeature(name: string) {
  const turningOn = !isFeatureSelected(name)
  selectedFeatures.value = turningOn
    ? [...selectedFeatures.value, name]
    : selectedFeatures.value.filter((selected) => selected !== name)
  if (turningOn && computableAttributeNames.value.includes(name)) {
    setSortFieldOn(name)
  } else if (!turningOn) {
    setSortFieldOff(name)
  }
}

// ย่อขนาดตารางจนช่องไม่พอ ต้องถามยืนยันก่อน
const pendingSizeChange = ref<number | null>(null)

const sizeShrinkRemovedCount = computed(() =>
  pendingSizeChange.value === null ? 0 : Math.max(0, compareStore.items.length - pendingSizeChange.value)
)

// ช่องที่ผู้ใช้ติ๊กว่าจะเอาออก (เลือกเอง ไม่ตัดท้ายอัตโนมัติ)
const shrinkRemoveKeys = ref<string[]>([])

function toggleShrinkRemove(key: string) {
  shrinkRemoveKeys.value = shrinkRemoveKeys.value.includes(key)
    ? shrinkRemoveKeys.value.filter((k) => k !== key)
    : [...shrinkRemoveKeys.value, key]
}

// ต้องติ๊กครบพอดีถึงยืนยันได้
const shrinkSelectionComplete = computed(
  () => shrinkRemoveKeys.value.length === sizeShrinkRemovedCount.value
)

// กดปุ่มขนาดตาราง — ย่อจนล้นให้เปิดป็อปอัปเลือกสินค้าที่จะเอาออก
function requestCompareSize(size: number, event: MouseEvent) {
  if (size === compareStore.capacity) return
  if (size < compareStore.items.length) {
    sizeDialogTrigger = event.currentTarget as HTMLElement
    // ติ๊กท้ายรายการไว้ล่วงหน้า กดยืนยันได้ทันที
    shrinkRemoveKeys.value = compareStore.items.slice(size).map(compareItemKey)
    pendingSizeChange.value = size
    return
  }
  applyCompareSize(size)
}

function applyCompareSize(size: number) {
  compareStore.setCapacity(size)
  pendingSizeChange.value = null
  toast.success(langs('compareSizeChanged', { n: size }))
}

// ยืนยันย่อขนาด
function confirmSizeChange() {
  if (pendingSizeChange.value === null || !shrinkSelectionComplete.value) return
  // เอาที่ติ๊กออกก่อนค่อยย่อ ไม่งั้น setCapacity() ตัดท้ายรายการเอง
  for (const key of shrinkRemoveKeys.value) {
    const target = compareStore.items.find((item) => compareItemKey(item) === key)
    if (target) compareStore.removeItemExact(target.product_id, target.model_id)
  }
  applyCompareSize(pendingSizeChange.value)
}

function cancelSizeChange() {
  pendingSizeChange.value = null
  shrinkRemoveKeys.value = []
}

const sizeDialogEl = ref<HTMLElement | null>(null)
const sizeCancelButtonEl = ref<HTMLButtonElement | null>(null)
// ปุ่มขนาดที่เปิดป็อปอัป — คืนโฟกัสตอนปิด
let sizeDialogTrigger: HTMLElement | null = null

// Esc ปิด + ขัง Tab ไว้ในป็อปอัป
function handleSizeDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    cancelSizeChange()
    return
  }
  if (event.key !== 'Tab' || !sizeDialogEl.value) return
  const focusables = Array.from(sizeDialogEl.value.querySelectorAll<HTMLElement>('button'))
  if (focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (event.shiftKey && (active === first || !sizeDialogEl.value.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(pendingSizeChange, (pending) => {
  if (pending !== null) {
    window.addEventListener('keydown', handleSizeDialogKeydown)
    // โฟกัส "ยกเลิก" ก่อน กด Enter พลาดจะไม่เสียของ
    nextTick(() => sizeCancelButtonEl.value?.focus())
  } else {
    window.removeEventListener('keydown', handleSizeDialogKeydown)
    sizeDialogTrigger?.focus()
    sizeDialogTrigger = null
  }
})

// ล้างตะกร้าทั้งหมด
function clearCompare() {
  compareStore.clearAll()
}

// ล้างคุณสมบัติที่ติ๊กและเลิกเรียง (ไม่ลบสินค้า)
function clearAllFeatures() {
  selectedFeatures.value = []
  setSortFieldOff(sortField.value)
}

// คุณสมบัติที่ติ๊กหายไปจากตาราง = ถอนติ๊ก
watch(attributeNames, (availableAttrNames) => {
  const kept = selectedFeatures.value.filter((name) => availableAttrNames.includes(name))
  if (kept.length !== selectedFeatures.value.length) selectedFeatures.value = kept
})

// จำนวนคุณสมบัติที่ติ๊กไว้ที่แต่ละคอลัมน์ตรง
const featureMatchByKey = computed<Map<string, number> | null>(() => {
  if (selectedFeatures.value.length === 0) return null
  const matchByKey = new Map<string, number>()
  columns.value.forEach((column) => {
    const count = selectedFeatures.value.filter((name) => hasFeature(column, name)).length
    matchByKey.set(column.key, count)
  })
  return matchByKey
})

// คอลัมน์เรียงแล้ว: ตรงคุณสมบัติที่ติ๊กมากสุดก่อน แล้วตามฟิลด์ที่เรียง
const sortedColumns = computed(() => {
  const entries = columns.value.map((column, originalIndex) => ({ column, originalIndex }))
  entries.sort((entryA, entryB) => {
    if (featureMatchByKey.value) {
      const countA = featureMatchByKey.value.get(entryA.column.key) ?? 0
      const countB = featureMatchByKey.value.get(entryB.column.key) ?? 0
      if (countA !== countB) return countB - countA
    }
    const fieldDiff = compareBySortField(entryA.column, entryB.column)
    if (fieldDiff !== 0) return fieldDiff
    return entryA.originalIndex - entryB.originalIndex
  })
  return entries.map((entry) => entry.column)
})

// ป้าย "แนะนำ" เฉพาะเมื่อคอลัมน์แรกชนะคอลัมน์ถัดไปจริง
const highlightIndex = computed(() => {
  const [first, second] = sortedColumns.value
  if (!first || !second) return -1
  if (featureMatchByKey.value) {
    const matchFirst = featureMatchByKey.value.get(first.key) ?? 0
    const matchSecond = featureMatchByKey.value.get(second.key) ?? 0
    if (matchFirst > matchSecond) return 0
  }
  if (sortField.value !== SORT_NONE && compareBySortField(first, second) < 0) return 0
  return -1
})

const onlyShowDifferences = ref(false)

// ค่าในแถวต่างกันไหม
function valuesDiffer(values: (string | number | null | undefined)[]): boolean {
  if (values.length < 2) return false
  const normalized = values.map((value) => (value === null || value === undefined || value === '' ? null : String(value).replace(/\s+/g, ' ').trim()))
  return normalized.some((value) => value !== normalized[0])
}

const priceDiffers = computed(() => valuesDiffer(sortedColumns.value.map((column) => effectivePrice(column))))
const categoryDiffers = computed(() => valuesDiffer(sortedColumns.value.map((column) => column.product.category?.category_name ?? null)))
const attributeDiffers = computed(() => {
  const map = new Map<string, boolean>()
  for (const name of attributeNames.value) {
    map.set(name, valuesDiffer(sortedColumns.value.map((column) => findAttrValue(column, name))))
  }
  return map
})

// ซ่อนหัวข้อที่ค่าเหมือนกันหมดในกล่องคุณสมบัติ (ยกเว้นที่ติ๊กอยู่)
const visibleFeatureNames = computed(() =>
  attributeNames.value.filter(
    (name) => !onlyShowDifferences.value || attributeDiffers.value.get(name) || isFeatureSelected(name)
  )
)

const showPriceFeature = computed(
  () => !onlyShowDifferences.value || priceDiffers.value || sortField.value === SORT_PRICE
)

// ไม่นับราคา เพราะราคาอยู่ในหัวคอลัมน์
const anyRowDiffers = computed(
  () => categoryDiffers.value || Array.from(attributeDiffers.value.values()).some(Boolean)
)

// ช่องว่างที่ยังเพิ่มได้ตามขนาดตาราง
const emptySlotCount = computed(() => Math.max(0, compareStore.capacity - columns.value.length))

const totalColumnCount = computed(() => 1 + sortedColumns.value.length + emptySlotCount.value)

// เลือกโมเดลที่อีกคอลัมน์ของสินค้าเดียวกันถืออยู่ = สลับกัน
function onModelSelect(column: CompareColumn, modelId: string) {
  const model = column.product.product_model?.find((v) => v.model_id === modelId)
  if (!model) return
  const currentModelId = effectiveModel(column)?.model_id ?? null
  if (currentModelId === modelId) return
  keepTableScrollPosition()

  // เทียบด้วยโมเดลที่แสดงจริง (ช่องที่ยังไม่เลือกเก็บ null แต่แสดงโมเดลแรก)
  const conflict = columns.value.find(
    (other) =>
      other.key !== column.key &&
      other.item.product_id === column.item.product_id &&
      effectiveModel(other)?.model_id === modelId
  )

  if (conflict) {
    const currentModel = column.product.product_model?.find((v) => v.model_id === currentModelId)
    compareStore.swapItemModels(
      column.item.product_id,
      column.item.model_id,
      conflict.item.model_id,
      Number(currentModel?.product_price ?? column.product.product_price) || 0,
      Number(model.product_price) || 0
    )
    return
  }

  compareStore.setItemModel(column.item.product_id, column.item.model_id, modelId, Number(model.product_price) || 0)
}

const tableWrapperEl = ref<HTMLElement | null>(null)
const tableEl = ref<HTMLTableElement | null>(null)

// จำตำแหน่งปัดแนวนอนไว้ เปลี่ยน/เพิ่มสินค้าแล้วตารางถูกสร้างใหม่จะคืนให้
let pendingTableScrollLeft: number | null = null

function keepTableScrollPosition() {
  if (!tableWrapperEl.value) return
  pendingTableScrollLeft = tableWrapperEl.value.scrollLeft
  // setTimeout ไม่ใช่ nextTick — ต้องรอ watcher สั่งโหลดก่อน (มีการโหลด watch(loading) เป็นคนคืนค่า)
  setTimeout(restoreTableScrollPosition, 0)
}

// คืนตำแหน่งปัดแนวนอนที่จำไว้
function restoreTableScrollPosition() {
  if (pendingTableScrollLeft === null || loading.value) return
  const wrapper = tableWrapperEl.value
  if (!wrapper) return
  const left = pendingTableScrollLeft
  pendingTableScrollLeft = null
  wrapper.scrollLeft = left
  // เผื่อ scroll-snap จับตำแหน่งใหม่หลังเฟรมแรก
  requestAnimationFrame(() => { wrapper.scrollLeft = left })
}

watch(loading, (isLoading) => {
  if (!isLoading) nextTick(restoreTableScrollPosition)
})
const filterPanelEl = ref<HTMLElement | null>(null)
const sentinelEl = ref<HTMLElement | null>(null)
const cloneHeaderVisible = ref(false)
const cloneScrollLeft = ref(0)
const cloneTopPx = ref(0)
const filterPanelStuck = ref(false)

const labelColumnWidth = ref(160)
const columnWidthByKey = ref<Map<string, number>>(new Map())
const addSlotColumnWidth = ref(220)

// ให้คอลัมน์หัวจำลองกว้างเท่าตารางจริง
function syncCloneColumnWidths() {
  const headerCells = tableEl.value?.querySelector('thead tr')?.children
  if (!headerCells || headerCells.length === 0) return
  const ths = Array.from(headerCells) as HTMLElement[]
  labelColumnWidth.value = ths[0].getBoundingClientRect().width
  const widthByKey = new Map<string, number>()
  sortedColumns.value.forEach((column, index) => {
    const th = ths[index + 1]
    if (th) widthByKey.set(column.key, th.getBoundingClientRect().width)
  })
  columnWidthByKey.value = widthByKey
  const lastTh = ths[ths.length - 1]
  if (columns.value.length < compareStore.capacity && lastTh) {
    addSlotColumnWidth.value = lastTh.getBoundingClientRect().width
  }
}

// ระยะจากบนจอที่หัวจำลองต้องเริ่ม (header + แผงตัวกรองที่ตรึงบนจอ lg)
function stickyOffsetPx(): number {
  const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-header-h')) || 0
  // แผงตัวกรองตรึงเฉพาะจอ lg
  const panel = filterPanelEl.value
  // ใช้ความสูงทศนิยม — offsetHeight ปัดเศษแล้วเห็นช่องตอนจอสเกล 125%
  const filterH = panel && getComputedStyle(panel).position === 'sticky' ? panel.getBoundingClientRect().height : 0
  return headerH + filterH
}

let scrollFrame = 0
// แสดง/ซ่อนหัวตารางจำลองตามการเลื่อน
function handleStickyScroll() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const offset = stickyOffsetPx()
    // แผงตรึงอยู่บนสุดแล้ว ตัดขอบมนให้ต่อกับหัวจำลอง
    const panel = filterPanelEl.value
    const panelIsSticky = !!panel && getComputedStyle(panel).position === 'sticky'
    const panelRect = panel?.getBoundingClientRect()
    filterPanelStuck.value = panelIsSticky && panelRect!.top <= offset - panelRect!.height + 0.5
    // ซ้อนใต้แผง 1px กันรอยต่อจากการปัดพิกเซล
    cloneTopPx.value = panelIsSticky ? offset - 1 : offset
    if (sentinelEl.value) {
      cloneHeaderVisible.value = sentinelEl.value.getBoundingClientRect().top <= offset
    }
    if (tableWrapperEl.value) {
      cloneScrollLeft.value = tableWrapperEl.value.scrollLeft
    }
    syncCloneColumnWidths()
  })
}

// element ถูก v-if สร้างใหม่ได้ ต้องผูก scroll ใหม่
watch(tableWrapperEl, (el, previousEl) => {
  previousEl?.removeEventListener('scroll', handleStickyScroll)
  el?.addEventListener('scroll', handleStickyScroll, { passive: true })
  handleStickyScroll()
})
let filterResizeObserver: ResizeObserver | null = null
watch(filterPanelEl, (el) => {
  filterResizeObserver?.disconnect()
  if (el) {
    filterResizeObserver = new ResizeObserver(handleStickyScroll)
    filterResizeObserver.observe(el)
  }
  handleStickyScroll()
})
watch(featuresOpen, () => nextTick(handleStickyScroll))

// ความกว้างคอลัมน์มือถือ/แท็บเล็ตวัดจากกรอบตารางจริง — LINE บน iPhone ให้ 100vw ผิด
const tableWrapperWidth = ref(0)
let wrapperResizeObserver: ResizeObserver | null = null
watch(tableWrapperEl, (el) => {
  wrapperResizeObserver?.disconnect()
  if (el) {
    wrapperResizeObserver = new ResizeObserver(() => { tableWrapperWidth.value = el.clientWidth })
    wrapperResizeObserver.observe(el)
    tableWrapperWidth.value = el.clientWidth
  }
})
// ความกว้างช่องตามขนาดจอ (กรอบตาราง = จอ − 34px)
const slotWidthStyle = computed(() => {
  const width = tableWrapperWidth.value
  if (!width || width + 34 >= 1024) return undefined
  const visibleColumns = width + 34 < 640 ? 2 : compareStore.capacity
  return { width: `${width / visibleColumns}px` }
})
const rowLabelWidthStyle = computed(() => (tableWrapperWidth.value ? { width: `${tableWrapperWidth.value}px` } : undefined))
// ตั้งความกว้างตารางเอง + สร้างตารางใหม่ทุกครั้งที่เปลี่ยนขนาด — LINE บน iPhone ไม่คำนวณคอลัมน์ใหม่เอง
const tableWidthStyle = computed(() => {
  const width = tableWrapperWidth.value
  if (!width || width + 34 >= 1024) return undefined
  const visibleColumns = width + 34 < 640 ? 2 : compareStore.capacity
  const slots = sortedColumns.value.length + emptySlotCount.value
  return { width: `${(width / visibleColumns) * slots}px` }
})
watch(() => compareStore.capacity, () => nextTick(() => {
  const wrapper = tableWrapperEl.value
  if (!wrapper) return
  wrapper.scrollLeft = Math.min(wrapper.scrollLeft, Math.max(0, wrapper.scrollWidth - wrapper.clientWidth))
  syncCloneColumnWidths()
}))

// ความกว้างตารางเปลี่ยน (รูปโหลด) → sync หัวจำลอง
let tableResizeObserver: ResizeObserver | null = null
watch(tableEl, (el) => {
  tableResizeObserver?.disconnect()
  if (el) {
    tableResizeObserver = new ResizeObserver(syncCloneColumnWidths)
    tableResizeObserver.observe(el)
  }
  syncCloneColumnWidths()
})
// ลำดับคอลัมน์เปลี่ยน → sync หัวจำลอง
watch(
  () => sortedColumns.value.map((column) => column.key).join(','),
  () => nextTick(syncCloneColumnWidths)
)

onMounted(() => {
  window.addEventListener('scroll', handleStickyScroll, { passive: true })
  window.addEventListener('resize', handleStickyScroll)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleStickyScroll)
  window.removeEventListener('resize', handleStickyScroll)
  tableWrapperEl.value?.removeEventListener('scroll', handleStickyScroll)
  tableResizeObserver?.disconnect()
  filterResizeObserver?.disconnect()
  wrapperResizeObserver?.disconnect()
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  // เปลี่ยนหน้าตอนป็อปอัปเปิดอยู่ — ถอด listener เอง
  window.removeEventListener('keydown', handlePickerKeydown)
  window.removeEventListener('keydown', handleSizeDialogKeydown)
})
</script>

<template>
  <h1 class="sr-only">{{ langs('navCompare') }}</h1>

  <div class="space-y-4">
    <div
      v-if="pickerMode !== null"
      class="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4"
      @click="closePicker"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-heading"
        class="bg-white rounded-2xl shadow-xl w-full max-w-md p-4"
        @click.stop
      >
        <div class="flex items-center justify-between mb-1">
          <p id="picker-heading" class="text-sm font-semibold text-navy-900 flex items-center gap-1">
            <button v-if="pickerPendingProduct" type="button" @click="backToPickerBrowse" :aria-label="langs('chooseModelBack')" class="text-gray-500 hover:text-gray-600">
              <ChevronLeft aria-hidden="true" class="w-4 h-4" />
            </button>
            {{ pickerPendingProduct ? langs('chooseModelHeading') : (pickerTargetColumn ? langs('swapProductHeading') : langs('addProductHeading')) }}
          </p>
          <button type="button" @click="closePicker" :aria-label="langs('closeButton')" class="text-gray-500 hover:text-gray-600">
            <X aria-hidden="true" class="w-4 h-4" />
          </button>
        </div>
        <p v-if="pickerTargetColumn && !pickerPendingProduct" class="text-xs text-gray-500 mb-2 truncate">{{ pickerTargetColumn.product.product_name }}</p>

        <template v-if="pickerPendingProduct">
          <p class="text-xs text-gray-500 mb-2 truncate">{{ pickerPendingProduct.product_name }}</p>
          <ul class="max-h-96 overflow-y-auto divide-y divide-gray-100">
            <li v-for="model in pickerModelChoices" :key="model.model_id">
              <button
                type="button"
                @click="choosePickerModel(model)"
                :disabled="compareStore.isExactInCompare(pickerPendingProduct.product_id, model.model_id)"
                class="w-full flex items-center justify-between gap-3 px-1.5 py-2 text-left text-sm rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <span class="truncate flex-1 text-navy-900">{{ model.model_name }}</span>
                <span class="text-xs text-brand-700 font-semibold shrink-0">
                  {{ model.product_price ? `฿${Number(model.product_price).toLocaleString()}` : '-' }}
                </span>
              </button>
            </li>
          </ul>
        </template>

        <template v-else>
          <div class="flex gap-2 mb-2">
            <input
              v-model="pickerFilter"
              type="text"
              :placeholder="langs('searchPlaceholder')"
              autofocus
              class="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <select
              v-if="pickerCategories.length > 1"
              v-model="pickerCategory"
              :aria-label="langs('filterAllCategories')"
              class="shrink-0 max-w-[45%] border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">{{ langs('filterAllCategories') }}</option>
              <option v-for="name in pickerCategories" :key="name" :value="name">{{ name }}</option>
            </select>
          </div>
          <p v-if="pickerLoading || pickerModelLoading" class="text-xs text-gray-500 px-1 py-1">{{ langs('loading') }}</p>
          <ul v-else-if="filteredPickerProducts.length > 0" class="max-h-96 overflow-y-auto divide-y divide-gray-100">
            <li v-for="result in filteredPickerProducts" :key="result.product_id">
              <button
                type="button"
                @click="selectPickerProduct(result)"
                class="w-full flex items-center gap-3 px-1.5 py-2 text-left text-sm rounded-lg hover:bg-gray-50"
              >
                <img loading="lazy" decoding="async"
                  v-if="result.product_image"
                  :src="resolveImageUrl(result.product_image)"
                  alt=""
                  class="w-10 h-10 rounded-lg object-cover shrink-0"
                />
                <ProductAvatar v-else :name="result.product_name" :size="40" class-name="rounded-lg shrink-0" />
                <span class="truncate flex-1 text-navy-900">{{ result.product_name }}</span>
                <span class="text-xs text-brand-700 font-semibold shrink-0">
                  {{ result.product_price ? `฿${Number(result.product_price).toLocaleString()}` : '-' }}
                </span>
              </button>
            </li>
          </ul>
          <p v-else class="text-xs text-gray-500 px-1 py-1">{{ langs('noResultsFound') }}</p>
        </template>
      </div>
    </div>
    <div
      v-if="pendingSizeChange !== null"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      @click="cancelSizeChange"
    >
      <div
        ref="sizeDialogEl"
        class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="compare-size-dialog-title"
        @click.stop
      >
        <div>
          <h2 id="compare-size-dialog-title" class="text-base font-semibold text-navy-900">{{ langs('compareSizeShrinkTitle') }}</h2>
          <p class="text-sm text-gray-500 mt-1">
            {{ langs('compareSizeShrinkMessage', { current: compareStore.items.length, next: pendingSizeChange, removed: sizeShrinkRemovedCount }) }}
          </p>
        </div>

        <ul class="space-y-1.5 max-h-64 overflow-y-auto -mx-1 px-1">
          <li v-for="item in compareStore.items" :key="compareItemKey(item)">
            <button
              type="button"
              @click="toggleShrinkRemove(compareItemKey(item))"
              :aria-pressed="shrinkRemoveKeys.includes(compareItemKey(item))"
              class="w-full flex items-center gap-2.5 text-left rounded-lg border px-2.5 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
              :class="shrinkRemoveKeys.includes(compareItemKey(item))
                ? 'border-red-300 bg-red-50'
                : 'border-gray-200 hover:bg-gray-50'"
            >
              <span
                aria-hidden="true"
                class="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                :class="shrinkRemoveKeys.includes(compareItemKey(item))
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'border-gray-300 bg-white'"
              >
                <Check v-if="shrinkRemoveKeys.includes(compareItemKey(item))" class="w-3 h-3" />
              </span>
              <img
                v-if="item.product_image"
                :src="resolveImageUrl(item.product_image)"
                alt=""
                class="w-9 h-9 rounded-lg object-cover shrink-0"
              />
              <ProductAvatar v-else :name="item.product_name" :size="36" class-name="rounded-lg shrink-0" />
              <span class="min-w-0 flex-1 text-sm text-navy-900 line-clamp-2">{{ item.product_name }}</span>
              <!-- red-700 / gray-600 ให้ตัว 11px ผ่าน AA -->
              <span
                class="shrink-0 text-[11px] font-medium"
                :class="shrinkRemoveKeys.includes(compareItemKey(item)) ? 'text-red-700' : 'text-gray-600'"
              >
                {{ shrinkRemoveKeys.includes(compareItemKey(item)) ? langs('compareShrinkRemoveTag') : langs('compareShrinkKeepTag') }}
              </span>
            </button>
          </li>
        </ul>

        <p
          role="status"
          class="text-xs tabular-nums"
          :class="shrinkSelectionComplete ? 'text-gray-500' : 'text-red-600 font-medium'"
        >
          {{ langs('compareShrinkSelectedCount', { selected: shrinkRemoveKeys.length, required: sizeShrinkRemovedCount }) }}
        </p>

        <div class="flex justify-end gap-2">
          <button
            ref="sizeCancelButtonEl"
            type="button"
            @click="cancelSizeChange"
            class="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            {{ langs('cancelButton') }}
          </button>
          <button
            type="button"
            @click="confirmSizeChange"
            :disabled="!shrinkSelectionComplete"
            class="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-600"
          >
            {{ langs('compareSizeShrinkConfirm') }}
          </button>
        </div>
      </div>
    </div>

    <div
      ref="filterPanelEl"
      class="bg-white border border-gray-200 shadow-sm px-3 py-2.5 sm:px-4"
      :class="[
        columns.length > 1 && 'lg:sticky lg:top-[var(--sticky-header-h)] lg:z-30',
        filterPanelStuck ? 'rounded-none' : 'rounded-2xl',
      ]"
    >
      <div class="flex items-center flex-wrap gap-x-4 gap-y-2">
        <p v-if="columns.length > 1" class="text-sm font-semibold text-navy-900 flex items-center gap-2 mr-auto">
          {{ langs('featureFilterHeading') }}
          <span v-if="selectedFeatures.length > 0" class="text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2 py-0.5">
            {{ selectedFeatures.length }}
          </span>
        </p>
        <div
          class="flex items-center gap-2"
          :class="{ 'ml-auto': compareStore.items.length < 2 }"
          role="group"
          aria-labelledby="compare-size-label"
        >
          <span id="compare-size-label" class="text-xs font-medium text-gray-600 whitespace-nowrap" :title="langs('compareSizeLabel')">{{ langs('compareSizeCompactLabel') }}</span>
          <div class="inline-flex gap-1 rounded-xl bg-gray-100 p-1">
            <button
              v-for="size in COMPARE_SIZES"
              :key="size"
              type="button"
              :aria-pressed="compareStore.capacity === size"
              :aria-label="langs('compareSizeAria', { n: size })"
              :title="langs('compareSizeAria', { n: size })"
              @click="requestCompareSize(size, $event)"
              class="inline-flex items-center justify-center gap-1.5 min-h-8 min-w-10 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 px-2 rounded-lg text-xs tabular-nums transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2"
              :class="compareStore.capacity === size
                ? 'bg-brand-700 text-white font-bold shadow-sm'
                : 'text-gray-600 font-medium hover:bg-white hover:text-brand-800'"
            >
              <span aria-hidden="true" class="inline-flex gap-0.5 h-3">
                <span v-for="slot in size" :key="slot" class="w-0.5 rounded-sm bg-current"></span>
              </span>
              {{ size }}
            </button>
          </div>
        </div>
        <div v-if="columns.length > 1" class="flex items-center flex-wrap gap-x-2 gap-y-1 max-sm:w-full sm:ml-auto">
          <label class="flex items-center gap-2 min-h-9 [@media(pointer:coarse)]:min-h-11 text-xs text-gray-600 cursor-pointer select-none mr-auto sm:mr-1">
            <span>{{ langs('onlyDifferencesLabel') }}</span>
            <span
              class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-1"
              :class="onlyShowDifferences ? 'bg-brand-600' : 'bg-gray-300'"
            >
              <input v-model="onlyShowDifferences" type="checkbox" class="absolute inset-0 z-10 opacity-0 cursor-pointer" :aria-label="langs('onlyDifferencesLabel')" />
              <span
                class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform motion-reduce:transition-none"
                :class="onlyShowDifferences ? 'translate-x-4' : 'translate-x-1'"
              ></span>
            </span>
          </label>
          <button type="button" @click="shareLink" :aria-label="langs('shareCompareLink')" :title="langs('shareCompareLink')" class="flex items-center justify-center gap-1.5 min-h-9 [@media(pointer:coarse)]:min-h-11 px-2 rounded-lg text-xs font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700">
            <Share2 aria-hidden="true" class="w-4 h-4" />
            {{ langs('shareMenuButton') }}
          </button>

          <button v-if="selectedFeatures.length > 0 || sortField !== SORT_NONE" type="button" @click="clearAllFeatures" class="flex items-center justify-center gap-1.5 min-h-9 [@media(pointer:coarse)]:min-h-11 px-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">{{ langs('clearAllFeaturesButton') }}</button>

          <button type="button" @click="clearCompare" class="flex items-center justify-center gap-1.5 min-h-9 [@media(pointer:coarse)]:min-h-11 px-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
            <Trash2 aria-hidden="true" class="w-4 h-4" />
            {{ langs('clearCompareButton') }}
          </button>

          <button
            type="button"
            @click="featuresOpen = !featuresOpen"
            :aria-expanded="featuresOpen"
            aria-controls="compare-feature-options"
            class="inline-flex items-center gap-1 min-h-9 [@media(pointer:coarse)]:min-h-11 px-2 rounded-lg text-xs font-medium text-brand-700 whitespace-nowrap hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
          >
            {{ featuresOpen ? langs('featuresHide') : langs('featuresShow') }}
            <ChevronDown aria-hidden="true" class="w-4 h-4 transition-transform motion-reduce:transition-none" :class="featuresOpen && 'rotate-180'" />
          </button>

        </div>
      </div>
      <div id="compare-feature-options" v-show="columns.length > 1 && featuresOpen && (visibleFeatureNames.length > 0 || showPriceFeature)" class="mt-2.5 border-t border-gray-100 pt-2.5 space-y-2">
        <p class="text-xs leading-relaxed text-gray-500">{{ langs('featureFilterHint') }}</p>
        <div class="flex flex-wrap gap-1.5">
          <div
            v-if="showPriceFeature"
            class="inline-flex items-stretch min-h-8 [@media(pointer:coarse)]:min-h-11 rounded-lg border overflow-hidden transition-colors"
            :class="sortField === SORT_PRICE
              ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500/20'
              : 'border-gray-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'"
          >
            <button
              type="button"
              :aria-pressed="sortField === SORT_PRICE"
              @click="togglePriceSortOnOff()"
              class="flex items-center gap-1.5 min-w-0 px-2.5 [@media(pointer:coarse)]:px-3 text-[13px] [@media(pointer:coarse)]:text-sm whitespace-nowrap rounded-l-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
              :class="sortField === SORT_PRICE ? 'text-brand-700 font-semibold' : 'text-navy-900'"
            >
              {{ langs('colPrice') }}
            </button>
            <select
              v-if="sortField === SORT_PRICE"
              :value="sortValueFor(SORT_PRICE)"
              @change="handleSortSelect(SORT_PRICE, $event)"
              :aria-label="`${langs('sortByAriaPrefix')} ${langs('colPrice')}`"
              class="shrink-0 self-stretch text-[11px] font-medium border-0 border-l border-brand-200 bg-transparent text-brand-700 pl-2 pr-1 cursor-pointer focus:outline-none focus:ring-0"
            >
              <option :value="SORT_NONE">{{ langs('sortNoneOption') }}</option>
              <option value="asc">{{ langs('sortAscShort') }}</option>
              <option value="desc">{{ langs('sortDescShort') }}</option>
            </select>
          </div>

          <div
            v-for="name in visibleFeatureNames"
            :key="name"
            class="inline-flex items-stretch min-h-8 [@media(pointer:coarse)]:min-h-11 rounded-lg border overflow-hidden transition-colors"
            :class="isFeatureSelected(name)
              ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500/20'
              : 'border-gray-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'"
          >
            <button
              type="button"
              :aria-pressed="isFeatureSelected(name)"
              @click="toggleFeature(name)"
              class="flex items-center gap-1.5 min-w-0 px-2.5 [@media(pointer:coarse)]:px-3 text-[13px] [@media(pointer:coarse)]:text-sm whitespace-nowrap rounded-l-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset"
              :class="isFeatureSelected(name) ? 'text-brand-700' : 'text-navy-900'"
            >
              <span class="truncate">{{ name }}</span>
            </button>
            <select
              v-if="isFeatureSelected(name) && computableAttributeNames.includes(name)"
              :value="sortValueFor(name)"
              @change="handleSortSelect(name, $event)"
              :aria-label="`${langs('sortByAriaPrefix')} ${name}`"
              class="shrink-0 self-stretch text-[11px] font-medium border-0 border-l border-brand-200 bg-transparent text-brand-700 pl-2 pr-1 cursor-pointer focus:outline-none focus:ring-0"
            >
              <option :value="SORT_NONE">{{ langs('sortNoneOption') }}</option>
              <option value="asc">{{ langs('sortAscShort') }}</option>
              <option value="desc">{{ langs('sortDescShort') }}</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- หัวตารางจำลอง: กล่องนอกสูง 0 ให้ลอยทับ ไม่ดันตาราง (ไม่งั้นหาย-โผล่วนไปมา) -->
    <div
      v-if="columns.length > 1"
      class="sticky z-[25] h-0 !mt-0"
      :style="{ top: `${cloneTopPx}px` }"
    >
    <!-- z-[25] ต้องสูงกว่าเซลล์ชื่อหัวข้อที่ตรึงซ้าย (z-20) -->
    <div
      v-if="cloneHeaderVisible"
      class="bg-white max-lg:bg-gray-50/95 max-lg:backdrop-blur-sm border border-gray-100 lg:border-t-0 shadow-sm overflow-hidden"
    >
      <div class="flex">
        <div class="shrink-0 relative z-10 bg-white border-r border-gray-100 max-lg:hidden" :style="{ width: `${labelColumnWidth}px` }"></div>
        <div class="flex-1 min-w-0 overflow-hidden">
        <div class="flex transition-transform" :style="{ transform: `translateX(${-cloneScrollLeft}px)` }">
        <div
          v-for="column in sortedColumns"
          :key="column.key"
          class="shrink-0 border-r border-gray-100 max-lg:border-gray-200 px-3 py-2 max-lg:px-2 flex flex-col gap-1.5 max-lg:text-center"
          :style="{ width: `${columnWidthByKey.get(column.key) ?? 220}px` }"
        >
          <div class="flex items-center gap-2">
            <img loading="lazy" decoding="async"
              v-if="column.product.product_image"
              :src="resolveImageUrl(column.product.product_image)"
              :alt="column.product.product_name"
              class="w-9 h-9 rounded-full object-cover shrink-0 max-lg:hidden"
            />
            <ProductAvatar v-else :name="column.product.product_name" :size="36" class-name="rounded-full shrink-0 max-lg:hidden" />
            <div class="min-w-0 flex-1">
              <p class="truncate max-lg:whitespace-normal max-lg:line-clamp-2 text-xs font-medium max-lg:font-semibold text-navy-900">{{ column.product.product_name }}</p>
            </div>
            <button
              type="button"
              @click="removeColumn(column)"
              :aria-label="langs('clearAllButton')"
              class="text-gray-500 hover:text-red-600 shrink-0 max-lg:hidden"
            >
              <X aria-hidden="true" class="w-3.5 h-3.5" />
            </button>
          </div>
          <div class="grid gap-1.5" :class="column.product.product_model && column.product.product_model.length > 0 ? 'grid-cols-2' : 'grid-cols-1'">
            <button
              type="button"
              @click="openPicker(column.key)"
              class="w-full min-w-0 truncate rounded-full bg-white border border-gray-300 px-1 lg:px-2 h-8 [@media(pointer:coarse)]:h-9 text-[11px] font-medium text-navy-900 hover:border-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {{ langs('swapProductButton') }}
            </button>
            <select
              v-if="column.product.product_model && column.product.product_model.length > 0"
              :value="effectiveModel(column)?.model_id"
              @change="onModelSelect(column, ($event.target as HTMLSelectElement).value)"
              :aria-label="langs('modelSelectorLabel')"
              class="w-full min-w-0 h-8 [@media(pointer:coarse)]:h-9 text-[11px] border border-gray-300 rounded-full pl-2.5 pr-1 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option v-for="model in column.product.product_model" :key="model.model_id" :value="model.model_id">
                {{ model.model_name }}
              </option>
            </select>
          </div>
        </div>
        <div v-for="n in emptySlotCount" :key="`clone-add-${n}`" class="shrink-0" :style="{ width: `${addSlotColumnWidth}px` }"></div>
        </div>
        </div>
      </div>
    </div>
    </div>

    <div v-if="loading" class="rounded-2xl border border-gray-100 shadow-sm bg-white p-4 space-y-3" role="status" :aria-label="langs('loading')">
      <div class="flex gap-3">
        <SkeletonBox class="w-40 h-24 shrink-0 rounded-xl" />
        <SkeletonBox v-for="n in 3" :key="n" class="flex-1 h-24 rounded-xl" />
      </div>
      <div v-for="row in 5" :key="row" class="flex gap-3">
        <SkeletonBox class="w-40 h-6 shrink-0" />
        <SkeletonBox v-for="n in 3" :key="n" class="flex-1 h-6" />
      </div>
    </div>
    <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>

    <div v-if="!loading && !error" class="rounded-2xl border border-gray-100 shadow-sm bg-white">
        <div ref="sentinelEl"></div>
        <!-- มือถือ: คอลัมน์กว้างครึ่งจอ ปัดแล้วหยุดพอดีคอลัมน์ -->
        <div ref="tableWrapperEl" class="overflow-x-auto max-lg:snap-x max-lg:snap-mandatory" :style="{ '--compare-cols': compareStore.capacity }">
        <table ref="tableEl" :key="`cols-${compareStore.capacity}`" class="w-full border-separate border-spacing-0" :style="[{ tableLayout: 'fixed' }, tableWidthStyle]">
          <thead>
            <tr>
              <th class="sticky left-0 z-20 w-40 max-lg:hidden bg-gray-50 border-b border-r border-gray-200 px-4 pb-4 text-left align-bottom">
                <span class="text-sm font-medium text-gray-500">{{ langs('featureColumnLabel') }}</span>
              </th>
              <!-- หัวคอลัมน์การ์ด: รูป → ชื่อ → ราคา → เปลี่ยนสินค้า | เลือกโมเดล (ไม่มีแถวราคาในตาราง) -->
              <th
                v-for="(column, index) in sortedColumns"
                :key="column.key"
                class="bg-gray-50 border-b border-r border-gray-200 p-3 lg:p-4 text-left font-normal align-top w-[220px] max-sm:w-[calc((100vw_-_34px)/2)] sm:max-lg:w-[calc((100vw_-_34px)/var(--compare-cols))] max-lg:snap-start"
                :style="slotWidthStyle"
              >
                <div class="relative">
                  <router-link :to="`/product/${productSlug(column.product)}`" class="block rounded-lg bg-white overflow-hidden hover:opacity-90 transition-opacity">
                    <img loading="lazy" decoding="async"
                      v-if="column.product.product_image"
                      :src="resolveImageUrl(column.product.product_image)"
                      :alt="column.product.product_name"
                      class="w-full h-24 sm:h-28 lg:h-36 object-contain"
                    />
                    <div v-else class="h-24 sm:h-28 lg:h-36 flex items-center justify-center">
                      <ProductAvatar :name="column.product.product_name" :size="64" class-name="rounded-full" />
                    </div>
                  </router-link>
                  <button
                    type="button"
                    @click="removeColumn(column)"
                    :aria-label="langs('clearAllButton')"
                    class="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <X aria-hidden="true" class="w-3.5 h-3.5" />
                  </button>
                  <span
                    v-if="highlightIndex === index"
                    class="absolute top-1.5 left-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-2.5 py-0.5"
                  >
                    {{ langs('recommendedBadge') }}
                  </span>
                </div>
                <div class="mt-2 flex flex-col gap-1.5">
                  <p class="text-sm leading-snug text-navy-900 line-clamp-2 min-h-[2.5rem]">
                    {{ column.product.product_name }}
                  </p>
                  <p class="text-base font-bold text-brand-700">
                    <span v-if="!effectiveModel(column) && column.product.has_priced_models && column.product.product_price" class="block text-[11px] font-normal text-gray-500">{{ langs('startingFromPrice') }}</span>
                    {{ effectivePrice(column) ? `฿${Number(effectivePrice(column)).toLocaleString()}` : langs('priceOnRequest') }}
                    <span v-if="Number(effectivePrice(column))" class="text-xs font-normal text-gray-500">{{ priceUnitLabel(column) }}</span>
                  </p>
                  <div class="grid gap-1.5" :class="column.product.product_model && column.product.product_model.length > 0 ? 'grid-cols-2' : 'grid-cols-1'">
                  <button
                    type="button"
                    @click="openPicker(column.key)"
                    class="w-full min-w-0 truncate px-1 sm:px-2 rounded-full bg-white border border-gray-300 h-10 [@media(pointer:coarse)]:h-11 text-[11px] sm:text-xs lg:text-sm text-navy-900 hover:border-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {{ langs('swapProductButton') }}
                  </button>
                  <select
                    v-if="column.product.product_model && column.product.product_model.length > 0"
                    :value="effectiveModel(column)?.model_id"
                    @change="onModelSelect(column, ($event.target as HTMLSelectElement).value)"
                    :aria-label="langs('modelSelectorLabel')"
                    class="w-full min-w-0 h-10 [@media(pointer:coarse)]:h-11 text-[11px] sm:text-xs lg:text-sm border border-gray-300 rounded-full pl-2 sm:pl-3 pr-1 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    @click.stop
                  >
                    <option v-for="model in column.product.product_model" :key="model.model_id" :value="model.model_id">
                      {{ model.model_name }}
                    </option>
                  </select>
                  </div>
                  <p v-if="featureMatchByKey" class="text-xs text-gray-500">
                    {{ langs('featureMatchLabel') }}: <span class="font-semibold text-navy-900">{{ featureMatchByKey.get(column.key) }}</span>/{{ selectedFeatures.length }}
                  </p>
                </div>
              </th>
              <th v-for="n in emptySlotCount" :key="`add-${n}`" class="bg-gray-50 border-b border-gray-200 p-3 lg:p-4 align-middle w-[220px] max-sm:w-[calc((100vw_-_34px)/2)] sm:max-lg:w-[calc((100vw_-_34px)/var(--compare-cols))] max-lg:snap-start" :style="slotWidthStyle">
                <button
                  type="button"
                  @click="openPicker('add')"
                  class="w-full h-full min-h-[140px] flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-700 transition-colors"
                >
                  <Plus aria-hidden="true" class="w-5 h-5" />
                  <span class="text-sm font-medium">{{ langs('addProductButton') }}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <!-- จอ < lg: ชื่อหัวข้อเป็นแถวเต็มความกว้างเหนือค่า ตรึงซ้ายด้วย sticky left (ปลอดภัยกับเซลล์ตาราง) -->
            <template v-if="!onlyShowDifferences || categoryDiffers">
              <tr class="lg:hidden">
                <td :colspan="totalColumnCount - 1" class="bg-white p-0">
                  <div class="sticky left-0 w-[calc(100vw_-_34px)] flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-6 pb-1 text-lg font-bold leading-snug text-navy-900" :style="rowLabelWidthStyle">
                    {{ langs('colCategory') }}
                    <span :class="['inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', categoryDiffers ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-600']">
                      {{ categoryDiffers ? langs('diffBadgeDifferent') : langs('diffBadgeSame') }}
                    </span>
                  </div>
                </td>
              </tr>
              <tr class="group">
                <td class="sticky left-0 z-10 max-lg:hidden bg-white group-hover:bg-gray-50/60 border-b border-r border-gray-100 px-4 py-4 text-sm font-medium text-navy-900 align-middle transition-colors">
                  {{ langs('colCategory') }}
                  <span :class="['inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', categoryDiffers ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-600']">
                    {{ categoryDiffers ? langs('diffBadgeDifferent') : langs('diffBadgeSame') }}
                  </span>
                </td>
                <td v-for="(column, index) in sortedColumns" :key="column.key" class="border-b border-gray-100 max-lg:border-r px-2 py-5 lg:px-4 lg:py-4 text-sm text-center align-middle group-hover:bg-gray-50/60 transition-colors">
                  <span v-if="column.product.category?.category_name" :class="highlightIndex === index ? 'text-navy-900 font-semibold' : 'text-gray-600'">{{ column.product.category.category_name }}</span>
                  <span v-else class="text-gray-500">-</span>
                </td>
                <td v-for="n in emptySlotCount" :key="`add-${n}`" class="border-b border-gray-100 bg-gray-50/40"></td>
              </tr>
            </template>
            <template v-for="name in attributeNames" :key="name">
              <tr v-show="!onlyShowDifferences || attributeDiffers.get(name)" class="lg:hidden">
                <td :colspan="totalColumnCount - 1" class="bg-white p-0">
                  <div class="sticky left-0 w-[calc(100vw_-_34px)] flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-6 pb-1 text-lg font-bold leading-snug text-navy-900" :style="rowLabelWidthStyle">
                    {{ name }}
                    <span :class="['inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', attributeDiffers.get(name) ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-600']">
                      {{ attributeDiffers.get(name) ? langs('diffBadgeDifferent') : langs('diffBadgeSame') }}
                    </span>
                  </div>
                </td>
              </tr>
              <tr v-show="!onlyShowDifferences || attributeDiffers.get(name)" class="group">
                <td class="sticky left-0 z-10 max-lg:hidden bg-white group-hover:bg-gray-50/60 border-b border-r border-gray-100 px-4 py-4 text-sm font-medium text-navy-900 align-middle transition-colors">
                  {{ name }}
                  <span :class="['inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', attributeDiffers.get(name) ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-600']">
                    {{ attributeDiffers.get(name) ? langs('diffBadgeDifferent') : langs('diffBadgeSame') }}
                  </span>
                </td>
                <td
                  v-for="(column, index) in sortedColumns"
                  :key="column.key"
                  class="border-b border-r border-gray-100 px-2 py-5 lg:px-4 lg:py-4 text-sm text-center align-middle group-hover:bg-gray-50/60 transition-colors"
                >
                  <span v-if="findAttrValue(column, name) !== null" class="whitespace-pre-line break-words" :class="highlightIndex === index ? 'text-navy-900 font-semibold' : 'text-gray-600'">{{ findAttrValue(column, name) }}</span>
                  <span v-else class="text-gray-500">ไม่มี</span>
                </td>
                <td v-for="n in emptySlotCount" :key="`add-${n}`" class="border-b border-r border-gray-100 bg-gray-50/40"></td>
              </tr>
            </template>
            <tr v-if="onlyShowDifferences && !anyRowDiffers">
              <td :colspan="totalColumnCount" class="px-4 py-8 text-center text-sm text-gray-500">{{ langs('noDifferencesFound') }}</td>
            </tr>
          </tbody>
        </table>
        </div>
    </div>
  </div>
</template>
