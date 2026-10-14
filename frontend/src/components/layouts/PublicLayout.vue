<script setup lang="ts">
// โครงหน้า Public: header (โลโก้ ค้นหา ภาษา) + footer จาก DB + ปุ่มลอยเปรียบเทียบ + บันทึกการเข้าชม
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { GitCompare, Menu, X, Phone, Printer, Mail } from 'lucide-vue-next'
import { useCompareStore } from '../../stores/compare'
import { useLanguage } from '../../language/useLanguage'
import { LANGS } from '../../language/translations'
import FlagIcon from '../common/FlagIcon.vue'
import ErrorBoundary from '../common/ErrorBoundary.vue'
import SearchAutocomplete from '../search/SearchAutocomplete.vue'
import { footerAPI, logAPI, resolveImageUrl } from '../../services/api'
import type { FooterContent } from '../../types/product'

const route = useRoute()
const menuOpen = ref(false)
const compareStore = useCompareStore()
const { lang, setLang, langs } = useLanguage()

// เมนู footer ที่ตรงหน้าในเว็บนี้ลิงก์ภายใน ที่เหลือใช้ URL ของเว็บจริงจาก DB
const footer = ref<FooterContent | null>(null)
const INTERNAL_MENU_ROUTES: Record<string, string> = {
  หน้าแรก: '/',
  สินค้าทั้งหมด: '/products',
}

// รูปใบรับรองที่รวม 2 ตราในไฟล์เดียว (กว้างกว่าสูง) ขยายความสูงให้ตราดูขนาดเท่าตัวอื่น
const certBadgeWide = ref<Record<string, boolean>>({})
function onCertBadgeLoad(event: Event, key: string) {
  const img = event.target as HTMLImageElement
  if (img.naturalWidth && img.naturalHeight) {
    certBadgeWide.value[key] = img.naturalWidth / img.naturalHeight > 1.3
  }
}

onMounted(async () => {
  try {
    const res = await footerAPI.get()
    footer.value = res.data
  } catch (err) {
    console.error('Failed to load footer content:', err)
  }
})

// บันทึกการเข้าชมหน้าเว็บ (ยกเว้นหน้าสินค้า — backend บันทึกเอง)
const PAGE_KEY_BY_PATH: Record<string, 'home' | 'products' | 'compare'> = {
  '/': 'home',
  '/products': 'products',
  '/compare': 'compare',
}
function logPageView(path: string) {
  const page = PAGE_KEY_BY_PATH[path]
  if (!page) return
  logAPI.pageView(page).catch(() => {
  })
}
logPageView(route.path)
watch(() => route.path, logPageView)

const navLinks = [
  { to: '/', label: () => langs('navHome') },
  { to: '/products', label: () => langs('navProducts') },
  { to: '/compare', label: () => langs('navCompare') },
]

// ตั้งความสูงจริงของ header เป็น CSS var ให้ส่วน sticky ของแต่ละหน้าใช้
const headerEl = ref<HTMLElement | null>(null)
let headerResizeObserver: ResizeObserver | null = null

function syncHeaderHeightVar() {
  if (headerEl.value) {
    document.documentElement.style.setProperty('--sticky-header-h', `${headerEl.value.offsetHeight}px`)
  }
}

onMounted(() => {
  syncHeaderHeightVar()
  headerResizeObserver = new ResizeObserver(syncHeaderHeightVar)
  if (headerEl.value) headerResizeObserver.observe(headerEl.value)
})

onBeforeUnmount(() => {
  headerResizeObserver?.disconnect()
})

