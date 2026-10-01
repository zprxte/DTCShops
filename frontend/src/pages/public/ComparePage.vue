<script setup lang="ts">
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

function effectiveModel(column: CompareColumn): ProductModel | null {
  const models = column.product.product_model
  if (!models || models.length === 0) return null
  if (column.item.model_id != null) {
    return models.find((model) => model.model_id === column.item.model_id) ?? models[0]
  }
  return models[0]
}

//คืนราคาที่ควรแสดงของคอลัมน์นี้ (ราคาโมเดลที่เลือกอยู่ ถ้าไม่มีก็ใช้ราคาสินค้า)
function effectivePrice(column: CompareColumn): number | string | null {
  return effectiveModel(column)?.product_price ?? column.product.product_price
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
          //สร้าง map ไว้ค้นสินค้าได้ทั้งจาก slug และ itm_code เพราะ URL อาจเป็นได้ทั้งสองแบบ
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
                //เก็บเป็น itm_code จริงเสมอ ไม่ใช่ slug
                product_id: product.product_id,
                product_name: product.product_name,
                product_image: product.product_image ?? undefined,
                product_price: Number(model?.product_price ?? product.product_price) || 0,
                model_id: model ? model.model_id : undefined,
              }
            })
            .filter((item): item is CompareProduct => item !== null)
          // กันช่องซ้ำเป๊ะ (สินค้า+โมเดลเดียวกัน) ที่อาจติดมากับลิงก์แชร์ที่ถูกแก้มือ
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

//กันปัญหาข้อมูลเก่าทับข้อมูลใหม่ตอนยิงหลาย request ซ้อนกัน (ใช้เฉพาะ response ล่าสุดเท่านั้น)
let fetchProductsRequestId = 0

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
//โหลดสินค้าใหม่เฉพาะตอนรายการสินค้าที่ต่างกันเปลี่ยนไป (เพิ่มโมเดลของสินค้าเดิมไม่ต้องโหลดซ้ำ)
watch(
  () => Array.from(new Set(compareStore.items.map((item) => item.product_id))).sort().join(','),
  fetchProducts
)

//บันทึก log การเปรียบเทียบครั้งเดียวต่อการเข้าหน้านี้ เมื่อมีสินค้าอย่างน้อย 2 รายการ
watch(
  () => compareStore.items.length,
  (itemCount) => {
    if (loggedThisVisit || itemCount < 2) return
    loggedThisVisit = true
    compareAPI.logCompare(compareStore.items.map((item) => item.product_id)).catch(() => {})
  },
  { immediate: true }
)

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

function openPicker(mode: string) {
  pickerMode.value = mode
  pickerFilter.value = ''
  pickerCategory.value = ''
  pickerPendingProduct.value = null
  pickerModelChoices.value = []
  if (allProducts.value.length === 0 && !pickerLoading.value) {
    pickerLoading.value = true
    productAPI
      .list({ limit: 100 })
      .then((res) => { allProducts.value = res.data.products ?? [] })
      .catch(() => { allProducts.value = [] })
      .finally(() => { pickerLoading.value = false })
  }
}

// ปิดป็อปอัปด้วยปุ่ม Esc — มาตรฐานของหน้าต่างซ้อน (ConfirmDialog.vue ก็ทำแบบนี้)
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

//เช็คว่าสินค้านี้ยังมีโมเดลที่ยังไม่ได้เพิ่มเข้าตารางเปรียบเทียบเหลืออยู่มั้ย
function hasAddableOption(result: ProductCardData) {
  if (!result.has_models) return !compareStore.isInCompare(result.product_id)
  const modelIds = result.model_ids ?? []
  if (modelIds.length === 0) return !compareStore.isInCompare(result.product_id)
  return modelIds.some((modelId) => !compareStore.isExactInCompare(result.product_id, modelId))
}

//หมวดหมู่ที่มีให้เลือกใน popup — อ่านจากสินค้าที่โหลดมาแล้ว ไม่ยิง API เพิ่ม
//ตั้งใจไม่กรองด้วย hasAddableOption ตรงนี้ เพื่อให้ตัวเลือกไม่หายไปกลางคันตอนผู้ใช้
//เพิ่มสินค้าจนหมดหมวด (ซึ่งจะทำให้ค่าที่เลือกอยู่ชี้ไปหมวดที่ไม่มีในลิสต์แล้ว)
const pickerCategories = computed(() =>
  [...new Set(allProducts.value.map((product) => product.category_name).filter((name): name is string => !!name))].sort(
    (a, b) => a.localeCompare(b, 'th')
  )
)

