<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Home, ChevronRight, Save, RotateCcw, ImagePlus, Trash2 } from 'lucide-vue-next'
import { adminAPI, resolveImageUrl } from '../../services/api'
import { toast } from '../../stores/toast'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'

// เพิ่ม/แก้ไขแบนเนอร์ — หน้าฟอร์มเดี่ยว (ไม่ใช่ popup อีกต่อไป) ตามภาพอ้างอิง
// dtcshops.com seller center ที่ผู้ใช้ส่งมา ("หน้าแรก > แบนเนอร์ > ฟอร์มข้อมูล")
// ใช้แพทเทิร์นเดียวกับ AdminProductEditPage.vue — component เดียวรองรับทั้ง
// สร้าง/แก้ไข (isNew = !route.params.id)

const route = useRoute()
const router = useRouter()
const isNew = () => !route.params.id

const INDEX_OPTIONS = [1, 2, 3, 4, 5]

interface BannerRow {
  bnn_slide_code: string
  bnn_slide_desc: string
  bnn_slide_index: number | null
  pb_dt: string | null
  exp_dt: string | null
  bnn_slide_seo: string | null
  bnn_slide_end_point: string | null
  bnn_slide_information: string | null
  bnn_image_master: string | null
}

const emptyForm = () => ({
  bnn_slide_desc: '',
  pb_dt: '',
  exp_dt: '',
  bnn_slide_index: 1 as number | null,
  bnn_slide_seo: '',
  bnn_slide_end_point: '',
  bnn_slide_information: '',
})

const form = reactive(emptyForm())
const image = ref<string | null>(null)
const uploadingImage = ref(false)
const loading = ref(true)
const saving = ref(false)
const pendingImageDelete = ref(false)

// รายชื่อแบนเนอร์อื่นทั้งหมด (ไม่รวมตัวเอง) — ใช้หาว่าลำดับที่กดถูกใครถืออยู่
// กดลำดับที่มีเจ้าของอยู่แล้ว = "สลับลำดับ" กับเจ้าของเดิม ไม่ใช่บล็อกไม่ให้กด
// (ข้อมูลจริงมีหลายแถวที่ index ซ้ำกันมาก่อนแล้ว ดู routes/banners.js's
// tiebreak comment — ฟีเจอร์นี้ช่วยจัดให้ไม่ซ้ำกันทีละคู่เมื่อแอดมินแก้เอง)
const otherBanners = ref<BannerRow[]>([])
const selfId = () => (isNew() ? null : String(route.params.id))
function ownerOf(n: number): BannerRow | undefined {
  return otherBanners.value.find((b) => Number(b.bnn_slide_index) === n)
}
const swapping = ref(false)

function toDateInputValue(iso: string | null | undefined): string {
  return iso ? String(iso).slice(0, 10) : ''
}

async function load() {
  loading.value = true
  Object.assign(form, emptyForm())
  image.value = null
  try {
    const [listRes] = await Promise.all([
      adminAPI.listBanners(),
      isNew() ? Promise.resolve(null) : (async () => {
        const res = await adminAPI.getBanner(String(route.params.id))
        const b = res.data
        Object.assign(form, {
          bnn_slide_desc: b.bnn_slide_desc ?? '',
          pb_dt: toDateInputValue(b.pb_dt),
          exp_dt: toDateInputValue(b.exp_dt),
          bnn_slide_index: b.bnn_slide_index ?? 1,
          bnn_slide_seo: b.bnn_slide_seo ?? '',
          bnn_slide_end_point: b.bnn_slide_end_point ?? '',
          bnn_slide_information: b.bnn_slide_information ?? '',
        })
        image.value = b.bnn_image_master ?? null
      })(),
    ])
    const id = selfId()
    otherBanners.value = (listRes.data as BannerRow[]).filter((b) => b.bnn_slide_code !== id)
  } catch {
    toast.error(isNew() ? 'โหลดข้อมูลฟอร์มไม่สำเร็จ' : 'โหลดข้อมูลแบนเนอร์ไม่สำเร็จ')
  } finally {
    loading.value = false
  }
}
load()

async function handleImageFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  uploadingImage.value = true
  try {
    const res = await adminAPI.uploadImage(file)
    image.value = res.data.url
    toast.success('เพิ่มรูปภาพแล้ว')
  } catch {
    toast.error('อัปโหลดรูปไม่สำเร็จ')
  } finally {
    uploadingImage.value = false
  }
}
function confirmImageDelete() {
  image.value = null
  pendingImageDelete.value = false
}

