// axios ตัวกลาง + ฟังก์ชันเรียก API ทุกเส้นของระบบ
import axios from 'axios'

const api = axios.create({
  // ต้องเป็น path สัมพัทธ์ — Vite proxy / nginx ส่ง /api ต่อให้ (ห้ามใช้ VITE_PROXY_TARGET ที่นี่ เบราว์เซอร์หา backend:4000 ไม่เจอ)
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// ใส่ token ที่บันทึกไว้ให้ทุกคำขอ
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

// 401 (ที่ไม่ใช่ตอนล็อกอิน) = token ใช้ไม่ได้ → ล้างแล้วกลับหน้าล็อกอิน
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

// path รูปใน DB → ใช้กับ <img> ได้เลย (ห้ามต่อ ?w= — URL เดิมติดแคชรูปย่อทำแบนเนอร์เบลอ)
export function resolveImageUrl(image?: string | null): string | undefined {
  if (!image) return undefined
  if (/^https?:\/\//i.test(image)) return image
  return image
}

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
    // API อยู่ที่ /api/search ไม่ใช่ /api/products (ชนกับ /api/products/:id)
  }) => api.get('/search', { params }),

  autocomplete: (searchword: string) => api.get('/search/autocomplete', { params: { searchword } }),
}

export const productAPI = {
  list: (params?: object) => api.get('/products', { params }),
  getById: (id: string) => api.get(`/products/${id}`),
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

// บันทึกการเข้าชมหน้าเว็บ (หน้าสินค้า backend บันทึกเอง)
export const logAPI = {
  pageView: (page: 'home' | 'products' | 'compare') => api.post('/logs/view', { page }),
}

export const compareAPI = {
  logCompare: (product_ids: string[]) => api.post('/compare', { product_ids }),
  getProducts: (ids: string[]) => api.get('/products/compare', { params: { ids: ids.join(',') } }),
}

export const adminAPI = {
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

  // นำเข้า Excel: parse/plan ไม่เขียน DB · commit ตรวจซ้ำแล้วค่อยเขียน
  downloadImportTemplate: () => api.get<Blob>('/admin/import/template', { responseType: 'blob', timeout: 60000 }),
  parseImportFile: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/admin/import/parse', form, { headers: { 'Content-Type': undefined }, timeout: 60000 })
  },
  planImport: (data: object) => api.post('/admin/import/plan', data, { timeout: 60000 }),
  commitImport: (data: object) => api.post('/admin/import/commit', data, { timeout: 120000 }),
}