//กรองสินค้าที่จะนำมาเปรียบเทียบ ด้วยหมวดหมู่และคำค้นจากชื่อสินค้า
const filteredPickerProducts = computed(() => {
  const query = pickerFilter.value.trim().toLowerCase()
  const category = pickerCategory.value
  let base = allProducts.value.filter(hasAddableOption)
  if (category) base = base.filter((product) => product.category_name === category)
  if (!query) return base
  return base.filter((product) => product.product_name.toLowerCase().includes(query))
})

//หาว่าคอลัมน์ไหนกำลังจะถูกเปลี่ยนสินค้า (โหมด "เปลี่ยนสินค้า" เท่านั้น)
const pickerTargetColumn = computed(() =>
  pickerMode.value && pickerMode.value !== 'add'
    ? columns.value.find((column) => column.key === pickerMode.value) ?? null
    : null
)

async function selectPickerProduct(result: ProductCardData) {
  if (pickerMode.value === null) return
  if (!result.has_models) {
    finalizePickerSelection(result, null, Number(result.product_price) || 0)
    return
  }
  //มีหลายโมเดล ต้องโหลดรายการโมเดลมาให้เลือกก่อน
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
    // ไม่ขยายขนาดตารางให้เอง — ที่นี่ตัวเลือกขนาดอยู่ตรงหน้า ผู้ใช้เพิ่งเลือกเองกับมือ
    // (ต่างจากหน้าแรก/หน้าสินค้าที่มองไม่เห็นตัวเลือกนี้ ดูคอมเมนต์ใน stores/compare.ts)
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

//สร้างลิงก์แชร์หน้าเปรียบเทียบโดยใช้ slug ของสินค้าแทน itm_code แล้วคัดลอกใส่คลิปบอร์ด
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

//รวมชื่อคุณสมบัติทั้งหมดที่จะแสดงเป็นแถวในตาราง (รวมของสินค้าและของโมเดลที่เลือก)
const attributeNames = computed(() =>
  Array.from(new Set(columns.value.flatMap((column) => {
    const baseNames = column.product.product_attribute_value?.map((attrValue) => attrValue.attribute.attribute_name) ?? []
    const modelNames = effectiveModel(column)?.product_attribute_value?.map((attrValue) => attrValue.attribute.attribute_name) ?? []
    return [...baseNames, ...modelNames]
  })))
)
//
function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const str = String(value)
  
  const kMatch = str.match(/(\d+(?:\.\d+)?)\s*[kK](?!\w)/)
  if (kMatch) return Number(kMatch[1]) * 1000

  const match = str.match(/-?\d+(\.\d+)?/)
  return match ? Number(match[0]) : null
}

// ดึงตัวเลขจากข้อความสเปคที่เป็น "รายการหลายค่า" คั่นด้วยจุลภาค/สแลช/"และ" — เช่น
// "กล้องหน้า 1440P (2560 x 1440), กล้องหลัง 1080P (1920 x 1080)" ต้องได้ [1440, 1080]
// (ค่าของแต่ละรายการ) ไม่ใช่ [1440, 2560, 1440, 1080, 1920, 1080] (ถ้าไล่จับทุกตัวเลข
// เฉยๆ ตัวเลขในวงเล็บที่เป็นแค่ขนาดพิกเซล W x H จะปนเข้ามาปั่นค่าจริง) — จึงต้องแยกเป็น
// รายการก่อน แล้วอ่านแค่ "ตัวเลขตัวแรก" ของแต่ละรายการด้วยกฎเดียวกับ parseNumber()
// เอาตัวมากสุดของทั้งหมดเป็นตัวเปรียบเทียบหลัก, จำนวนรายการเป็นตัวตัดสินเมื่อเท่ากัน
// (ดูใน compareBySortField())
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

//หาค่าคุณสมบัตินี้ของคอลัมน์ (ค่าของโมเดลที่เลือกจะทับค่าของสินค้าถ้ามีทั้งคู่)
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

function defaultDirectionFor(field: string): 'asc' | 'desc' {
  return field === SORT_PRICE ? 'asc' : 'desc'
}

//เปิดการเรียงลำดับตามฟิลด์นี้ พร้อมติ๊ก checkbox ให้ตรงกันอัตโนมัติ
function setSortFieldOn(field: string, direction: 'asc' | 'desc' = defaultDirectionFor(field)) {
  sortField.value = field
  sortDirection.value = direction
  if (field !== SORT_PRICE && !selectedFeatures.value.includes(field)) {
    selectedFeatures.value = [...selectedFeatures.value, field]
  }
}

