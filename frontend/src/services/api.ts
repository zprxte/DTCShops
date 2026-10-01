import axios from 'axios'

const api = axios.create({
  // ต้องเป็น path สัมพัทธ์เสมอ ห้ามใส่ URL เต็ม — Vite proxy `/api` ไปที่ backend ให้
  // (vite.config.ts) คำขอจึงวิ่งไป origin เดียวกับหน้าเว็บ ไม่ว่าจะเปิดด้วย localhost
  // หรือ IP ใดก็ตาม = ไม่มี CORS และไม่ต้องตั้งค่าใหม่เมื่อเปลี่ยน Wi-Fi
  // ⚠️ ห้ามเอา VITE_PROXY_TARGET มาใช้ตรงนี้ — ค่านั้นเป็นของฝั่งเซิร์ฟเวอร์
  // (ในคอนเทนเนอร์คือ `http://backend:4000` ซึ่งเบราว์เซอร์หาไม่เจอ) และไม่มี /api ต่อท้าย
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

//ดึง token จาก local storage
const stored = localStorage.getItem('auth-storage')
if (stored) {
  try {
    const { token } = JSON.parse(stored)
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }
  } catch {
    console.error("Error")
  }
}

//ดัก 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLoginRequest = err.config?.url?.includes('/auth/login')
    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('auth-storage')
      delete api.defaults.headers.common['Authorization']
      window.location.href = '/admin/login'
    }
    return Promise.reject(err)
  }
)

export default api

/**
 * แปลง path รูปในฐานข้อมูลให้ใช้กับ <img> ได้
 * path ใน DB เป็น `/uploads/...` อยู่แล้ว และ Vite proxy `/uploads` ไป backend ให้
 * จึงส่งต่อตามเดิมได้เลย ไม่ต้องเติม origin (แก้ 16 ก.ย. 2026 — เดิมเติมจาก VITE_API_URL)
 * ส่งไฟล์ต้นฉบับเสมอ (เอาพารามิเตอร์ `width` ที่ไม่มีผลออกแล้ว 11 ก.ย. 2026)
 * ห้ามต่อ `?w=` กลับเข้าไป: ตอนที่ backend ยังย่อรูป URL แบบ `?w=1200` ถูกเบราว์เซอร์
 * จำเป็นรูปย่อ 1200px ไว้ในแคช ถอดระบบย่อรูปแล้ว URL เดิมยังได้รูปย่อจากแคช
 * แบนเนอร์เต็มจอจึงเบลอ — เปลี่ยน URL คือทางเดียวที่ทำให้ทุกเครื่องโหลดไฟล์ใหม่
 * รูปที่เป็นลิงก์ภายนอก (http…) ส่งต่อตามเดิม
 */
