import { ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useLanguage } from '../language/useLanguage'

export const pageTitleOverride = ref<string | null>(null)
// ตั้งชื่อแท็บเบราว์เซอร์ตาม meta ของ route (หน้าสินค้าใช้ pageTitleOverride)
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
    document.title = page ? `${page.replace(/\s+/g, ' ').trim()} | ${brand}` : brand
  })
}