function setSortFieldOff(field: string) {
  if (sortField.value === field) sortField.value = SORT_NONE
}

//สลับเปิด/ปิดการเรียงลำดับตามราคา
function togglePriceSortOnOff() {
  if (sortField.value === SORT_PRICE) setSortFieldOff(SORT_PRICE)
  else setSortFieldOn(SORT_PRICE)
}

//คืนค่าที่ dropdown เรียงลำดับของฟิลด์นี้ควรแสดง
function sortValueFor(field: string): '' | 'asc' | 'desc' {
  return sortField.value === field ? sortDirection.value : SORT_NONE
}

//จัดการตอนเลือกค่าใน dropdown เรียงลำดับของแต่ละแถว
function handleSortSelect(field: string, event: Event) {
  const value = (event.target as HTMLSelectElement).value as '' | 'asc' | 'desc'
  if (value === SORT_NONE) setSortFieldOff(field)
  else setSortFieldOn(field, value)
}

//หาสเปคที่คำนวณเรียงลำดับได้ (ต้องเป็นตัวเลขอย่างน้อย 2 คอลัมน์ขึ้นไป)
const computableAttributeNames = computed(() =>
  attributeNames.value.filter((name) => {
    const numericCount = columns.value.filter((column) => parseNumber(findAttrValue(column, name)) !== null).length
    return numericCount >= 2
  })
)

//ถ้าสเปคที่ใช้เรียงอยู่หายไป ให้เลิกเรียงลำดับ
watch(computableAttributeNames, (availableNames) => {
  if (sortField.value === SORT_NONE || sortField.value === SORT_PRICE) return
  if (!availableNames.includes(sortField.value)) sortField.value = SORT_NONE
})