// กดปุ่ม "ลำดับ N" — ถ้าลำดับนั้นมีแบนเนอร์อื่นถืออยู่ ให้สลับลำดับกัน (เจ้าของ
// เดิมย้ายไปถือลำดับที่ฟอร์มนี้ใช้อยู่ก่อนหน้า) แทนที่จะบล็อกไม่ให้กด — ต้อง
// เขียนกลับเข้า DB ทันทีที่เจ้าของเดิม (ไม่ใช่แค่ local state) เพราะแบนเนอร์
// ตัวนั้นเป็นแถวที่บันทึกอยู่แล้วจริง ไม่งั้นบันทึกฟอร์มนี้แล้วจะเกิดลำดับซ้ำ
// กันอีกเหมือนเดิม — ส่ง field เดิมของเจ้าของครบทุกตัว เพราะ PUT ทับทั้งแถว
// ไม่ใช่ partial update
async function selectIndex(n: number) {
  if (n === form.bnn_slide_index || swapping.value) return
  const owner = ownerOf(n)
  const previous = form.bnn_slide_index
  if (owner) {
    swapping.value = true
    try {
      await adminAPI.updateBanner(owner.bnn_slide_code, {
        bnn_slide_desc: owner.bnn_slide_desc,
        pb_dt: owner.pb_dt,
        exp_dt: owner.exp_dt,
        bnn_slide_index: previous,
        bnn_slide_seo: owner.bnn_slide_seo,
        bnn_slide_end_point: owner.bnn_slide_end_point,
        bnn_slide_information: owner.bnn_slide_information,
        bnn_image_master: owner.bnn_image_master,
      })
      owner.bnn_slide_index = previous
      toast.success(`สลับลำดับกับ "${owner.bnn_slide_desc}" แล้ว`)
    } catch {
      toast.error('สลับลำดับไม่สำเร็จ')
      return
    } finally {
      swapping.value = false
    }
  }
  form.bnn_slide_index = n
}

