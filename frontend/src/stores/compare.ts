// ตะกร้าเปรียบเทียบ (ช่อง = สินค้า + โมเดล) จำใน localStorage · ขนาดตาราง 2/3/4 ช่อง เพดาน 4
import { defineStore } from 'pinia'
import { toast } from './toast'
import { useLanguage } from '../language/useLanguage'

// เพดานของระบบ
const MAX_COMPARE = 4
// ขนาดตารางที่ผู้ใช้เลือกได้
export const COMPARE_SIZES = [2, 3, 4] as const
export const DEFAULT_COMPARE_SIZE = 4
const STORAGE_KEY = 'compare-storage'

// บังคับขนาดตารางให้อยู่ในช่วง 2–4
function clampSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_COMPARE_SIZE
  return Math.min(MAX_COMPARE, Math.max(COMPARE_SIZES[0], Math.round(size)))
}

export interface CompareProduct {
  product_id: string
  product_name: string
  product_image?: string
  product_price: number
  // โมเดลที่ช่องนี้เลือก (null = ไม่ระบุ) — สินค้าเดียวกันอยู่ได้หลายช่องคนละโมเดล
  model_id?: string | null
}

// ช่องเดียวกัน = สินค้าและโมเดลตรงกัน (undefined กับ null ถือว่าเท่ากัน)
function sameSlot(a: { product_id: string; model_id?: string | null }, b: { product_id: string; model_id?: string | null }) {
  return a.product_id === b.product_id && (a.model_id ?? null) === (b.model_id ?? null)
}

// key ของช่อง ใช้เป็น :key ของ Vue
export function compareItemKey(item: { product_id: string; model_id?: string | null }) {
  return `${item.product_id}:${item.model_id ?? 'base'}`
}

// โหลดตะกร้าที่บันทึกไว้
function loadPersisted(): { items: CompareProduct[]; capacity: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { items: [], capacity: DEFAULT_COMPARE_SIZE }
    const parsed = JSON.parse(raw)
    // ข้อมูลเก่าที่ยังไม่มี capacity = 4 ช่อง
    const capacity = clampSize(Number(parsed.capacity ?? DEFAULT_COMPARE_SIZE))
    const items: CompareProduct[] = parsed.items ?? []
    return { items: items.slice(0, capacity), capacity }
  } catch {
    return { items: [], capacity: DEFAULT_COMPARE_SIZE }
  }
}

export const useCompareStore = defineStore('compare', {
  state: () => {
    const persisted = loadPersisted()
    return {
      items: persisted.items as CompareProduct[],
      // จำนวนช่องที่ผู้ใช้เลือก (2–4)
      capacity: persisted.capacity,
    }
  },

  actions: {
    // บันทึกลง localStorage
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: this.items, capacity: this.capacity }))
    },

    // เปลี่ยนขนาดตาราง — ย่อแล้วตัดสินค้าท้ายรายการทิ้ง (ผู้เรียกต้องถามยืนยันเอง)
    setCapacity(size: number) {
      const next = clampSize(size)
      this.capacity = next
      if (this.items.length > next) this.items = this.items.slice(0, next)
      this.persist()
    },

    // เพิ่มช่อง (ซ้ำเป๊ะ = ปฏิเสธ) · grow = ตารางเต็มให้ขยายเองถึง 4 (หน้าเปรียบเทียบส่ง false เพราะผู้ใช้เพิ่งเลือกขนาดเอง)
    addItem(product: CompareProduct, { grow = true }: { grow?: boolean } = {}) {
      const { langs } = useLanguage()
      if (this.items.some((i) => sameSlot(i, product))) {
        toast.error(langs('compareAlreadyAdded'))
        return
      }
      let grew = false
      if (this.items.length >= this.capacity) {
        if (!grow || this.capacity >= MAX_COMPARE) {
          toast.error(langs('compareMaxReached', { n: this.capacity }))
          return
        }
        this.capacity = clampSize(this.items.length + 1)
        grew = true
      }
      this.items.push(product)
      this.persist()
      // ขยายให้แล้วต้องบอกผู้ใช้
      toast.success(grew ? langs('compareSizeGrown', { n: this.capacity }) : langs('compareItemAdded'))
    },

    // เอาสินค้าออกทุกช่อง ไม่สนโมเดล
    removeItem(product_id: string) {
      this.items = this.items.filter((i) => i.product_id !== product_id)
      this.persist()
    },

    // เอาออกเฉพาะช่องที่ตรงทั้งสินค้าและโมเดล
    removeItemExact(product_id: string, model_id?: string | null) {
      const index = this.items.findIndex((i) => sameSlot(i, { product_id, model_id }))
      if (index === -1) return
      this.items.splice(index, 1)
      this.persist()
    },

    // ตั้งรายการจากลิงก์แชร์ — มากกว่าขนาดตารางให้ขยายตาม (ไม่เกิน 4)
    setItems(items: CompareProduct[]) {
      const trimmed = items.slice(0, MAX_COMPARE)
      if (trimmed.length > this.capacity) this.capacity = clampSize(trimmed.length)
      this.items = trimmed
      this.persist()
    },

    // แทนที่ช่องเดิมในตำแหน่งเดิม (ปุ่ม "เปลี่ยนสินค้า")
    replaceItem(oldProductId: string, oldModelId: string | null | undefined, newProduct: CompareProduct) {
      const index = this.items.findIndex((i) => sameSlot(i, { product_id: oldProductId, model_id: oldModelId }))
      if (index === -1) return
      this.items.splice(index, 1, newProduct)
      this.persist()
    },

    // เปลี่ยนโมเดลของช่องเดิม คงตำแหน่ง
    setItemModel(product_id: string, oldModelId: string | null | undefined, newModelId: string, price: number) {
      const index = this.items.findIndex((i) => sameSlot(i, { product_id, model_id: oldModelId }))
      if (index === -1) return
      this.items[index] = { ...this.items[index], model_id: newModelId, product_price: price }
      this.persist()
    },

    // สลับโมเดลระหว่าง 2 ช่องของสินค้าเดียวกัน (เลือกโมเดลที่อีกช่องถืออยู่) — หาตำแหน่งทั้งคู่ก่อนค่อยเขียน
    swapItemModels(
      product_id: string,
      modelIdA: string | null | undefined,
      modelIdB: string | null | undefined,
      priceA: number,
      priceB: number
    ) {
      const indexA = this.items.findIndex((i) => sameSlot(i, { product_id, model_id: modelIdA }))
      const indexB = this.items.findIndex((i) => sameSlot(i, { product_id, model_id: modelIdB }))
      if (indexA === -1 || indexB === -1 || indexA === indexB) return
      this.items[indexA] = { ...this.items[indexA], model_id: modelIdB ?? null, product_price: priceB }
      this.items[indexB] = { ...this.items[indexB], model_id: modelIdA ?? null, product_price: priceA }
      this.persist()
    },

    // ล้างตะกร้า
    clearAll() {
      this.items = []
      this.persist()
    },

    // สินค้านี้อยู่ในตะกร้าไหม (โมเดลใดก็ได้)
    isInCompare(product_id: string) {
      return this.items.some((i) => i.product_id === product_id)
    },

    // สินค้า + โมเดลนี้อยู่ในตะกร้าแล้วไหม
    isExactInCompare(product_id: string, model_id?: string | null) {
      return this.items.some((i) => sameSlot(i, { product_id, model_id }))
    },
  },
})
