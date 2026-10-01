<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { GitCompare, Check, Loader2 } from 'lucide-vue-next'
import { useCompareStore } from '../../stores/compare'
import { toast } from '../../stores/toast'
import { useLanguage } from '../../language/useLanguage'
import { compareAPI, resolveImageUrl } from '../../services/api'
import { highlightSegments } from '../../utils/highlight'
import { productSlug } from '../../utils/slug'
import CompareModelDialog from './CompareModelDialog.vue'
import type { ProductCardData, ProductModel } from '../../types/product'

const props = defineProps<{ product: ProductCardData; query?: string }>()

const compareStore = useCompareStore()
const { langs } = useLanguage()

const inCompare = computed(() => compareStore.isInCompare(props.product.product_id))
const nameSegments = computed(() => highlightSegments(props.product.product_name, props.query ?? ''))
//ราคาต่ำสุดถึงราคาสูงสุด
const isPriceRange = computed(() => {
  const product = props.product
  return (
    !!product.has_priced_models &&
    product.product_price_max != null &&
    Number(product.product_price_max) !== Number(product.product_price)
  )
})

const compareButton = ref<HTMLButtonElement | null>(null)
const loadingModels = ref(false)
const modelChoices = ref<ProductModel[]>([])
const modelDialogOpen = ref(false)

//เพิ่ม/เอาออกจากตารางเปรียบเทียบ
//- ไม่มีโมเดล: เพิ่มตัวสินค้าเลย (เหมือนเดิม)
//- มี 1 โมเดล: เพิ่มโดยผูกโมเดลนั้นให้อัตโนมัติ
//- มีหลายโมเดล: เปิดป็อปอัปให้เลือกโมเดลก่อน (กดในป็อปอัปเพื่อเพิ่ม/เอาออกทีละโมเดล)
//ดึงรายการโมเดลจาก /products/compare ไม่ใช้ /products/:id เพราะตัวนั้นนับยอดเข้าชมสินค้า
async function toggleCompare(e: Event) {
  e.preventDefault()
  if (loadingModels.value) return
  const product = props.product

  if (!product.has_models) {
    if (inCompare.value) compareStore.removeItem(product.product_id)
    else addToCompare(null, Number(product.product_price) || 0)
    return
  }

  loadingModels.value = true
  try {
    const res = await compareAPI.getProducts([product.product_id])
    const models: ProductModel[] = res.data.products?.[0]?.product_model ?? []
    if (models.length > 1) {
      modelChoices.value = models
      modelDialogOpen.value = true
      return
    }
    if (inCompare.value) {
      compareStore.removeItem(product.product_id)
      return
    }
    const onlyModel = models[0]
    addToCompare(onlyModel?.model_id ?? null, Number(onlyModel?.product_price ?? product.product_price) || 0)
  } catch {
    toast.error(langs('compareLoadError'))
  } finally {
    loadingModels.value = false
  }
}

function addToCompare(modelId: string | null, price: number) {
  compareStore.addItem({
    product_id: props.product.product_id,
    product_name: props.product.product_name,
    product_image: props.product.product_image ?? undefined,
    product_price: price,
    model_id: modelId ?? undefined,
  })
}

//ปิดป็อปอัปแล้วคืนโฟกัสให้ปุ่มเปรียบเทียบของการ์ดใบนี้ (ผู้ใช้คีย์บอร์ดไม่หลงตำแหน่ง)
function closeModelDialog() {
  modelDialogOpen.value = false
  nextTick(() => compareButton.value?.focus())
}
</script>

<template>
  <router-link
    :to="`/product/${productSlug(product)}`"
    class="group bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow flex flex-col h-full"
  >
    <div class="aspect-[4/3] bg-white p-3 flex items-center justify-center overflow-hidden border-b">
      <img
        v-if="product.product_image"
        :src="resolveImageUrl(product.product_image)"
        loading="lazy"
        decoding="async"
        :alt="product.product_name"
        class="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform"
      />
      <span v-else class="text-gray-500 text-sm">{{ langs('noImage') }}</span>
    </div>
    <div class="p-3 flex-1 flex flex-col gap-1">
      <h3 class="text-sm font-medium line-clamp-2 flex-1">
        <template v-for="(seg, i) in nameSegments" :key="i">
          <mark v-if="seg.match" class="bg-brand-100 text-brand-800 rounded-sm">{{ seg.text }}</mark>
          <template v-else>{{ seg.text }}</template>
        </template>
      </h3>
      <p class="text-brand-700 font-bold">
        <template v-if="isPriceRange">
          ฿{{ Number(product.product_price).toLocaleString() }}-{{ Number(product.product_price_max).toLocaleString() }}
        </template>
        <template v-else>
          {{ product.product_price ? `฿${Number(product.product_price).toLocaleString()}` : langs('priceOnRequest') }}
        </template>
      </p>
      <button
        ref="compareButton"
        type="button"
        @click="toggleCompare"
        :aria-pressed="inCompare"
        :aria-busy="loadingModels"
        :disabled="loadingModels"
        :class="[
          'mt-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg border transition-colors',
          inCompare
            ? 'bg-brand-700 text-white border-brand-600'
            : 'text-gray-500 border-gray-200 hover:border-brand-400 hover:text-brand-700',
        ]"
      >
        <Loader2 v-if="loadingModels" class="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        <Check v-else-if="inCompare" class="w-3.5 h-3.5" aria-hidden="true" />
        <GitCompare v-else class="w-3.5 h-3.5" aria-hidden="true" />
        {{ inCompare ? langs('added') : langs('addToCompare') }}
      </button>
    </div>
    <CompareModelDialog
      :open="modelDialogOpen"
      :product-id="product.product_id"
      :product-name="product.product_name"
      :product-image="product.product_image"
      :models="modelChoices"
      @close="closeModelDialog"
    />
  </router-link>
</template>