export function resolveImageUrl(image?: string | null): string | undefined {
  if (!image) return undefined
  if (/^https?:\/\//i.test(image)) return image
  return image
}

// ===== Typed API helpers =====
//ระบบค้นหา
export const searchAPI = {
  search: (params: {
    searchword: string
    category_id?: number | string
    category_ids?: string
    tags?: string
    min_price?: number | string
    max_price?: number | string
    sort?: string
    page?: number
    limit?: number
    // NOTE: path ของ API เป็นคนละเรื่องกับ path ของหน้าเว็บ — หน้าเว็บย้ายไป
    // /products แล้ว แต่ backend ยัง mount ตัวค้นหาไว้ที่ /api/search
    // (routes/search.js) และย้ายไป /api/products ไม่ได้ เพราะชนกับ
    // routes/products.js ที่ครอง path นั้นอยู่ (/api/products/:id จะกลืน
    // /api/products/autocomplete ไปเลย)
  }) => api.get('/search', { params }),

  autocomplete: (searchword: string) => api.get('/search/autocomplete', { params: { searchword } }),
}

//ระบบสินค้า
export const productAPI = {
  list: (params?: object) => api.get('/products', { params }),
  getById: (id: string) => api.get(`/products/${id}`),
  // รายการตัวกรอง (หมวดหมู่ + คุณสมบัติที่กรองได้จริง) คำนวณสดจากข้อมูลใน DB
  filters: () => api.get('/products/filters'),
}

export const categoryAPI = {
  list: () => api.get('/categories'),
}

export const footerAPI = {
  get: () => api.get('/footer'),
}

export const bannerAPI = {
  list: () => api.get('/banners'),
}

export const shopAPI = {
  list: () => api.get('/shops'),
}

// บันทึกการเข้าชมหน้าเว็บฝั่ง public ลง tbl_logs (ตารางสถิติจริงของ
// dtcshops.com) — หน้ารายละเอียดสินค้าไม่ต้องเรียกทางนี้ backend บันทึก
// ให้เองตอนดึงข้อมูลสินค้าแล้ว
export const logAPI = {
  pageView: (page: 'home' | 'products' | 'compare') => api.post('/logs/view', { page }),
}

export const compareAPI = {
  logCompare: (product_ids: string[]) => api.post('/compare', { product_ids }),
  getProducts: (ids: string[]) => api.get('/products/compare', { params: { ids: ids.join(',') } }),
}

//ระบบหลังบ้าน
export const adminAPI = {
  // Products
  getDashboard: (params?: { start?: string; end?: string }) => api.get('/admin/dashboard', { params }),
  listProducts: (params?: object) => api.get('/admin/products', { params }),
  getProduct: (id: string) => api.get(`/admin/products/${id}`),
  createProduct: (data: object) => api.post('/admin/products', data),
  updateProduct: (id: string, data: object) => api.put(`/admin/products/${id}`, data),
  // แก้เฉพาะวันที่วางจำหน่าย — ห้ามใช้ updateProduct แทน (PUT เป็น full-replace)
  updateProductSaleDates: (id: string, data: { sale_start_date: string | null; sale_end_date: string | null }) =>
    api.patch(`/admin/products/${id}/sale-dates`, data),
  deleteProduct: (id: string) => api.delete(`/admin/products/${id}`),
  restoreProduct: (id: string) => api.put(`/admin/products/${id}/restore`),
  uploadImage: (file: File) => {
    const form = new FormData()
    form.append('image', file)
    return api.post<{ url: string }>('/admin/upload/image', form, {
      headers: { 'Content-Type': undefined },
    })
  },

  // Master data
  listCategories: () => api.get('/admin/categories'),
  getCategory: (id: string) => api.get(`/admin/categories/${id}`),
  createCategory: (data: object) => api.post('/admin/categories', data),
  updateCategory: (id: string, data: object) => api.put(`/admin/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/admin/categories/${id}`),

  listAttributes: () => api.get('/admin/attributes'),
  getAttribute: (id: number | string) => api.get(`/admin/attributes/${id}`),
  createAttribute: (data: object) => api.post('/admin/attributes', data),
  updateAttribute: (id: number, data: object) => api.put(`/admin/attributes/${id}`, data),
  deleteAttribute: (id: number) => api.delete(`/admin/attributes/${id}`),

  // Added 2026-09-03 — mirrors the reference back-office's own sidebar
  // sections (ร้านค้า/แบนเนอร์/ข้อมูล Footer/โมเดลสินค้า), one generic
  // {list,get,create,update,delete} set per table.
  // ชุดของบทความ/โฆษณาร้านค้า/ข้อมูล SEO ถูกลบทิ้ง 10 ก.ย. 2026 พร้อม
  // endpoint ฝั่ง backend — ไม่มีหน้าไหนเรียกใช้อยู่แล้ว (เป็น placeholder)
  listShops: (params?: object) => api.get('/admin/shops', { params }),
  getShop: (id: string) => api.get(`/admin/shops/${id}`),
  createShop: (data: object) => api.post('/admin/shops', data),
  updateShop: (id: string, data: object) => api.put(`/admin/shops/${id}`, data),
  deleteShop: (id: string) => api.delete(`/admin/shops/${id}`),

  listBanners: (params?: object) => api.get('/admin/banners', { params }),
  getBanner: (id: string) => api.get(`/admin/banners/${id}`),
  createBanner: (data: object) => api.post('/admin/banners', data),
  updateBanner: (id: string, data: object) => api.put(`/admin/banners/${id}`, data),
  deleteBanner: (id: string) => api.delete(`/admin/banners/${id}`),

  listFooterItems: (params?: object) => api.get('/admin/footer', { params }),
  createFooterItem: (data: object) => api.post('/admin/footer', data),
  updateFooterItem: (id: number, data: object) => api.put(`/admin/footer/${id}`, data),
  deleteFooterItem: (id: number) => api.delete(`/admin/footer/${id}`),

  listModels: (params?: object) => api.get('/admin/models', { params }),
  getModel: (id: string) => api.get(`/admin/models/${id}`),
  createModel: (data: object) => api.post('/admin/models', data),
  updateModel: (id: string, data: object) => api.put(`/admin/models/${id}`, data),
  deleteModel: (id: string) => api.delete(`/admin/models/${id}`),

  listOptions: (params?: object) => api.get('/admin/options', { params }),
  getOption: (id: string) => api.get(`/admin/options/${id}`),
  createOption: (data: object) => api.post('/admin/options', data),
  updateOption: (id: string, data: object) => api.put(`/admin/options/${id}`, data),
  deleteOption: (id: string) => api.delete(`/admin/options/${id}`),

  // นำเข้าจาก Excel (25 ก.ย. 2026) — parse/plan ไม่เขียนอะไร, commit ตรวจซ้ำแล้วค่อยเขียน
  downloadImportTemplate: () => api.get<Blob>('/admin/import/template', { responseType: 'blob', timeout: 60000 }),
  parseImportFile: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/admin/import/parse', form, { headers: { 'Content-Type': undefined }, timeout: 60000 })
  },
  planImport: (data: object) => api.post('/admin/import/plan', data, { timeout: 60000 }),
  commitImport: (data: object) => api.post('/admin/import/commit', data, { timeout: 120000 }),
}