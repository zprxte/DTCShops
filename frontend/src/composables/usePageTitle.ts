import { ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useLanguage } from '../language/useLanguage'

export const pageTitleOverride = ref<string | null>(null)
export function usePageTitle() {
  const route = useRoute()
  const { langs } = useLanguage()

  watch(() => route.path, () => { pageTitleOverride.value = null })

  watchEffect(() => {
    const brand = route.path.startsWith('/admin') ? 'DTC Admin' : 'DTC SHOP'
    const searchword = route.name === 'products' ? String(route.query.searchword ?? '').trim() : ''
    const page =
      pageTitleOverride.value ??
      (searchword ? `${langs('searchResultsFor')} "${searchword}"` : null) ??
      (route.meta.titleKey ? langs(route.meta.titleKey) : route.meta.title) ??
      null
    // ยุบช่องว่างซ้อน (ชื่อสินค้าจริงบางตัวมีช่องว่าง 2 ตัวติดกัน — เบราว์เซอร์ก็ยุบให้อยู่แล้ว)
    document.title = page ? `${page.replace(/\s+/g, ' ').trim()} | ${brand}` : brand
  })
}