// เปิด/ปิดเมนูมือถือ header สูงเปลี่ยนทันที — วัดใหม่เลยไม่รอ ResizeObserver
watch(menuOpen, () => nextTick(syncHeaderHeightVar))
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gray-50">
    <!-- ลิงก์ข้ามไปเนื้อหาหลัก (เห็นเมื่อกด Tab) -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-white focus:text-brand-700 focus:shadow-lg focus:ring-2 focus:ring-brand-500"
    >
      {{ langs('skipToContent') }}
    </a>
    <!-- ห่อด้วย nav ให้เป็น landmark (axe: region) -->
    <nav :aria-label="langs('languageBarLabel')" class="bg-navy-900 text-white text-xs print:hidden">
      <div class="w-full px-4 h-8 flex items-center justify-between">
        <span class="hidden sm:inline text-navy-100/70">{{ langs('tagline') }}</span>
        <div class="flex items-center gap-3 ml-auto">
          <button
            v-for="l in LANGS"
            :key="l.code"
            @click="setLang(l.code)"
            :class="['flex items-center px-1.5 py-0.5 rounded transition-colors', lang === l.code ? 'bg-white/15' : 'opacity-60 hover:opacity-100']"
            :aria-pressed="lang === l.code"
            :aria-label="l.label"
            :title="l.label"
          >
            <FlagIcon :code="l.code" class-name="h-3.5 w-5 rounded-sm" />
          </button>
        </div>
      </div>
    </nav>

    <!-- z-[35]: อยู่เหนือส่วน sticky ของหน้า (≤ 30) แต่ใต้ป็อปอัป (40+) -->
    <header ref="headerEl" class="bg-white border-b sticky top-0 z-[35] shadow-sm print:hidden">
      <div class="w-full px-4 py-3 flex items-center gap-2 sm:gap-4">
        <router-link to="/" class="flex items-center gap-2 shrink-0">
          <img decoding="async" src="/DTC_logo.png" :alt="langs('siteName')" class="h-9 w-auto" />
        </router-link>

        <nav class="hidden md:flex items-center gap-6 text-sm font-medium ml-2">
          <router-link
            v-for="n in navLinks"
            :key="n.to"
            :to="n.to"
            :class="['py-1 border-b-2 transition-colors', route.path === n.to ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-600 hover:text-brand-700']"
          >
            {{ n.label() }}
          </router-link>
        </nav>

        <SearchAutocomplete class-name="flex-1 min-w-0 max-w-md ml-auto" />

        <button class="md:hidden shrink-0 text-gray-600" @click="menuOpen = !menuOpen" aria-label="menu">
          <X aria-hidden="true" v-if="menuOpen" class="w-6 h-6" />
          <Menu aria-hidden="true" v-else class="w-6 h-6" />
        </button>
      </div>

      <div v-if="menuOpen" class="md:hidden border-t px-4 py-3">
        <nav class="flex flex-col gap-2 text-sm font-medium">
          <router-link v-for="n in navLinks" :key="n.to" :to="n.to" @click="menuOpen = false" class="py-1 text-gray-600 hover:text-brand-700">
            {{ n.label() }}
          </router-link>
        </nav>
      </div>
    </header>

    <main id="main-content" class="flex-1 w-full px-4 py-6">
      <ErrorBoundary>
        <router-view />
      </ErrorBoundary>
    </main>
    <nav :aria-label="langs('navCompare')" class="print:hidden">
    <router-link
      v-if="route.path !== '/compare'"
      to="/compare"
      class="fixed bottom-5 right-5 z-[35] inline-flex items-center justify-center rounded-full bg-brand-700 text-white text-sm font-medium whitespace-nowrap shadow-lg hover:bg-brand-800 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2 print:hidden"
      :class="compareStore.items.length > 0 ? 'gap-2 min-h-11 px-4 py-2.5' : 'w-12 h-12'"
      :aria-label="compareStore.items.length > 0 ? `${langs('compareGo')} — ${langs('compareSelected', { n: compareStore.items.length })}` : langs('compareGo')"
      :title="langs('compareSelected', { n: compareStore.items.length })"
    >
      <GitCompare aria-hidden="true" class="w-5 h-5" />
      <span v-if="compareStore.items.length > 0">{{ langs('compareGo') }}</span>
      <span
        v-if="compareStore.items.length > 0"
        class="min-w-5 h-5 px-1 rounded-full bg-white text-brand-800 text-xs font-semibold flex items-center justify-center leading-none tabular-nums"
        aria-hidden="true"
      >
        {{ compareStore.items.length }}
      </span>
    </router-link>
    </nav>

    <footer
      class="relative text-white/90 print:hidden bg-cover bg-center bg-no-repeat"
      style="background-image: url('/footer-bg.png')"
    >
      <div class="absolute inset-0 bg-navy-900/10"></div>
      <div class="relative w-full px-4 py-10 flex flex-col sm:flex-row flex-wrap justify-between gap-x-8 gap-y-8">
        <div class="shrink-0">
          <img decoding="async" src="/DTC_logo.png" :alt="langs('siteName')" class="h-16 w-auto brightness-0 invert opacity-90 mb-3" />
        </div>

        <div class="shrink-0">
          <p class="text-sm font-semibold text-white mb-2">{{ langs('footerMenuTitle') }}</p>
          <ul class="space-y-1 text-sm">
            <li v-for="item in footer?.menu ?? []" :key="item.title ?? item.url ?? ''">
              <router-link
                v-if="item.title && INTERNAL_MENU_ROUTES[item.title]"
                :to="INTERNAL_MENU_ROUTES[item.title]"
                class="hover:text-white transition-colors"
              >
                {{ item.title }}
              </router-link>
              <a v-else :href="item.url ?? '#'" target="_blank" rel="noopener noreferrer" class="hover:text-white transition-colors">
                {{ item.title }}
              </a>
            </li>
          </ul>
        </div>

        <div v-if="footer" class="text-sm space-y-1.5 max-w-sm">
          <p class="text-white font-semibold mb-2">{{ footer.company.name }}</p>
          <p>{{ footer.company.address }}</p>
          <p class="flex flex-wrap gap-x-4 gap-y-1 pt-1"><span v-if="footer.contact.tel" class="inline-flex items-center gap-1.5"><Phone aria-hidden="true" class="w-3.5 h-3.5 shrink-0" />{{ langs('footerPhoneLabel') }} : {{ footer.contact.tel }}</span></p>
          <p class="flex flex-wrap gap-x-4 gap-y-1 pt-1"><span v-if="footer.contact.fax" class="inline-flex items-center gap-1.5"><Printer aria-hidden="true" class="w-3.5 h-3.5 shrink-0" />{{ langs('footerFaxLabel') }} : {{ footer.contact.fax }}</span></p>
          <p class="flex flex-wrap gap-x-4 gap-y-1 pt-1"><span v-if="footer.contact.email" class="inline-flex items-center gap-1.5"><Mail aria-hidden="true" class="w-3.5 h-3.5 shrink-0" />{{ langs('footerEmailLabel') }} : {{ footer.contact.email }}</span></p>
        </div>

        <div v-if="footer" class="text-sm space-y-1.5 max-w-sm">
          <p v-for="cert in footer.certifications" :key="cert.title ?? cert.name ?? ''">{{ cert.title }}</p>
          <div class="flex flex-wrap items-center gap-3 pt-2">
            <img loading="lazy" decoding="async"
              v-for="cert in footer.certifications"
              :key="'badge-' + (cert.name ?? cert.title ?? '')"
              v-show="cert.image"
              :src="resolveImageUrl(cert.image)"
              :alt="cert.name ?? cert.title ?? ''"
              class="h-12 w-auto object-contain shrink-0"
            />
          </div>
        </div>
      </div>

      <div class="relative w-full px-4 pt-4 pb-20 sm:pb-4 flex flex-col-reverse sm:flex-row items-center gap-3 justify-between"
        :class="compareStore.items.length > 0 ? 'sm:pr-64' : 'sm:pr-20'">
        <p class="text-xs text-white/60">© {{ new Date().getFullYear() }} www.dtc.co.th {{ langs('footerText') }}</p>
        <div v-if="footer" class="flex items-center gap-3">
          <a
            v-for="s in footer.social"
            :key="s.platform ?? s.url ?? ''"
            :href="s.url ?? '#'"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="s.platform ?? undefined"
            class="opacity-90 hover:opacity-100 transition-opacity"
          >
            <img loading="lazy" decoding="async" v-if="s.image" :src="resolveImageUrl(s.image)" :alt="s.platform ?? ''" class="w-7 h-7 object-contain" />
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>
