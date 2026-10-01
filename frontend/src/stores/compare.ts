import { defineStore } from 'pinia'
import { toast } from './toast'
import { useLanguage } from '../language/useLanguage'

// เพดานแข็งของระบบ — ตารางเปรียบเทียบกว้างสุดได้ 4 ช่อง
const MAX_COMPARE = 4
// ขนาดตารางที่ผู้ใช้เลือกได้ (คำขออาจารย์ 14 ก.ย. 2026) — จำนวนช่องของตาราง
// เปรียบเทียบไม่ใช่ 4 ตายตัวอีกต่อไป ผู้ใช้กำหนดเองได้ว่าจะเทียบกี่ชิ้น
export const COMPARE_SIZES = [2, 3, 4] as const
export const DEFAULT_COMPARE_SIZE = 4
const STORAGE_KEY = 'compare-storage'

function clampSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_COMPARE_SIZE
  return Math.min(MAX_COMPARE, Math.max(COMPARE_SIZES[0], Math.round(size)))
}

export interface CompareProduct {
  product_id: string
  product_name: string
  product_image?: string
  product_price: number
  // Added 2026-08-27 — which model this compare slot is pinned to
  // (see [[product-model-group]]). undefined/null means "no specific
  // model chosen" (shows the product's own/starting price). Lets the SAME
  // product appear as two different compare columns at once, one per model,
  // which product_id alone couldn't distinguish before this.
  model_id?: string | null
}

// Two slots are "the same slot" only if both product_id AND model_id
// match — undefined and null are treated as equivalent ("no model chosen"),
// since callers use either interchangeably (component state tends to use
// null, API/store defaults tend to use undefined).
function sameSlot(a: { product_id: string; model_id?: string | null }, b: { product_id: string; model_id?: string | null }) {
  return a.product_id === b.product_id && (a.model_id ?? null) === (b.model_id ?? null)
}

// Stable key for a compare slot, for use as a Vue :key or map key — see
// sameSlot() above for the equivalence this must mirror.
export function compareItemKey(item: { product_id: string; model_id?: string | null }) {
  return `${item.product_id}:${item.model_id ?? 'base'}`
}

