<script setup lang="ts">
// ป็อปอัปเลือกโมเดลก่อนเพิ่มเข้าตารางเปรียบเทียบ — เปิดจากปุ่ม "เปรียบเทียบ"
// บนการ์ดสินค้า (ProductCard.vue) เฉพาะสินค้าที่มีมากกว่า 1 โมเดล
// กดโมเดลที่ยังไม่อยู่ในตาราง = เพิ่มแล้วปิดป็อปอัป
// กดโมเดลที่อยู่ในตารางแล้ว = เอาช่องนั้นออก (ป็อปอัปยังเปิดอยู่ ให้เลือกโมเดลอื่นต่อได้)
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { useCompareStore } from '../../stores/compare'
import { useLanguage } from '../../language/useLanguage'
import type { ProductModel } from '../../types/product'

const props = defineProps<{
  open: boolean
  productId: string
  productName: string
  productImage?: string | null
  models: ProductModel[]
}>()
const emit = defineEmits<{ close: [] }>()

const compareStore = useCompareStore()
const { langs } = useLanguage()
const dialogEl = ref<HTMLElement | null>(null)

function isAdded(model: ProductModel) {
  return compareStore.isExactInCompare(props.productId, model.model_id)
}

function toggleModel(model: ProductModel) {
  if (isAdded(model)) {
    compareStore.removeItemExact(props.productId, model.model_id)
    return
  }
  compareStore.addItem({
    product_id: props.productId,
    product_name: props.productName,
    product_image: props.productImage ?? undefined,
    product_price: Number(model.product_price) || 0,
    model_id: model.model_id,
  })
  // addItem() ปฏิเสธเองพร้อม toast ถ้าตารางเต็มตามขนาดที่ผู้ใช้เลือก — ปิดเฉพาะตอนเพิ่มได้จริง
  if (isAdded(model)) emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

// เปิดแล้วโฟกัสโมเดลแรก ใช้คีย์บอร์ดเลือกต่อได้ทันที + ฟัง Esc เฉพาะตอนเปิด
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener('keydown', onKeydown)
      nextTick(() => dialogEl.value?.querySelector<HTMLButtonElement>('li button')?.focus())
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
  { immediate: true }
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- Teleport ออกไปที่ body เพราะการ์ดสินค้าทั้งใบเป็น <router-link> —
       ถ้าอยู่ข้างใน คลิกในป็อปอัปจะไหลไปถึงลิงก์และพาเปลี่ยนหน้า -->
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4" @click="emit('close')">
      <div
        ref="dialogEl"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`compare-model-heading-${productId}`"
        class="bg-white rounded-2xl shadow-xl w-full max-w-md p-4"
        @click.stop
      >
        <div class="flex items-start justify-between gap-3 mb-1">
          <p :id="`compare-model-heading-${productId}`" class="text-sm font-semibold text-navy-900">
            {{ langs('chooseModelHeading') }}
          </p>
          <button type="button" @click="emit('close')" :aria-label="langs('closeButton')" class="text-gray-500 hover:text-gray-600 shrink-0">
            <X aria-hidden="true" class="w-4 h-4" />
          </button>
        </div>
        <p class="text-xs text-gray-500 mb-2 truncate">{{ productName }}</p>
        <ul class="max-h-96 overflow-y-auto divide-y divide-gray-100">
          <li v-for="model in models" :key="model.model_id">
            <button
              type="button"
              @click="toggleModel(model)"
              :aria-pressed="isAdded(model)"
              :class="[
                'w-full flex items-center gap-3 px-1.5 py-2 text-left text-sm rounded-lg hover:bg-gray-50',
                isAdded(model) ? 'bg-brand-50' : '',
              ]"
            >
              <span class="truncate flex-1 text-navy-900">{{ model.model_name }}</span>
              <span class="text-xs text-brand-700 font-semibold shrink-0">
                {{ Number(model.product_price) ? `฿${Number(model.product_price).toLocaleString()}` : langs('priceOnRequest') }}
              </span>
              <span
                v-if="isAdded(model)"
                class="inline-flex items-center gap-1 text-[11px] text-white bg-brand-700 rounded px-1.5 py-0.5 shrink-0"
              >
                <Check aria-hidden="true" class="w-3 h-3" />
                {{ langs('added') }}
              </span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>
