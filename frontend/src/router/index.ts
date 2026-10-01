import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import type { TranslationKey } from '../language/translations'

// ชื่อแท็บเบราว์เซอร์ของแต่ละหน้า — ใช้โดย composables/usePageTitle.ts
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    title?: string // ฝั่งแอดมิน (ไทยล้วน)
    titleKey?: TranslationKey // ฝั่ง Public (แปลตามภาษา)
  }
}

const PublicLayout = () => import('../components/layouts/PublicLayout.vue')
const AdminLayout = () => import('../components/layouts/AdminLayout.vue')

const router = createRouter({
  history: createWebHistory(),
  // ตำแหน่งเลื่อนหน้าเวลาเปลี่ยนหน้า — ไม่ตั้งไว้ Vue Router จะคงตำแหน่งเดิม
  // (เคยเป็นบั๊ก: กดการ์ดหมวดหมู่ที่อยู่ค่อนล่างของหน้าแรก แล้วหน้าสินค้าเปิดมาอยู่ท้ายรายการ)
  scrollBehavior(to, from, savedPosition) {
    // ย้อนกลับ/ไปข้างหน้าของเบราว์เซอร์ = คืนตำแหน่งที่เคยอยู่ — แต่ต้องรอให้ความสูงหน้า "นิ่ง" ก่อน
    // หน้าแรกโหลดแบนเนอร์/หมวดหมู่แบบ async และกรอบแบนเนอร์คำนวณความสูงจากสัดส่วนรูปหลังรูปโหลด
    // ถ้าคืนตำแหน่งตอนหน้ายังยืดอยู่ scroll anchoring ของเบราว์เซอร์จะดันเลยไปไกลกว่าเดิม
    // (วัดจริง: เดิมอยู่ 825 คืนทันทีได้ 1239, รอแค่ให้สูงพอได้ 1892) — จึงรอจนความสูงไม่เปลี่ยน
    // ต่อเนื่อง 400ms (สูงสุด 2.5 วินาที)
    if (savedPosition) {
      return new Promise((resolve) => {
        const started = Date.now()
        let lastHeight = -1
        let stableSince = Date.now()
        const waitUntilStable = () => {
          const height = document.documentElement.scrollHeight
          if (height !== lastHeight) {
            lastHeight = height
            stableSince = Date.now()
          }
          const tallEnough = height >= savedPosition.top + window.innerHeight
          const stable = Date.now() - stableSince >= 400
          if ((tallEnough && stable) || Date.now() - started > 2500) resolve(savedPosition)
          else requestAnimationFrame(waitUntilStable)
        }
        waitUntilStable()
      })
    }
    // หน้าเดิมแต่ query เปลี่ยน (ติ๊กตัวกรอง / ค้นหาใหม่ในหน้าสินค้า) = ไม่กระโดด
    if (to.path === from.path) return false
    return { top: 0 }
  },
  routes: [
    // ===== Public Routes =====
    {
      path: '/',
      component: PublicLayout,
      children: [
        { path: '', name: 'home', component: () => import('../pages/public/HomePage.vue'), meta: { titleKey: 'navHome' } },
        { path: 'products', name: 'products', component: () => import('../pages/public/ProductsPage.vue'), meta: { titleKey: 'navProducts' } },
        // ชื่อสินค้าถูกตั้งจากหน้าเองหลังโหลดข้อมูล (pageTitleOverride)
        { path: 'product/:slug', name: 'product-detail', component: () => import('../pages/public/ProductDetailPage.vue') },
        { path: 'compare', name: 'compare', component: () => import('../pages/public/ComparePage.vue'), meta: { titleKey: 'navCompare' } },
      ],
    },

    // ===== Admin Auth =====
    { path: '/admin/login', name: 'admin-login', component: () => import('../pages/admin/AdminLoginPage.vue'), meta: { title: 'เข้าสู่ระบบ' } },

    // ===== Admin Protected Routes =====
    {
      path: '/admin',
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', name: 'admin-dashboard', component: () => import('../pages/admin/AdminDashboardPage.vue'), meta: { title: 'แดชบอร์ด' } },
        { path: 'products', name: 'admin-products', component: () => import('../pages/admin/AdminProductsPage.vue'), meta: { title: 'สินค้าของฉัน' } },
        { path: 'products/new', name: 'admin-product-new', component: () => import('../pages/admin/AdminProductEditPage.vue'), meta: { title: 'เพิ่มสินค้าใหม่' } },
        { path: 'products/:id/edit', name: 'admin-product-edit', component: () => import('../pages/admin/AdminProductEditPage.vue'), meta: { title: 'แก้ไขสินค้า' } },
        { path: 'import', name: 'admin-import', component: () => import('../pages/admin/AdminImportPage.vue'), meta: { title: 'นำเข้าจาก Excel' } },
        { path: 'categories', name: 'admin-categories', component: () => import('../pages/admin/AdminCategoriesPage.vue'), meta: { title: 'ประเภทสินค้า' } },
        { path: 'categories/new', name: 'admin-category-new', component: () => import('../pages/admin/AdminCategoryFormPage.vue'), meta: { title: 'เพิ่มประเภทสินค้า' } },
        { path: 'categories/:id/edit', name: 'admin-category-edit', component: () => import('../pages/admin/AdminCategoryFormPage.vue'), meta: { title: 'แก้ไขประเภทสินค้า' } },
        { path: 'attributes', name: 'admin-attributes', component: () => import('../pages/admin/AdminAttributesPage.vue'), meta: { title: 'คุณสมบัติสินค้า' } },
        { path: 'attributes/new', name: 'admin-attribute-new', component: () => import('../pages/admin/AdminAttributeFormPage.vue'), meta: { title: 'เพิ่มคุณสมบัติสินค้า' } },
        { path: 'attributes/:id/edit', name: 'admin-attribute-edit', component: () => import('../pages/admin/AdminAttributeFormPage.vue'), meta: { title: 'แก้ไขคุณสมบัติสินค้า' } },
        { path: 'models', name: 'admin-models', component: () => import('../pages/admin/AdminModelsPage.vue'), meta: { title: 'โมเดลสินค้า' } },
        { path: 'models/new', name: 'admin-model-new', component: () => import('../pages/admin/AdminModelFormPage.vue'), meta: { title: 'เพิ่มโมเดลสินค้า' } },
        { path: 'models/:id/edit', name: 'admin-model-edit', component: () => import('../pages/admin/AdminModelFormPage.vue'), meta: { title: 'แก้ไขโมเดลสินค้า' } },
        { path: 'item-options', name: 'admin-item-options', component: () => import('../pages/admin/AdminItemOptionsPage.vue'), meta: { title: 'ตัวเลือกสินค้า' } },
        { path: 'articles', name: 'admin-articles', component: () => import('../pages/admin/AdminArticlesPage.vue'), meta: { title: 'ข้อมูลบทความ' } },
        { path: 'shops', name: 'admin-shops', component: () => import('../pages/admin/AdminShopsPage.vue'), meta: { title: 'ข้อมูลร้านค้า' } },
        { path: 'ads', name: 'admin-ads', component: () => import('../pages/admin/AdminAdsPage.vue'), meta: { title: 'ADS สินค้าแนะนำ' } },
        { path: 'new-products', name: 'admin-new-products', component: () => import('../pages/admin/AdminNewProductsPage.vue'), meta: { title: 'สินค้าใหม่' } },
        { path: 'banners', name: 'admin-banners', component: () => import('../pages/admin/AdminBannersPage.vue'), meta: { title: 'ข้อมูลแบนเนอร์' } },
        { path: 'banners/new', name: 'admin-banner-new', component: () => import('../pages/admin/AdminBannerFormPage.vue'), meta: { title: 'เพิ่มแบนเนอร์' } },
        { path: 'banners/:id/edit', name: 'admin-banner-edit', component: () => import('../pages/admin/AdminBannerFormPage.vue'), meta: { title: 'แก้ไขแบนเนอร์' } },
        { path: 'seo', name: 'admin-seo', component: () => import('../pages/admin/AdminSeoPage.vue'), meta: { title: 'ข้อมูล SEO' } },
        { path: 'footer', name: 'admin-footer', component: () => import('../pages/admin/AdminFooterPage.vue'), meta: { title: 'ข้อมูล Footer' } },
      ],
    },

    // Fallback
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

//ป้องกันหน้าแอดมิน
router.beforeEach((to) => {
  if (to.meta.requiresAuth) {
    const auth = useAuthStore()
    if (!auth.isAuthenticated) return { name: 'admin-login' }
  }
})

export default router
