<script setup lang="ts">
// โครงหน้าแอดมิน: sidebar ย่อ/ขยายได้ + แถบบน (เมนูผู้ใช้ + เวลาหมดอายุ token)
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LayoutGrid, Package, FileText, Building2, Megaphone, Image, Search, AtSign,
  LogOut, Menu, ChevronDown,
} from 'lucide-vue-next'
import { useAuthStore } from '../../stores/auth'
import ErrorBoundary from '../common/ErrorBoundary.vue'

// เมนู sidebar ตามหลังบ้านต้นแบบ (spd-demo :3304)
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

// กลุ่มเมนูเปิดอยู่ไหม — เริ่มเปิดถ้าหน้าปัจจุบันอยู่ในกลุ่มนั้น
const groupOpen = reactive<Record<string, boolean>>({})
for (const item of NAV_ITEMS) {
  if (item.type === 'group') groupOpen[item.label] = item.children.some((c) => route.path.startsWith(c.to))
}
// มีหน้าลูกของกลุ่มนี้กำลังเปิดอยู่ไหม
function isGroupActive(group: NavGroup) {
  return group.children.some((c) => route.path.startsWith(c.to))
}

const collapsed = ref(false)

const userMenuOpen = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)
// คลิกนอกเมนูผู้ใช้แล้วปิด
function handleOutsideClick(e: MouseEvent) {
  if (userMenuRef.value && !userMenuRef.value.contains(e.target as Node)) userMenuOpen.value = false
}
onMounted(() => document.addEventListener('mousedown', handleOutsideClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', handleOutsideClick))

// นับถอยหลังเวลาหมดอายุ token (จาก exp ของ JWT) อัปเดตทุกวินาที
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

// ออกจากระบบแล้วกลับหน้าล็อกอิน
function handleLogout() {
  auth.logout()
  router.push('/admin/login')
}
</script>

<template>
  <!-- h-screen + overflow-hidden ตรึงความสูงเท่าจอ ให้เลื่อนแค่ <main> -->
  <div class="h-screen flex bg-gray-50 overflow-hidden">
    <aside :class="['shrink-0 bg-white border-r flex flex-col transition-all duration-200', collapsed ? 'w-16' : 'w-60']">
      <div class="px-4 py-4 border-b overflow-hidden">
        <router-link to="/admin/" class="text-lg font-bold text-brand-700 whitespace-nowrap">
          {{ collapsed ? 'D' : 'DTC Admin' }}
        </router-link>
        <p v-if="expiresAtLabel && !collapsed" class="mt-1 text-xs text-gray-500 whitespace-nowrap">{{ expiresAtLabel }}</p>
      </div>
      <nav aria-label="เมนูหลักของผู้ดูแลระบบ" class="flex-1 px-2 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
        <template v-for="item in NAV_ITEMS" :key="item.label">
          <!-- isExactActive เพราะ /admin/ เป็น prefix ของทุกหน้าแอดมิน -->
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
