export interface ProductCardData {
  product_id: string
  product_name: string
  product_image?: string | null
  product_price: number | string | null
  product_price_max?: number | string | null
  has_models?: boolean
  has_priced_models?: boolean
  category_name?: string | null
  slug?: string | null
  model_ids?: string[]
}

export interface ProductAttributeValue {
  value: string
  attribute: { attribute_id: number; attribute_name: string }
}

export interface ProductGalleryItem {
  gallery_id: number
  product_image: string
  sort_order: number
}

export interface ProductModel {
  model_id: string
  model_name: string
  sku?: string | null
  product_price: number | string | null
  stock_quantity?: number | null
  sold_count?: number | null
  sort_order: number
  product_attribute_value?: ProductAttributeValue[]
}

// ตัวเลือกสินค้า / อุปกรณ์เสริมที่ซื้อเพิ่มได้ (tbl_item_option) — คนละอย่างกับ
// ProductModel ที่เป็นรุ่นย่อยของตัวสินค้าเอง; แสดงเฉพาะหน้ารายละเอียดสินค้า
// ไม่ถูกดึงเข้าตารางเปรียบเทียบ
export interface ProductOption {
  option_id: string
  option_name: string
  addon_price: number
  stock_quantity?: number | null
  sort_order: number
}

export interface ProductDetail {
  product_id: string
  sku?: string | null
  product_name: string
  product_price: number | string | null
  has_models?: boolean
  has_priced_models?: boolean
  product_price_max?: number | string | null
  product_image?: string | null
  description?: string | null
  slug?: string | null
  video_url?: string | null
  sold_count?: number | null
  warranty_text?: string | null
  shipping_text?: string | null
  shopee_link?: string | null
  lazada_link?: string | null
  tiktok_link?: string | null
  line_link?: string | null
  category?: { category_id: string; category_name: string } | null
  product_attribute_value?: ProductAttributeValue[]
  product_gallery?: ProductGalleryItem[]
  related_products?: ProductCardData[]
  product_model?: ProductModel[]
  product_option?: ProductOption[]
}

// GET /api/footer response shape — see backend/src/routes/footer.js
export interface FooterCertification {
  title: string | null
  name: string | null
  image: string | null
}

export interface FooterSocialLink {
  platform: string | null
  url: string | null
  image: string | null
}

export interface FooterMenuLink {
  title: string | null
  url: string | null
}

export interface FooterContent {
  company: { name?: string; address?: string }
  contact: { tel?: string; fax?: string; email?: string }
  menu: FooterMenuLink[]
  certifications: FooterCertification[]
  social: FooterSocialLink[]
}

// GET /api/banners response shape — see backend/src/routes/banners.js
export interface BannerSlide {
  banner_id: string
  image: string | null
  title: string | null
  link: string | null
}

export interface ShopBranch {
  shop_id: string
  shop_name: string
  address: string
  tel: string | null
  image: string | null
  lat: number
  lon: number
}