function loadPersisted(): { items: CompareProduct[]; capacity: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { items: [], capacity: DEFAULT_COMPARE_SIZE }
    const parsed = JSON.parse(raw)
    // ข้อมูลเก่าที่บันทึกไว้ก่อนมีฟีเจอร์เลือกขนาดตารางจะไม่มี capacity — ถือเป็น 4 ช่องตามเดิม
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
      //จำนวนช่องของตารางเปรียบเทียบที่ผู้ใช้เลือกไว้ (2–4) จำค่าข้ามการเข้าเว็บครั้งถัดไป
      capacity: persisted.capacity,
    }
  },

  actions: {
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: this.items, capacity: this.capacity }))
    },

    // เปลี่ยนขนาดตารางเปรียบเทียบ (2/3/4 ช่อง) — ถ้าย่อลงจนช่องไม่พอ จะตัดสินค้า
    // "ท้ายรายการ" ทิ้งให้เหลือเท่าขนาดใหม่ ผู้เรียกต้องถามยืนยันผู้ใช้ก่อนเอง
    // (ComparePage ถามผ่านป็อปอัปยืนยัน) เพราะที่นี่ไม่ควรมี UI
    setCapacity(size: number) {
      const next = clampSize(size)
      this.capacity = next
      if (this.items.length > next) this.items = this.items.slice(0, next)
      this.persist()
    },

    // Rejects an exact duplicate slot (same product AND same model already
    // present) instead of silently wasting one of the 4 slots on it — added
    // 2026-08-27 alongside per-model compare slots, since addItem() no
    // longer implicitly can't collide just by product_id.
    // `grow` = ตารางเต็มแล้วให้ "ขยายขนาดตารางเอง" ได้ไหม (ไม่เกินเพดาน 4)
    //
    // เปิดเป็นค่าเริ่มต้นเพราะผู้ใช้ที่กดปุ่มเปรียบเทียบจากหน้าแรก/หน้าสินค้ามองไม่เห็น
    // ตัวเลือกขนาดตาราง การขึ้น "เปรียบเทียบได้สูงสุด 2 สินค้า" ตรงนั้นจึงเป็นการปฏิเสธ
    // ด้วยกติกาที่เขาไม่รู้ว่ามีอยู่ และไม่มีทางแก้จากหน้าที่ยืนอยู่
    //
    // ฝั่งหน้าเปรียบเทียบส่ง grow: false เพราะตัวเลือกขนาดตารางอยู่ตรงหน้าต่อรอง —
    // ที่นั่นขนาดคือสิ่งที่ผู้ใช้เพิ่งเลือกเอง ระบบไม่ควรไปเปลี่ยนให้เอง
    addItem(product: CompareProduct, { grow = true }: { grow?: boolean } = {}) {
      const { langs } = useLanguage()
      if (this.items.some((i) => sameSlot(i, product))) {
        toast.error(langs('compareAlreadyAdded'))
        return
      }
      let grew = false
      if (this.items.length >= this.capacity) {
        // เพดาน 4 ยังเป็นเพดานจริงเสมอ grow ขยายได้แค่ถึงเพดาน ไม่ทะลุ
        if (!grow || this.capacity >= MAX_COMPARE) {
          toast.error(langs('compareMaxReached', { n: this.capacity }))
          return
        }
        this.capacity = clampSize(this.items.length + 1)
        grew = true
      }
      this.items.push(product)
      this.persist()
      // ขยายให้แล้วต้องบอก ไม่งั้นผู้ใช้เปิดหน้าเปรียบเทียบมาเจอตารางกว้างกว่าที่ตั้งไว้
      // โดยไม่รู้ว่าเกิดจากอะไร
      toast.success(grew ? langs('compareSizeGrown', { n: this.capacity }) : langs('compareItemAdded'))
    },

    // Removes every slot for this product, regardless of model — for callers
    // (ProductCard, ProductDetailPage's generic toggle) that only know the
    // product_id and mean "take this product out of comparison entirely."
    removeItem(product_id: string) {
      this.items = this.items.filter((i) => i.product_id !== product_id)
      this.persist()
    },

    // Removes exactly one slot (product + model) — for callers that know
    // precisely which slot they mean, like ComparePage's per-column "X"
    // button or a model-aware toggle, where two slots can share a
    // product_id and only one should go.
    removeItemExact(product_id: string, model_id?: string | null) {
      const index = this.items.findIndex((i) => sameSlot(i, { product_id, model_id }))
      if (index === -1) return
      this.items.splice(index, 1)
      this.persist()
    },

    // ใช้ตอนกู้รายการจากลิงก์แชร์ — ลิงก์ที่มีสินค้ามากกว่าขนาดตารางที่ตั้งไว้
    // ให้ "ขยาย" ตารางตามลิงก์ (ไม่เกิน 4) แทนที่จะตัดสินค้าของลิงก์ทิ้งเงียบๆ
    setItems(items: CompareProduct[]) {
      const trimmed = items.slice(0, MAX_COMPARE)
      if (trimmed.length > this.capacity) this.capacity = clampSize(trimmed.length)
      this.items = trimmed
      this.persist()
    },

    // Swaps one slot out for another in place — added 27 ส.ค. 2026 for the
    // compare table's "เปลี่ยนสินค้า" feature. Unlike removeItem()+addItem(),
    // this keeps the replacement in the SAME column position instead of
    // bumping it to the end, since the whole point is "I want a different
    // product right here, not a different comparison order." Matches by
    // exact slot (product + model) now that a product can occupy more than
    // one column.
    replaceItem(oldProductId: string, oldModelId: string | null | undefined, newProduct: CompareProduct) {
      const index = this.items.findIndex((i) => sameSlot(i, { product_id: oldProductId, model_id: oldModelId }))
      if (index === -1) return
      this.items.splice(index, 1, newProduct)
      this.persist()
    },

    // Changes just the model pinned to an existing slot, keeping its column
    // position — the compare table's per-column model <select>, now that a
    // slot's model is part of the store rather than transient component
    // state (so two columns of the same product don't fight over one
    // Record<product_id, model_id> entry).
    setItemModel(product_id: string, oldModelId: string | null | undefined, newModelId: string, price: number) {
      const index = this.items.findIndex((i) => sameSlot(i, { product_id, model_id: oldModelId }))
      if (index === -1) return
      this.items[index] = { ...this.items[index], model_id: newModelId, product_price: price }
      this.persist()
    },

    // สลับโมเดลกันระหว่าง 2 ช่องของ "สินค้าตัวเดียวกัน" — ใช้ตอนผู้ใช้เลือกโมเดล
    // ที่อีกคอลัมน์ถืออยู่แล้ว: แทนที่จะปล่อยให้เกิด 2 คอลัมน์เหมือนกันเป๊ะ
    // (สินค้าเดียวกัน + โมเดลเดียวกัน) ให้อีกคอลัมน์รับโมเดลเดิมของคอลัมน์นี้ไปแทน
    // หาตำแหน่งทั้งคู่ให้ครบก่อนแล้วค่อยเขียน เพราะถ้าทยอยเขียนทีละช่องจะมีจังหวะที่
    // ทั้งสองช่องถือโมเดลเดียวกัน ทำให้ค้นหาช่องที่สองเจอผิดตัว
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

    clearAll() {
      this.items = []
      this.persist()
    },

    // "Is this product in compare at all, any model?" — for generic
    // add/remove buttons (ProductCard, ProductDetailPage) that don't track
    // which specific model.
    isInCompare(product_id: string) {
      return this.items.some((i) => i.product_id === product_id)
    },

    // "Is this EXACT product+model combination already a slot?" — for the
    // compare-page picker's model-choice step, where re-adding the same
    // product with a DIFFERENT model should be allowed.
    isExactInCompare(product_id: string, model_id?: string | null) {
      return this.items.some((i) => sameSlot(i, { product_id, model_id }))
    },
  },
})
