<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LayoutGrid, Package, FileText, Building2, Megaphone, Image, Search, AtSign,
  LogOut, Menu, ChevronDown,
} from 'lucide-vue-next'
import { useAuthStore } from '../../stores/auth'
import ErrorBoundary from '../common/ErrorBoundary.vue'

// Full sidebar tree — mirrors the reference back-office's own shape 1:1
// (spd-demo.dtc.co.th): a top-level link ("หน้าแรก"), several collapsible
// groups (each expands to its own sub-pages, the active child marked with a
// dot + blue text, the parent pill-highlighted whenever any child route is
// active), then two more top-level links at the end. "คุณสมบัติสินค้า" in
// the "สินค้า" group has no reference equivalent — it's this project's own
// spec/Attribute feature, kept since it's real functionality, just slotted
// into the group it belongs with.
interface NavLink { type: 'link'; to: string; label: string; icon: unknown }
interface NavGroup { type: 'group'; label: string; icon: unknown; children: { to: string; label: string }[] }

const NAV_ITEMS: (NavLink | NavGroup)[] = [
  { type: 'link', to: '/admin/', label: 'หน้าแรก', icon: LayoutGrid },
  {
    type: 'group', label: 'บทความ', icon: FileText,
    children: [{ to: '/admin/articles', label: 'ข้อมูลบทความ' }],
  },
  {
    type: 'group', label: 'สินค้า', icon: Package,
    children: [
      { to: '/admin/products', label: 'สินค้าของฉัน' },
      { to: '/admin/categories', label: 'หมวดหมู่สินค้า' },
      { to: '/admin/attributes', label: 'คุณสมบัติสินค้า' },
      { to: '/admin/models', label: 'โมเดลสินค้า' },
      { to: '/admin/item-options', label: 'ตัวเลือกสินค้า' },
      { to: '/admin/import', label: 'นำเข้าจาก Excel' },
    ],
  },
  {
    type: 'group', label: 'ร้านค้า', icon: Building2,
    children: [{ to: '/admin/shops', label: 'ข้อมูลร้านค้า' }],
  },
  {
    type: 'group', label: 'โฆษณาร้านค้า', icon: Megaphone,
    children: [
      { to: '/admin/ads', label: 'ADS สินค้าแนะนำ' },
      { to: '/admin/new-products', label: 'สินค้าใหม่' },
    ],
  },
  {
    type: 'group', label: 'แบนเนอร์', icon: Image,
    children: [{ to: '/admin/banners', label: 'ข้อมูลแบนเนอร์' }],
  },
  { type: 'link', to: '/admin/seo', label: 'ข้อมูล SEO', icon: Search },
  { type: 'link', to: '/admin/footer', label: 'ข้อมูล Footer', icon: AtSign },
]

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

// One open/closed flag per group, keyed by label. Starts expanded whenever
// the current page is one of that group's own children (e.g. landing on
// /admin/categories directly via a bookmark), and stays however the admin
// last left it after that.
const groupOpen = reactive<Record<string, boolean>>({})
for (const item of NAV_ITEMS) {
  if (item.type === 'group') groupOpen[item.label] = item.children.some((c) => route.path.startsWith(c.to))
}
function isGroupActive(group: NavGroup) {
  return group.children.some((c) => route.path.startsWith(c.to))
}

// Sidebar collapse — toggled by the topbar hamburger button, matching the
// reference back-office's own layout shape (spd-demo.dtc.co.th).
const collapsed = ref(false)