async function handleSubmit() {
  if (!form.bnn_slide_desc.trim()) {
    toast.error('กรุณากรอกข้อมูลที่จำเป็นให้ครบ')
    return
  }
  saving.value = true
  const payload = {
    bnn_slide_desc: form.bnn_slide_desc.trim(),
    pb_dt: form.pb_dt || null,
    exp_dt: form.exp_dt || null,
    bnn_slide_index: form.bnn_slide_index,
    bnn_slide_seo: form.bnn_slide_seo,
    bnn_slide_end_point: form.bnn_slide_end_point,
    bnn_slide_information: form.bnn_slide_information,
    bnn_image_master: image.value,
  }
  try {
    if (isNew()) {
      await adminAPI.createBanner(payload)
      toast.success('เพิ่มแบนเนอร์แล้ว')
    } else {
      await adminAPI.updateBanner(String(route.params.id), payload)
      toast.success('บันทึกข้อมูลแบนเนอร์แล้ว')
    }
    router.push('/admin/banners')
  } catch {
    toast.error(isNew() ? 'เพิ่มแบนเนอร์ไม่สำเร็จ' : 'บันทึกข้อมูลแบนเนอร์ไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <p v-if="loading" class="p-4 text-sm text-gray-500">กำลังโหลด...</p>

  <div v-else class="space-y-4">
    <nav class="flex items-center gap-1.5 text-sm text-gray-500">
      <Home aria-hidden="true" class="w-3.5 h-3.5" />
      <router-link to="/admin/banners" class="hover:text-brand-700 hover:underline">แบนเนอร์</router-link>
      <ChevronRight aria-hidden="true" class="w-3.5 h-3.5" />
      <span>ฟอร์มข้อมูล</span>
    </nav>

    <form @submit.prevent="handleSubmit">
      <h1 class="text-xl font-bold text-gray-800">{{ isNew() ? 'เพิ่มแบนเนอร์' : 'แก้ไขแบนเนอร์' }}</h1>

      <div class="bg-white border rounded-xl p-6 mt-6 space-y-5 max-w-7xl">
        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-center">
          <label class="text-sm text-gray-600 sm:text-right" for="bnn-desc"><span class="text-red-600">*</span>ชื่อแบนเนอร์</label>
          <input id="bnn-desc" v-model="form.bnn_slide_desc" placeholder="แบนเนอร์" class="w-full border rounded-lg px-3 py-2" />
        </div>

        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-start">
          <span class="text-sm text-gray-600 pt-2 sm:text-right"><span class="text-red-600">*</span>การเผยแพร่</span>
          <div class="grid sm:grid-cols-2 gap-4">
            <label class="text-sm space-y-1">
              <span class="text-gray-600">วันที่เริ่มต้น</span>
              <input type="date" v-model="form.pb_dt" class="w-full border rounded-lg px-3 py-2" />
            </label>
            <label class="text-sm space-y-1">
              <span class="text-gray-600">วันที่สิ้นสุด</span>
              <input type="date" v-model="form.exp_dt" class="w-full border rounded-lg px-3 py-2" />
            </label>
          </div>
        </div>

        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-center">
          <span class="text-sm text-gray-600 sm:text-right">ลำดับ</span>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="n in INDEX_OPTIONS"
              :key="n"
              type="button"
              :disabled="swapping"
              @click="selectIndex(n)"
              :title="ownerOf(n) ? `ใช้งานโดย \&quot;${ownerOf(n)!.bnn_slide_desc}\&quot; — กดเพื่อสลับลำดับ` : undefined"
              :class="[
                'px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50',
                form.bnn_slide_index === n ? 'bg-brand-700 text-white' : 'text-gray-500 hover:text-brand-700',
              ]"
            >
              ลำดับ {{ n }}
              <span v-if="ownerOf(n) && form.bnn_slide_index !== n" class="ml-0.5 text-[10px] opacity-70">↔</span>
            </button>
          </div>
        </div>

        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-center">
          <label class="text-sm text-gray-600 sm:text-right" for="bnn-seo">Banner SEO</label>
          <input id="bnn-seo" v-model="form.bnn_slide_seo" placeholder="Banner SEO" class="w-full border rounded-lg px-3 py-2" />
        </div>

        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-center">
          <label class="text-sm text-gray-600 sm:text-right" for="bnn-link">Banner link</label>
          <input id="bnn-link" v-model="form.bnn_slide_end_point" placeholder="Banner link" class="w-full border rounded-lg px-3 py-2" />
        </div>

        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-start">
          <label class="text-sm text-gray-600 pt-2 sm:text-right" for="bnn-info">รายละเอียด</label>
          <textarea id="bnn-info" v-model="form.bnn_slide_information" rows="4" placeholder="รายละเอียดแบนเนอร์" class="w-full border rounded-lg px-3 py-2" />
        </div>

        <div class="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1.5 items-start">
          <span class="text-sm text-gray-600 pt-2 sm:text-right">รูปภาพ</span>
          <div class="w-36 h-36 rounded-lg border overflow-hidden relative group">
            <img loading="lazy" decoding="async" v-if="image" :src="resolveImageUrl(image)" alt="" class="w-full h-full object-cover" />
            <label
              v-else
              class="w-full h-full border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer text-gray-500 hover:border-brand-400 hover:text-brand-500"
            >
              <ImagePlus aria-hidden="true" v-if="!uploadingImage" class="w-6 h-6" />
              <span class="text-xs">{{ uploadingImage ? 'กำลังอัปโหลด' : 'เพิ่มรูปภาพ' }}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="handleImageFile" :disabled="uploadingImage" class="hidden" />
            </label>
            <button
              v-if="image"
              type="button"
              @click="pendingImageDelete = true"
              class="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100"
              aria-label="ลบรูปภาพ"
            >
              <Trash2 aria-hidden="true" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div class="flex gap-2 pt-2">
          <button type="submit" :disabled="saving" class="flex items-center gap-1.5 bg-accent-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-accent-800 disabled:opacity-50">
            <Save aria-hidden="true" class="w-4 h-4" />
            {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
          </button>
          <router-link to="/admin/banners" class="flex items-center gap-1.5 border text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50">
            <RotateCcw aria-hidden="true" class="w-4 h-4" />
            ย้อนกลับ
          </router-link>
        </div>
      </div>
    </form>

    <ConfirmDialog
      :open="pendingImageDelete"
      message="ยืนยันการลบรูปภาพนี้?"
      @confirm="confirmImageDelete"
      @cancel="pendingImageDelete = false"
    />
  </div>
</template>