//ฟังก์ชันเปรียบเทียบไว้เรียงคอลัมน์ตามฟิลด์ที่เลือก (คอลัมน์ที่ไม่มีค่าจะตกไปท้ายเสมอ)
function compareBySortField(columnA: CompareColumn, columnB: CompareColumn): number {
  if (sortField.value === SORT_NONE) return 0
  const sign = sortDirection.value === 'asc' ? 1 : -1
  if (sortField.value === SORT_PRICE) {
    // ราคา 0/ว่าง = "ราคาติดต่อสอบถาม" ถือว่าไม่มีราคา ตกไปท้ายเสมอทั้งสองทิศทาง
    const priceA = parseNumber(effectivePrice(columnA)) || null
    const priceB = parseNumber(effectivePrice(columnB)) || null
    if (priceA === null && priceB === null) return 0
    if (priceA === null) return 1
    if (priceB === null) return -1
    return (priceA - priceB) * sign
  }
  // สเปคทั่วไป — อ่านตัวเลข "ทุกตัว" ในข้อความ (เผื่อเป็นรายการหลายค่า เช่น
  // "กล้องหน้า 1440P, กล้องหลัง 1080P") ใช้ตัวที่มากสุดของแต่ละคอลัมน์เป็นตัวเทียบหลัก
  // ถ้าตัวมากสุดเท่ากัน ให้คอลัมน์ที่มี "จำนวนค่า" มากกว่า (เช่นมีกล้องมากกว่า) ชนะ
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

function hasFeature(column: CompareColumn, attributeName: string): boolean {
  const raw = findAttrValue(column, attributeName)
  if (raw === null) return false
  return !NEGATIVE_FEATURE_VALUES.has(String(raw).trim().toLowerCase())
}

const selectedFeatures = ref<string[]>([])
// มือถือเริ่มแบบย่อไว้ — ชิปคุณสมบัติ 20 กว่าอันกินจอเกือบครึ่งก่อนจะเห็นตาราง
const featuresOpen = ref(typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches)

function isFeatureSelected(name: string) {
  return selectedFeatures.value.includes(name)
}

//ติ๊ก/ถอนติ๊กฟีเจอร์ที่ต้องการ พร้อมตั้งให้เป็นตัวเรียงลำดับอัตโนมัติถ้าติ๊กและคำนวณได้
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

// ขนาดตารางเปรียบเทียบ (2/3/4 ช่อง) — คำขออาจารย์ 14 ก.ย. 2026
// ย่อขนาดลงจนช่องไม่พอ = ต้องเอาสินค้าท้ายรายการออก จึงถามยืนยันก่อนเสมอ
const pendingSizeChange = ref<number | null>(null)

const sizeShrinkRemovedCount = computed(() =>
  pendingSizeChange.value === null ? 0 : Math.max(0, compareStore.items.length - pendingSizeChange.value)
)

// คีย์ของช่องที่ผู้ใช้ติ๊กว่าจะเอาออก — ให้เลือกเองว่าสินค้าตัวไหนไป ไม่ใช่ตัดท้ายรายการ
// ให้อัตโนมัติ เพราะลำดับในตะกร้าคือ "ลำดับที่เพิ่ม" ไม่ได้แปลว่าตัวท้ายสำคัญน้อยที่สุด
const shrinkRemoveKeys = ref<string[]>([])

function toggleShrinkRemove(key: string) {
  shrinkRemoveKeys.value = shrinkRemoveKeys.value.includes(key)
    ? shrinkRemoveKeys.value.filter((k) => k !== key)
    : [...shrinkRemoveKeys.value, key]
}

// ต้องติ๊กให้ครบพอดีตามจำนวนที่ต้องเอาออก ไม่ขาดไม่เกิน ปุ่มยืนยันถึงจะกดได้
const shrinkSelectionComplete = computed(
  () => shrinkRemoveKeys.value.length === sizeShrinkRemovedCount.value
)

function requestCompareSize(size: number, event: MouseEvent) {
  if (size === compareStore.capacity) return
  if (size < compareStore.items.length) {
    sizeDialogTrigger = event.currentTarget as HTMLElement
    // ติ๊กท้ายรายการไว้ให้ล่วงหน้า = พฤติกรรมเดิม ผู้ใช้ที่ไม่สนใจว่าตัวไหนออกกดยืนยัน
    // ได้ทันทีคลิกเดียว ส่วนคนที่สนใจก็ย้ายติ๊กเอง
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

function confirmSizeChange() {
  if (pendingSizeChange.value === null || !shrinkSelectionComplete.value) return
  // เอาที่ติ๊กไว้ออกก่อน แล้วค่อยย่อขนาด — ตอน setCapacity() ถูกเรียกจำนวนสินค้าจะพอดี
  // ช่องแล้ว มันจึงไม่ต้องตัดอะไรเพิ่มเอง (ถ้าย่อก่อนจะโดนตัดท้ายรายการทิ้งไปก่อน)
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
// ปุ่มขนาดที่กดเปิดป็อปอัป — เก็บไว้คืนโฟกัสให้ตอนปิด ไม่ให้โฟกัสเด้งกลับไปต้นหน้า
let sizeDialogTrigger: HTMLElement | null = null

// Esc ปิด + ขัง Tab ไว้ในป็อปอัป (ไม่งั้นกด Tab แล้วโฟกัสหลุดไปโดนตารางที่อยู่ข้างหลัง
// ทั้งที่มองไม่เห็นว่าโฟกัสอยู่ไหน) — ป็อปอัปนี้มีแค่ 2 ปุ่ม จึงวนเองได้ไม่ต้องใช้ไลบรารี
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
    //โฟกัสไปที่ "ยกเลิก" ก่อน ไม่ใช่ปุ่มที่ลบสินค้าทิ้ง — กด Enter พลาดจะได้ไม่เสียของ
    nextTick(() => sizeCancelButtonEl.value?.focus())
  } else {
    window.removeEventListener('keydown', handleSizeDialogKeydown)
    sizeDialogTrigger?.focus()
    sizeDialogTrigger = null
  }
})

//ล้างสินค้าออกจากตะกร้าเปรียบเทียบทั้งหมด (ฟีเจอร์ที่ติ๊กไว้ถูกล้างตามเองผ่าน watch attributeNames)
function clearCompare() {
  compareStore.clearAll()
}

//ล้างฟีเจอร์ที่ติ๊กไว้ทั้งหมดและเลิกเรียงลำดับ (ไม่ลบสินค้าออกจากตาราง)
function clearAllFeatures() {
  selectedFeatures.value = []
  setSortFieldOff(sortField.value)
}

//ถ้าฟีเจอร์ที่ติ๊กไว้หายไปจากตาราง (สินค้าที่มีฟีเจอร์นั้นถูกลบออก) ให้ถอนติ๊กออก
watch(attributeNames, (availableAttrNames) => {
  const kept = selectedFeatures.value.filter((name) => availableAttrNames.includes(name))
  if (kept.length !== selectedFeatures.value.length) selectedFeatures.value = kept
})

//นับว่าแต่ละคอลัมน์ตรงกับฟีเจอร์ที่ติ๊กไว้กี่ข้อ (ไว้แสดงตัวเลขกำกับคอลัมน์)
const featureMatchByKey = computed<Map<string, number> | null>(() => {
  if (selectedFeatures.value.length === 0) return null
  const matchByKey = new Map<string, number>()
  columns.value.forEach((column) => {
    const count = selectedFeatures.value.filter((name) => hasFeature(column, name)).length
    matchByKey.set(column.key, count)
  })
  return matchByKey
})

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

//แนะนำคอลัมน์แรกเฉพาะตอนที่มันชนะคอลัมน์ถัดไปจริงๆ เท่านั้น —
//ถ้าฟีเจอร์ที่ติ๊กไว้ตรงกันหมดและไม่มีสเปคตัวเลขให้ตัดสิน ก็ไม่มีตัวไหนดีกว่า จึงไม่แนะนำ
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

// เหมือนกัน/ต่างกัน
const onlyShowDifferences = ref(false)

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

// กล่องเลือกฟีเจอร์ซ่อนหัวข้อที่ค่าเหมือนกันหมด ตามสวิตช์เดียวกับตาราง — ติ๊กหัวข้อ
// ที่ทุกตัวมีค่าเท่ากันไม่ได้ช่วยจัดอันดับอะไรเลย เพราะทุกตัวตรงเท่ากันหมด
// ยกเว้นหัวข้อที่ติ๊กค้างไว้อยู่ ยังต้องโชว์เสมอ ไม่งั้นตัวกรองที่ทำงานอยู่จะหายไป
// จากสายตาแต่ยังนับใน "ตรงกับที่เลือก X/Y" ทำให้ตัวเลขไม่ตรงกับที่เห็น
const visibleFeatureNames = computed(() =>
  attributeNames.value.filter(
    (name) => !onlyShowDifferences.value || attributeDiffers.value.get(name) || isFeatureSelected(name)
  )
)

const showPriceFeature = computed(
  () => !onlyShowDifferences.value || priceDiffers.value || sortField.value === SORT_PRICE
)

//ไม่นับราคา — ราคาอยู่ในหัวคอลัมน์ ไม่ใช่แถวในตาราง (ถ้านับ ตารางจะว่างโดยไม่มีข้อความบอก)
const anyRowDiffers = computed(
  () => categoryDiffers.value || Array.from(attributeDiffers.value.values()).some(Boolean)
)

// จำนวนช่องว่างที่ยังเพิ่มสินค้าได้ — โชว์ครบทุกช่องที่เหลือทันที
// แทนที่จะโชว์ทีละช่องเดียวแล้วค่อยขึ้นช่องถัดไปหลังเพิ่มสินค้า
// จำนวนช่องทั้งหมดมาจากขนาดตารางที่ผู้ใช้เลือก (2/3/4) ไม่ใช่ 4 ตายตัว
const emptySlotCount = computed(() => Math.max(0, compareStore.capacity - columns.value.length))

const totalColumnCount = computed(() => 1 + sortedColumns.value.length + emptySlotCount.value)

// เปลี่ยนโมเดลของคอลัมน์ — ถ้าโมเดลที่เลือกถูกอีกคอลัมน์ของสินค้าตัวเดียวกันถือไว้อยู่แล้ว
// ให้ "สลับกัน" (อีกคอลัมน์รับโมเดลเดิมของคอลัมน์นี้ไป) แทนที่จะปล่อยให้กลายเป็น
// 2 คอลัมน์ที่เหมือนกันเป๊ะ ซึ่งเทียบกันไปก็ไม่ได้ข้อมูลอะไรเพิ่ม (คำขอผู้ใช้ 2026-09-09)
function onModelSelect(column: CompareColumn, modelId: string) {
  const model = column.product.product_model?.find((v) => v.model_id === modelId)
  if (!model) return
  const currentModelId = effectiveModel(column)?.model_id ?? null
  if (currentModelId === modelId) return
  keepTableScrollPosition()

  // เทียบด้วยโมเดลที่ "แสดงอยู่จริง" (effectiveModel) ไม่ใช่ค่าที่เก็บไว้ในตะกร้า
  // เพราะช่องที่ยังไม่เคยเลือกโมเดลจะเก็บเป็น null แต่หน้าจอโชว์โมเดลตัวแรกอยู่
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

// เปลี่ยน/เพิ่มสินค้าผ่านป็อปอัปแล้วรายการสินค้าเปลี่ยน → fetchProducts() ตั้ง loading → ตารางถูก
// v-if ถอดออกแล้วสร้างใหม่ ตำแหน่งปัดแนวนอนกลับไป 0 (ตาราง 3–4 ช่องบนมือถือเด้งไปคอลัมน์แรก)
// จำตำแหน่งไว้ก่อน แล้วคืนค่าหลังตารางวาดเสร็จ — ทั้งกรณีโหลดใหม่และกรณีแค่วาดคอลัมน์ใหม่
// (เปลี่ยนโมเดล: key ของคอลัมน์มีรหัสโมเดล คอลัมน์จึงถูกสร้างใหม่แม้ไม่โหลดข้อมูล)
let pendingTableScrollLeft: number | null = null

function keepTableScrollPosition() {
  if (!tableWrapperEl.value) return
  pendingTableScrollLeft = tableWrapperEl.value.scrollLeft
  // setTimeout ไม่ใช่ nextTick — nextTick ที่เรียกก่อนแก้ store จะรันก่อน watcher ที่สั่ง
  // fetchProducts() ตอนนั้น loading ยังเป็น false จึงคืนค่าเร็วเกินแล้วล้างค่าที่จำไว้ทิ้ง
  // (ตารางถูกสร้างใหม่ทีหลังที่ 0) · ถ้ามีการโหลด watch(loading) ด้านล่างเป็นคนคืนค่าแทน
  setTimeout(restoreTableScrollPosition, 0)
}

function restoreTableScrollPosition() {
  if (pendingTableScrollLeft === null || loading.value) return
  const wrapper = tableWrapperEl.value
  if (!wrapper) return
  const left = pendingTableScrollLeft
  pendingTableScrollLeft = null
  wrapper.scrollLeft = left
  //เผื่อ scroll-snap จับตำแหน่งใหม่หลังเฟรมแรก
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

function stickyOffsetPx(): number {
  const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-header-h')) || 0
  // แผงตัวกรองตรึงเฉพาะจอ lg (≥ 1024px) — มือถือ/แท็บเล็ตมันเลื่อนหายไปกับหน้า จึงไม่นับความสูง
  const panel = filterPanelEl.value
  // ใช้ความสูงจริงแบบมีทศนิยม — offsetHeight ปัดเป็นจำนวนเต็ม เหลือช่องให้ตารางโผล่ระหว่างแผงกับหัวจำลอง (เห็นชัดตอนจอสเกล 125%/ซูมเบราว์เซอร์)
  const filterH = panel && getComputedStyle(panel).position === 'sticky' ? panel.getBoundingClientRect().height : 0
  return headerH + filterH
}

let scrollFrame = 0
//คำนวณตำแหน่ง/การแสดงผลของแถบหัวตารางจำลองตอนเลื่อนหน้าจอ
function handleStickyScroll() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const offset = stickyOffsetPx()
    // แผงตัวกรองค้างอยู่บนสุดแล้ว (เฉพาะจอ lg ที่มันตรึง) → ตัดขอบมนออกให้ต่อกับหัวจำลองเป็นแถบเดียว
    const panel = filterPanelEl.value
    const panelIsSticky = !!panel && getComputedStyle(panel).position === 'sticky'
    const panelRect = panel?.getBoundingClientRect()
    filterPanelStuck.value = panelIsSticky && panelRect!.top <= offset - panelRect!.height + 0.5
    // ซ้อนใต้แผง 1px (หัวจำลอง z ต่ำกว่าแผง) กันรอยต่อจากการปัดพิกเซลของจอสเกลไม่เต็ม
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

//ผูก event scroll ใหม่ทุกครั้งที่ element เปลี่ยน (เพราะ v-if ทำให้ mount/unmount ใหม่ได้)
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

//คอยติดตามความกว้างตารางที่เปลี่ยนไป (เช่น รูปโหลดเสร็จ) แล้ว sync หัวตารางจำลองให้ตรงกัน
let tableResizeObserver: ResizeObserver | null = null
watch(tableEl, (el) => {
  tableResizeObserver?.disconnect()
  if (el) {
    tableResizeObserver = new ResizeObserver(syncCloneColumnWidths)
    tableResizeObserver.observe(el)
  }
  syncCloneColumnWidths()
})
//sync หัวตารางจำลองใหม่ทุกครั้งที่ลำดับคอลัมน์เปลี่ยน (จากการเรียงลำดับ)
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
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  // เผื่อผู้ใช้เปลี่ยนหน้าไปตอนป็อปอัปยังเปิดอยู่ — watch จะไม่ถูกเรียกอีกแล้ว
  window.removeEventListener('keydown', handlePickerKeydown)
  window.removeEventListener('keydown', handleSizeDialogKeydown)
})
</script>

<template>
  <!--เรียกใช้ translations-->
  <h1 class="sr-only">{{ langs('navCompare') }}</h1>

  <div class="space-y-4">
    <!-- เพิ่มสินค้า / เปลี่ยนสินค้า -->
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

        <!-- ขั้นที่ 2: เลือกโมเดล (สำหรับสินค้าที่มีหลายโมเดล) -->
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

        <!-- ขั้นที่ 1: เลือกสินค้าจากรายการทั้งหมด -->
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
    <!-- ป็อปอัปยืนยันตอนย่อขนาดตารางจนสินค้าที่มีอยู่ล้นช่อง -->
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

        <!-- เลือกเองว่าจะเอาสินค้าตัวไหนออก — ติ๊กท้ายรายการไว้ให้ล่วงหน้าแล้ว -->
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
              <!-- red-700/gray-600 ไม่ใช่ 600/400 — ตัวอักษร 11px ต้องผ่าน AA 4.5:1
                   (red-600 บนพื้น red-50 ได้แค่ 4.41, gray-400 บนขาวได้ 2.53) -->
              <span
                class="shrink-0 text-[11px] font-medium"
                :class="shrinkRemoveKeys.includes(compareItemKey(item)) ? 'text-red-700' : 'text-gray-600'"
              >
                {{ shrinkRemoveKeys.includes(compareItemKey(item)) ? langs('compareShrinkRemoveTag') : langs('compareShrinkKeepTag') }}
              </span>
            </button>
          </li>
        </ul>

        <!-- ตัวนับ: ต้องติ๊กครบพอดีถึงจะยืนยันได้ · role=status ให้ screen reader รู้ตัวเลขที่เปลี่ยน -->
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

    <!-- รวมขนาดตารางและตัวกรองไว้ในแผงเดียว ขนาดยังเลือกได้แม้มีสินค้าไม่ครบสองชิ้น -->
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

          <!-- ล้างสินค้าออกจากตะกร้าทั้งหมด — คนละอย่างกับล้างฟีเจอร์ที่ติ๊กไว้ -->
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
        <!-- ตัวเรียงโผล่เฉพาะคุณสมบัติที่เลือกอยู่ -->
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

    <!-- หัวตารางจำลอง แสดงแทนหัวตารางจริงตอนเลื่อนหน้าจอเลยขอบไปแล้ว
         กล่องนอกสูง 0 และมีอยู่ตลอด หัวจำลองจึงลอยทับตาราง ไม่ดันตารางลง —
         ถ้าหัวจำลองกินที่ใน flow เอง ตอนโผล่มันจะดัน sentinel ลงจนเงื่อนไขกลับเป็นเท็จ แล้วหาย-โผล่วนไปมา -->
    <div
      v-if="columns.length > 1"
      class="sticky z-[25] h-0 !mt-0"
      :style="{ top: `${cloneTopPx}px` }"
    >
    <!-- z-[25] ต้องสูงกว่าเซลล์ชื่อหัวข้อที่ตรึงซ้าย (sticky left-0 z-20) ของตารางจริง ไม่งั้นหัว "คุณสมบัติ" สีเทาโผล่ทับหัวจำลอง -->
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
          <!-- มือถือ: หัวค้างแบบกะทัดรัด ไม่มีรูป เหลือชื่อ + ปุ่มเปลี่ยนสินค้า + เลือกโมเดล -->
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
          <!-- ปุ่มเปลี่ยนสินค้า + เลือกโมเดล ชุดเดียวกับหัวตารางจริง ใช้ได้โดยไม่ต้องเลื่อนกลับขึ้นไป -->
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

    <!-- โครงร่างตารางเปรียบเทียบระหว่างโหลด (คอลัมน์ซ้าย = ชื่อหัวข้อ, ที่เหลือ
         = สินค้าที่กำลังดึงข้อมูลอยู่) -->
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

    <!-- ตารางแสดงเสมอแม้ตะกร้าจะยังว่าง เพื่อให้เริ่มเปรียบเทียบได้เลย -->
    <div v-if="!loading && !error" class="rounded-2xl border border-gray-100 shadow-sm bg-white">
        <div ref="sentinelEl"></div>
        <!-- มือถือ: คอลัมน์สินค้ากว้างครึ่งจอ เห็นทีละ 2 ชิ้น ตาราง 3–4 ช่องเลื่อนแล้วหยุดตรงคอลัมน์พอดี -->
        <div ref="tableWrapperEl" class="overflow-x-auto max-lg:snap-x max-lg:snap-mandatory" :style="{ '--compare-cols': compareStore.capacity }">
        <table ref="tableEl" class="w-full border-separate border-spacing-0" style="table-layout: fixed">
          <thead>
            <tr>
              <th class="sticky left-0 z-20 w-40 max-lg:hidden bg-gray-50 border-b border-r border-gray-200 px-4 pb-4 text-left align-bottom">
                <span class="text-sm font-medium text-gray-500">{{ langs('featureColumnLabel') }}</span>
              </th>
              <!-- หัวคอลัมน์แบบการ์ด ใช้ชุดเดียวกันทุกขนาดจอ (18 ก.ย. 2026 ตาม wireframe แอป):
                   รูปใหญ่ (✕ / ป้ายแนะนำวางทับมุม) → ชื่อ 2 บรรทัด → ราคาตัวหนา
                   → ปุ่มเม็ดยา "เปลี่ยนสินค้า" → เลือกโมเดล · ราคาอยู่ตรงนี้แล้วจึงไม่มีแถว "ราคา" ในตาราง -->
              <th
                v-for="(column, index) in sortedColumns"
                :key="column.key"
                class="bg-gray-50 border-b border-r border-gray-200 p-3 lg:p-4 text-left font-normal align-top w-[220px] max-sm:w-[calc((100vw_-_34px)/2)] sm:max-lg:w-[calc((100vw_-_34px)/var(--compare-cols))] max-lg:snap-start"
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
                  <!-- สินค้าที่มีโมเดลโชว์โมเดลในช่องเลือกใต้ปุ่มเปลี่ยนสินค้าแล้ว ชื่อจึงไม่ต่อท้ายโมเดลซ้ำ -->
                  <p class="text-sm leading-snug text-navy-900 line-clamp-2 min-h-[2.5rem]">
                    {{ column.product.product_name }}
                  </p>
                  <p class="text-base font-bold text-brand-700">
                    <span v-if="!effectiveModel(column) && column.product.has_priced_models && column.product.product_price" class="block text-[11px] font-normal text-gray-500">{{ langs('startingFromPrice') }}</span>
                    {{ effectivePrice(column) ? `฿${Number(effectivePrice(column)).toLocaleString()}` : langs('priceOnRequest') }}
                  </p>
                  <!-- ปุ่มเปลี่ยนสินค้า + เลือกโมเดล แถวเดียวกัน กว้างเท่ากันคนละครึ่ง สูงเท่ากัน
                       (สินค้าโมเดลเดียวไม่มีช่องเลือก ปุ่มจึงกว้างเต็มแถว) -->
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
              <!-- ช่องว่างเปล่าที่ยังเพิ่มสินค้าได้ — โชว์ครบทุกช่องที่เหลือตามขนาดตารางที่เลือกไว้ -->
              <th v-for="n in emptySlotCount" :key="`add-${n}`" class="bg-gray-50 border-b border-gray-200 p-3 lg:p-4 align-middle w-[220px] max-sm:w-[calc((100vw_-_34px)/2)] sm:max-lg:w-[calc((100vw_-_34px)/var(--compare-cols))] max-lg:snap-start">
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
            <!-- มือถือ (< lg): ชื่อหัวข้อขึ้นเป็นแถวเต็มความกว้างเหนือค่า แทนคอลัมน์ซ้าย 160px ที่ถูกซ่อน
                 (max-lg:hidden) — สินค้า 2 ชิ้นจึงวางคู่กันพอดีจอ · div ข้างในตรึงซ้าย (sticky left
                 อย่างเดียว ปลอดภัยกับเซลล์ตาราง) ชื่อหัวข้อจึงไม่เลื่อนหายตอนปัดดูคอลัมน์ 3–4 -->
            <!-- ไม่มีแถว "ราคา" — ราคาอยู่ในหัวคอลัมน์ทุกขนาดจอแล้ว (18 ก.ย. 2026) -->
            <template v-if="!onlyShowDifferences || categoryDiffers">
              <tr class="lg:hidden">
                <td :colspan="totalColumnCount - 1" class="bg-white p-0">
                  <div class="sticky left-0 w-[calc(100vw_-_34px)] flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-6 pb-1 text-lg font-bold leading-snug text-navy-900">
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
                  <div class="sticky left-0 w-[calc(100vw_-_34px)] flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-6 pb-1 text-lg font-bold leading-snug text-navy-900">
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
