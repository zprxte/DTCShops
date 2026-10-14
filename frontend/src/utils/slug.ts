// ชื่อ → slug ภาษาอังกฤษ ("Hikvision K2" → "hikvision-k2") ตัดอักษรไทยทิ้ง
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ส่วนของ URL หน้าสินค้า: ใช้ slug จาก DB · ไม่มีใช้ product_id (backend รับได้ทั้งคู่)
export function productSlug(product: { product_id: string; product_name: string; slug?: string | null }): string {
  return product.slug || product.product_id
}