// User menu dropdown in the topbar (replaces the old username+logout block
// that used to sit at the bottom of the sidebar).
const userMenuOpen = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)
function handleOutsideClick(e: MouseEvent) {
  if (userMenuRef.value && !userMenuRef.value.contains(e.target as Node)) userMenuOpen.value = false
}
onMounted(() => document.addEventListener('mousedown', handleOutsideClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', handleOutsideClick))

// Live countdown under the "DTC Admin" logo — `now` ticks every second so
// the label re-renders; the deadline itself still comes straight from the
// JWT's own `exp` claim, no separate refresh-time tracking needed.
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => { now.value = new Date() }, 1000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const expiresAtLabel = computed(() => {
  const expiresAt = auth.tokenExpiresAt
  if (!expiresAt) return null
  const remainingMs = expiresAt.getTime() - now.value.getTime()
  if (remainingMs <= 0) return 'เซสชันหมดอายุแล้ว'

  const totalSeconds = Math.floor(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  const countdown = hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`
  return `เซสชันจะหมดอายุใน ${countdown}`
})

function handleLogout() {
  auth.logout()
  router.push('/admin/login')
}
</script>

<template>
  <!-- h-screen (not min-h-screen) + overflow-hidden pins this whole layout to
       the viewport height. Without that, a tall table in <main> would grow
       the entire flex row taller than the screen — including this sidebar —
       pushing content below the fold along with it. Only <main> scrolls. -->
  <div class="h-screen flex bg-gray-50 overflow-hidden">
    <!-- Sidebar — collapses to icon-only via the topbar hamburger, matching
         the reference back-office's own shape (spd-demo.dtc.co.th). -->
    <aside :class="['shrink-0 bg-white border-r flex flex-col transition-all duration-200', collapsed ? 'w-16' : 'w-60']">
      <div class="px-4 py-4 border-b overflow-hidden">
        <router-link to="/admin/" class="text-lg font-bold text-brand-700 whitespace-nowrap">
          {{ collapsed ? 'D' : 'DTC Admin' }}
        </router-link>
        <p v-if="expiresAtLabel && !collapsed" class="mt-1 text-xs text-gray-500 whitespace-nowrap">{{ expiresAtLabel }}</p>
      </div>
      <nav aria-label="เมนูหลักของผู้ดูแลระบบ" class="flex-1 px-2 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
        <template v-for="item in NAV_ITEMS" :key="item.label">
          <!-- Plain top-level link — isExactActive (not isActive) because
               "หน้าแรก" resolves to /admin/, a PREFIX of every other admin
               page (/admin/products, /admin/categories, ...); isActive alone
               would keep it highlighted on every single admin page. -->
          <router-link v-if="item.type === 'link'" :to="item.to" v-slot="{ isExactActive }" custom>
            <a
              :href="item.to"
              :title="item.label"
              @click.prevent="router.push(item.to)"
              :class="[
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                isExactActive ? 'bg-brand-700 text-white' : 'text-gray-700 hover:bg-gray-100',
              ]"
            >
              <component :is="item.icon" class="w-4 h-4 shrink-0" />
              <span v-if="!collapsed">{{ item.label }}</span>
            </a>
          </router-link>

          <!-- Collapsible group -->
          <template v-else>
            <button
              type="button"
              :title="item.label"
              @click="collapsed ? router.push(item.children[0].to) : (groupOpen[item.label] = !groupOpen[item.label])"
              :class="[
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                isGroupActive(item) ? 'bg-brand-700 text-white' : 'text-gray-700 hover:bg-gray-100',
              ]"
            >
              <component :is="item.icon" class="w-4 h-4 shrink-0" />
              <span v-if="!collapsed" class="flex-1 text-left">{{ item.label }}</span>
              <ChevronDown aria-hidden="true" v-if="!collapsed" :class="['w-4 h-4 shrink-0 transition-transform', groupOpen[item.label] ? 'rotate-180' : '']" />
            </button>
            <div v-if="!collapsed && groupOpen[item.label]" class="pl-4 space-y-1">
              <router-link
                v-for="child in item.children"
                :key="child.to"
                :to="child.to"
                v-slot="{ isActive }"
                custom
              >
                <a
                  :href="child.to"
                  @click.prevent="router.push(child.to)"
                  :class="[
                    'flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap',
                    isActive ? 'text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-100',
                  ]"
                >
                  <span :class="['w-1.5 h-1.5 rounded-full shrink-0', isActive ? 'bg-brand-500' : 'bg-gray-300']" />
                  {{ child.label }}
                </a>
              </router-link>
            </div>
          </template>
        </template>
      </nav>

      <!-- Logout — also in the topbar user menu; kept here too since this is
           where it originally lived, at the user's request. -->
      <div class="px-2 py-3 border-t shrink-0">
        <button
          @click="handleLogout"
          :title="collapsed ? 'ออกจากระบบ' : undefined"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 whitespace-nowrap"
        >
          <LogOut aria-hidden="true" class="w-4 h-4 shrink-0" />
          <span v-if="!collapsed">ออกจากระบบ</span>
        </button>
      </div>
    </aside>

    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Topbar — hamburger toggles the sidebar, user menu replaces the old
           username+logout block that used to sit at the bottom of the sidebar. -->
      <header class="h-14 shrink-0 bg-white border-b flex items-center justify-between px-4">
        <button
          @click="collapsed = !collapsed"
          class="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          aria-label="สลับแถบเมนู"
        >
          <Menu aria-hidden="true" class="w-5 h-5" />
        </button>

        <div ref="userMenuRef" class="relative">
          <button
            @click="userMenuOpen = !userMenuOpen"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
          >
            {{ auth.admin?.username }}
            <ChevronDown aria-hidden="true" class="w-4 h-4 text-gray-500" />
          </button>
          <div
            v-if="userMenuOpen"
            class="absolute right-0 mt-1 w-40 bg-white border rounded-lg shadow-lg py-1 z-20"
          >
            <button
              @click="handleLogout"
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut aria-hidden="true" class="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" class="flex-1 p-6 overflow-y-auto overflow-x-auto">
        <ErrorBoundary thai>
          <router-view />
        </ErrorBoundary>
      </main>
    </div>
  </div>
</template>
