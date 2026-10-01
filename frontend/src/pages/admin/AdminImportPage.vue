<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold text-gray-800">นำเข้าสินค้าจาก Excel</h1>

    <!-- 1. ดาวน์โหลดเทมเพลต -->
    <section class="bg-white border rounded-xl p-5 space-y-3">
      <h2 class="font-semibold text-gray-800">1. ดาวน์โหลดเทมเพลต</h2>
      <ul class="text-sm text-gray-600 list-disc pl-5 space-y-1">
        <li>ไฟล์มีสินค้าและค่าคุณสมบัติปัจจุบันเติมไว้แล้ว แก้ต่อในไฟล์ได้เลย แถวที่ไม่ได้แก้จะถูกข้ามเอง</li>
        <li><b>1 ชีตต่อ 1 หมวดหมู่</b> · หัว<span class="text-blue-700 font-medium">สีน้ำเงิน</span> = ข้อมูลสินค้า · หัว<span class="text-green-700 font-medium">สีเขียว</span> = หัวข้อคุณสมบัติที่หมวดนั้นใช้อยู่</li>
        <li>เพิ่มสินค้าใหม่: พิมพ์แถวใหม่ต่อท้ายในชีตของหมวดนั้น · แก้สินค้าเดิม: แก้ในแถวเดิมได้เลย · ช่องที่เว้นว่าง = ไม่แก้ค่าเดิม</li>
        <li><code>product_id</code> (หัวสีเทา) ระบบใช้ระบุสินค้าเดิม ไม่ต้องกรอก — สินค้าใหม่เว้นว่าง · คัดลอกแถวเดิมมาทำสินค้าใหม่ได้ แต่ต้องลบ <code>product_id</code> ของแถวใหม่ออก</li>
        <li>เพิ่มหัวข้อคุณสมบัติ: เลือกหรือพิมพ์ชื่อในหัวคอลัมน์ว่างถัดจากคอลัมน์สีเขียว — ชื่อใหม่จะถูกถามในขั้นตรวจรายการ</li>
        <li><code>product_image</code> ใส่ลิงก์รูป ระบบจะดาวน์โหลดมาเก็บเองตอนกดยืนยัน (jpeg/png/webp/gif ไม่เกิน 5MB)</li>
        <li>ภาพย่อย โมเดล และตัวเลือกสินค้า ยังต้องจัดการในหน้าแก้ไขสินค้า</li>
      </ul>
      <button
        type="button"
        @click="downloadTemplate"
        :disabled="downloading"
        class="flex items-center gap-1.5 border border-brand-700 text-brand-700 text-sm px-4 py-2 rounded-lg hover:bg-brand-50 disabled:opacity-50"
      >
        <Download aria-hidden="true" class="w-4 h-4" />
        {{ downloading ? 'กำลังสร้างไฟล์...' : 'ดาวน์โหลดเทมเพลต (.xlsx)' }}
      </button>
    </section>

    <!-- 2. อัปโหลด -->
    <section class="bg-white border rounded-xl p-5 space-y-3">
      <h2 class="font-semibold text-gray-800">2. อัปโหลดไฟล์เพื่อตรวจก่อนบันทึก</h2>
      <label
        :class="[
          'flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-8 text-sm cursor-pointer transition-colors',
          dragging
            ? 'border-brand-500 bg-brand-50'
            : loaded
              ? 'border-green-500 bg-green-50 hover:bg-green-100/60'
              : 'border-gray-300 hover:border-brand-400',
        ]"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <template v-if="loaded">
          <CheckCircle2 aria-hidden="true" class="w-8 h-8 text-green-600" />
          <span class="text-green-800 font-semibold">อ่านไฟล์แล้ว</span>
          <span class="flex items-center gap-1.5 bg-white border border-green-300 rounded-lg px-3 py-1.5 max-w-full min-w-0">
            <FileSpreadsheet aria-hidden="true" class="w-4 h-4 text-green-700 shrink-0" />
            <span class="font-medium text-gray-800 truncate min-w-0">{{ fileName }}</span>
            <button
              type="button"
              class="ml-1 p-0.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 shrink-0"
              aria-label="ล้างไฟล์ที่เลือก"
              title="ล้างไฟล์ที่เลือก"
              @click.prevent.stop="reset"
            >
              <X aria-hidden="true" class="w-4 h-4" />
            </button>
          </span>
          <span class="text-xs text-green-800">
            สินค้า {{ rows?.products.length ?? 0 }} แถว · ค่าคุณสมบัติ {{ rows?.specs.length ?? 0 }} ช่อง — ตรวจรายการด้านล่างก่อนกดบันทึก
          </span>
          <span class="text-xs text-gray-500">คลิกหรือลากไฟล์ใหม่มาวางเพื่อเปลี่ยนไฟล์</span>
        </template>
        <template v-else>
          <FileSpreadsheet aria-hidden="true" class="w-8 h-8 text-gray-400" />
          <span class="text-gray-600">{{ parsing ? 'กำลังอ่านไฟล์...' : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์ .xlsx' }}</span>
        </template>
        <input ref="fileInput" type="file" accept=".xlsx" class="sr-only" @change="onPick" />
      </label>
    </section>

    <!-- 3. พรีวิว -->
    <template v-if="plan">
      <section ref="reviewSection" class="bg-white border rounded-xl p-5 space-y-4 scroll-mt-20">
        <h2 class="font-semibold text-gray-800">3. ตรวจรายการก่อนบันทึก</h2>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div class="rounded-lg bg-green-50 px-3 py-2">
            <div class="text-green-800 font-semibold text-lg">{{ plan.summary.product_create }}</div>
            <div class="text-green-800">สินค้าใหม่</div>
          </div>
          <div class="rounded-lg bg-blue-50 px-3 py-2">
            <div class="text-blue-800 font-semibold text-lg">{{ plan.summary.product_update }}</div>
            <div class="text-blue-800">สินค้าที่แก้</div>
          </div>
          <div class="rounded-lg bg-gray-50 px-3 py-2">
            <div class="text-gray-700 font-semibold text-lg">{{ plan.summary.spec_create + plan.summary.spec_update }}</div>
            <div class="text-gray-700">ค่าคุณสมบัติที่เพิ่ม/แก้</div>
          </div>
          <div :class="['rounded-lg px-3 py-2', errorCount ? 'bg-red-50' : 'bg-gray-50']">
            <div :class="['font-semibold text-lg', errorCount ? 'text-red-700' : 'text-gray-700']">{{ errorCount }}</div>
            <div :class="errorCount ? 'text-red-700' : 'text-gray-700'">แถวที่ผิดพลาด</div>
          </div>
        </div>
        <p class="text-xs text-gray-500">
          ไม่เปลี่ยน: สินค้า {{ plan.summary.product_unchanged }} แถว · คุณสมบัติ {{ plan.summary.spec_unchanged }} ช่อง (ข้ามไป ไม่บันทึกซ้ำ)
        </p>

        <!-- หัวข้อสเปคที่ยังไม่มีในระบบ -->
        <div v-if="plan.unknown_attributes.length" class="border border-amber-300 bg-amber-50 rounded-xl p-4 space-y-3">
          <p class="text-sm text-amber-900 font-medium">
            พบหัวข้อคุณสมบัติที่ยังไม่มีในระบบ {{ plan.unknown_attributes.length }} หัวข้อ — เลือกว่าหมายถึงหัวข้อไหน หรือจะสร้างหัวข้อใหม่
          </p>
          <div v-for="u in plan.unknown_attributes" :key="u.name" class="bg-white rounded-lg border p-3 space-y-2 text-sm">
            <p class="text-gray-800">
              <b>"{{ u.name }}"</b>
              <span class="text-gray-500"> · ใช้ที่ {{ u.rows.slice(0, 5).join(', ') }}{{ u.rows.length > 5 ? ` และอีก ${u.rows.length - 5} ช่อง` : '' }}</span>
              <span v-if="u.samples?.length" class="block text-xs text-gray-500">ค่าในไฟล์: {{ u.samples.join(' · ') }}</span>
            </p>
            <div class="flex flex-wrap gap-x-5 gap-y-2">
              <label v-for="s in u.suggestions" :key="s.attribute_id" class="flex items-center gap-1.5">
                <input type="radio" :name="`attr-${u.name}`" :checked="choiceOf(u.name) === String(s.attribute_id)" @change="setChoice(u.name, String(s.attribute_id))" />
                หมายถึง "{{ s.attribute_name }}" ใช่ไหม?
                <span class="text-xs text-gray-500">({{ reasonText(s.reasons) }})</span>
              </label>
              <span v-if="!u.suggestions.length" class="text-gray-500">ไม่พบหัวข้อที่ใกล้เคียง</span>
              <label class="flex items-center gap-1.5">
                <input type="radio" :name="`attr-${u.name}`" :checked="choiceOf(u.name) === 'create'" @change="setChoice(u.name, 'create')" />
                สร้างหัวข้อใหม่ "{{ u.name }}"
              </label>
              <div class="flex items-center gap-1.5 w-full sm:w-auto">
                <span class="text-gray-600 whitespace-nowrap">หรือพิมพ์ค้นหาหัวข้ออื่น:</span>
                <!-- พิมพ์กรองได้ แทน dropdown ยาวร้อยกว่ารายการ · เลือกได้เฉพาะชื่อที่มีอยู่จริง -->
                <AttributeNameCombobox
                  :model-value="otherText[u.name] ?? otherChoiceName(u)"
                  :options="attributeNames"
                  placeholder="เช่น ความละเอียด"
                  :aria-label="`ค้นหาหัวข้อที่ตรงกับ ${u.name}`"
                  class="w-64"
                  @update:model-value="(text: string) => onOtherText(u.name, text)"
                />
              </div>
            </div>
          </div>
        </div>

        <label class="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" v-model="hideUnchanged" />
          ซ่อนแถวที่ไม่เปลี่ยน
        </label>

        <!-- ตารางสินค้า -->
        <div class="space-y-2">
          <h3 class="text-sm font-semibold text-gray-700">ข้อมูลสินค้า</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-500 border-b">
                  <th class="py-2 pr-3 font-medium w-40">ตำแหน่งในไฟล์</th>
                  <th class="py-2 pr-3 font-medium w-28">สถานะ</th>
                  <th class="py-2 pr-3 font-medium">สินค้า</th>
                  <th class="py-2 font-medium">สิ่งที่จะเปลี่ยน / ปัญหา</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="visibleProducts.length === 0"><td colspan="4" class="py-4 text-center text-gray-500">ไม่มีแถวที่ต้องบันทึก</td></tr>
                <tr v-for="p in visibleProducts" :key="p.row" class="border-b last:border-0 align-top">
                  <td class="py-2 pr-3 text-gray-500">{{ p.row }}</td>
                  <td class="py-2 pr-3"><span :class="['inline-block rounded-full px-2 py-0.5 text-xs font-medium', BADGE[p.action]]">{{ ACTION_LABEL[p.action] }}</span></td>
                  <td class="py-2 pr-3">
                    <div class="text-gray-800">{{ p.product_name || '—' }}</div>
                    <div v-if="p.product_id" class="text-xs text-gray-500">{{ p.product_id }}</div>
                  </td>
                  <td class="py-2">
                    <ul v-if="p.errors.length" class="text-red-700 space-y-0.5">
                      <li v-for="e in p.errors" :key="e">{{ e }}</li>
                    </ul>
                    <ul v-else class="space-y-0.5 text-gray-700">
                      <li v-for="c in p.changes" :key="c.field">
                        <span class="text-gray-500 mr-1">{{ c.label }}:</span>
                        <template v-if="p.action === 'update'">
                          <span class="text-gray-500 line-through">{{ short(c.from) }}</span> → <span>{{ short(c.to) }}</span>
                        </template>
                        <span v-else>{{ short(c.to) }}</span>
                      </li>
                    </ul>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ตารางสเปค -->
        <div class="space-y-2">
          <h3 class="text-sm font-semibold text-gray-700">ค่าคุณสมบัติ</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-500 border-b">
                  <th class="py-2 pr-3 font-medium w-40">ตำแหน่งในไฟล์</th>
                  <th class="py-2 pr-3 font-medium w-28">สถานะ</th>
                  <th class="py-2 pr-3 font-medium">สินค้า</th>
                  <th class="py-2 pr-3 font-medium">หัวข้อ</th>
                  <th class="py-2 font-medium">ค่า / ปัญหา</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="visibleSpecs.length === 0"><td colspan="5" class="py-4 text-center text-gray-500">ไม่มีแถวที่ต้องบันทึก</td></tr>
                <tr v-for="(s, i) in visibleSpecs" :key="`${s.row}|${s.attribute_name}|${i}`" class="border-b last:border-0 align-top">
                  <td class="py-2 pr-3 text-gray-500">{{ s.row }}</td>
                  <td class="py-2 pr-3"><span :class="['inline-block rounded-full px-2 py-0.5 text-xs font-medium', BADGE[s.action]]">{{ ACTION_LABEL[s.action] }}</span></td>
                  <td class="py-2 pr-3">
                    <div class="text-gray-800">{{ s.product_name || '—' }}</div>
                    <div v-if="s.product_id" class="text-xs text-gray-500">{{ s.product_id }}</div>
                    <div v-else-if="s.new_product_row" class="text-xs text-gray-500">สินค้าใหม่</div>
                  </td>
                  <td class="py-2 pr-3 text-gray-800">
                    {{ s.attribute_name }}
                    <div v-if="s.mapped_from" class="text-xs text-gray-500">จากชื่อในไฟล์ "{{ s.mapped_from }}"</div>
                    <div v-if="s.new_attribute" class="text-xs text-amber-700">หัวข้อใหม่</div>
                  </td>
                  <td class="py-2">
                    <ul v-if="s.errors.length" class="text-red-700 space-y-0.5">
                      <li v-for="e in s.errors" :key="e">{{ e }}</li>
                    </ul>
                    <span v-else-if="s.action === 'pending'" class="text-amber-700">{{ short(s.to) }} (รอเลือกหัวข้อด้านบน)</span>
                    <span v-else-if="s.action === 'update'"><span class="text-gray-500 line-through">{{ short(s.from) }}</span> → {{ short(s.to) }}</span>
                    <span v-else class="text-gray-700">{{ short(s.to) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-3 pt-3 border-t">
          <p class="text-sm text-gray-600 mr-auto">{{ statusMessage }}</p>
          <button type="button" @click="reset" class="px-4 py-2 text-sm rounded-lg border text-gray-600 hover:bg-gray-50">ยกเลิก</button>
          <button
            type="button"
            @click="commit"
            :disabled="!plan.ready || committing || planning"
            class="bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50"
          >
            {{ committing ? 'กำลังบันทึก...' : 'ยืนยันนำเข้า' }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
// นำเข้าสินค้า + สเปคจาก Excel (A10 ทำกลับมา 25 ก.ย. 2026)
// ขั้นตอน: ดาวน์โหลดเทมเพลต → อัปโหลด (/parse ยังไม่เขียน) → เลือกหัวข้อสเปคที่ไม่รู้จัก
// (/plan คำนวณใหม่ทุกครั้งที่เลือก) → ยืนยัน (/commit ตรวจซ้ำฝั่ง server แล้วเขียนใน transaction เดียว)
// หน้าพรีวิวนี้คือขั้นยืนยันในตัว จึงไม่มีป็อปอัปถามซ้ำ
import { computed, nextTick, ref } from 'vue'
import { CheckCircle2, Download, FileSpreadsheet, X } from 'lucide-vue-next'
import { adminAPI } from '../../services/api'
import { toast } from '../../stores/toast'
import AttributeNameCombobox from '../../components/common/AttributeNameCombobox.vue'

type Action = 'create' | 'update' | 'unchanged' | 'error' | 'pending'
interface Change { field: string; label: string; from: unknown; to: unknown }
interface ProductPlan { row: string; action: Action; product_id: string | null; product_name: string | null; changes: Change[]; errors: string[] }
interface SpecPlan {
  row: string; action: Action; product_id: string | null; product_name: string | null; new_product_row?: string
  attribute_name: string; mapped_from?: string; new_attribute?: boolean; from: string | null; to: string; errors: string[]
}
interface Unknown { name: string; rows: string[]; samples?: string[]; suggestions: { attribute_id: number; attribute_name: string; reasons?: string[] }[] }
interface Plan {
  products: ProductPlan[]; specs: SpecPlan[]; unknown_attributes: Unknown[]; ready: boolean
  summary: Record<'product_create' | 'product_update' | 'product_unchanged' | 'product_error' | 'spec_create' | 'spec_update' | 'spec_unchanged' | 'spec_error' | 'spec_pending', number>
}

const ACTION_LABEL: Record<Action, string> = { create: 'เพิ่มใหม่', update: 'แก้ไข', unchanged: 'ไม่เปลี่ยน', error: 'ผิดพลาด', pending: 'รอเลือกหัวข้อ' }
const BADGE: Record<Action, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  unchanged: 'bg-gray-100 text-gray-600',
  error: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-800',
}

const downloading = ref(false)
const parsing = ref(false)
const planning = ref(false)
const committing = ref(false)
const dragging = ref(false)
const hideUnchanged = ref(true)
const fileInput = ref<HTMLInputElement | null>(null)
const reviewSection = ref<HTMLElement | null>(null)
const fileName = ref('')
const rows = ref<{ products: unknown[]; specs: unknown[] } | null>(null)
const plan = ref<Plan | null>(null)
const loaded = computed(() => !!fileName.value && !parsing.value && !dragging.value)
// ชื่อหัวข้อตามไฟล์ → รหัสหัวข้อเดิม (string) หรือ 'create'
const choices = ref<Record<string, string>>({})
const attributes = ref<{ attribute_id: number; attribute_name: string }[]>([])

const errorCount = computed(() => (plan.value ? plan.value.summary.product_error + plan.value.summary.spec_error : 0))
const visibleProducts = computed(() => (plan.value?.products ?? []).filter((p) => !hideUnchanged.value || p.action !== 'unchanged'))
const visibleSpecs = computed(() => (plan.value?.specs ?? []).filter((s) => !hideUnchanged.value || s.action !== 'unchanged'))
const statusMessage = computed(() => {
  const p = plan.value
  if (!p) return ''
  if (errorCount.value) return `แก้ ${errorCount.value} แถวที่ผิดพลาดในไฟล์ แล้วอัปโหลดใหม่`
  if (p.summary.spec_pending) return 'เลือกหัวข้อคุณสมบัติที่ยังไม่มีในระบบให้ครบก่อน'
  if (!p.ready) return 'ไฟล์นี้ไม่มีอะไรต้องบันทึก — ทุกแถวตรงกับข้อมูลในระบบแล้ว'
  return 'พร้อมบันทึก'
})

// ข้อความยาว (เช่น รายละเอียดสินค้า) ตัดให้พอดีตาราง
function short(value: unknown) {
  if (value === null || value === undefined || value === '') return '(ว่าง)'
  const text = String(value).replace(/\s+/g, ' ')
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

async function downloadTemplate() {
  downloading.value = true
  try {
    const res = await adminAPI.downloadImportTemplate()
    const disposition = String(res.headers['content-disposition'] ?? '')
    const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'product-import.xlsx'
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.error('ดาวน์โหลดเทมเพลตไม่สำเร็จ')
  } finally {
    downloading.value = false
  }
}

function onPick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) parse(file)
}
function onDrop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) parse(file)
}

async function parse(file: File) {
  if (!/\.xlsx$/i.test(file.name)) {
    toast.error('รองรับเฉพาะไฟล์ .xlsx')
    return
  }
  parsing.value = true
  try {
    const [res, attrRes] = await Promise.all([adminAPI.parseImportFile(file), adminAPI.listAttributes()])
    fileName.value = res.data.file_name
    rows.value = res.data.rows
    plan.value = res.data.plan
    attributes.value = attrRes.data
    choices.value = {}
    otherText.value = {}
    await nextTick()
    reviewSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (err: any) {
    toast.error(err?.response?.data?.message ?? 'อ่านไฟล์ไม่สำเร็จ')
  } finally {
    parsing.value = false
    // เลือกไฟล์เดิมซ้ำ (แก้แล้วอัปโหลดใหม่) ต้องยิง change ได้อีก
    if (fileInput.value) fileInput.value.value = ''
  }
}

function attributeMap() {
  return Object.fromEntries(
    Object.entries(choices.value)
      .filter(([, v]) => v)
      .map(([name, v]) => [name, v === 'create' ? { create: true } : { attribute_id: Number(v) }])
  )
}

function choiceOf(name: string) {
  return choices.value[name] ?? ''
}
// ช่องค้นหาหัวข้ออื่น — ข้อความที่กำลังพิมพ์ต่อหัวข้อ (undefined = ยังไม่ได้พิมพ์ ให้แสดงชื่อที่เลือกไว้)
const otherText = ref<Record<string, string>>({})
const attributeNames = computed(() => attributes.value.map((a) => a.attribute_name))
const attributeByName = computed(() => new Map(attributes.value.map((a) => [a.attribute_name.trim().toLowerCase(), a])))

// ชื่อที่ช่องค้นหาควรแสดง — เฉพาะตอนเลือกหัวข้อที่ไม่ได้อยู่ในปุ่มแนะนำ
function otherChoiceName(u: Unknown) {
  const v = choiceOf(u.name)
  if (!v || v === 'create' || u.suggestions.some((s) => String(s.attribute_id) === v)) return ''
  return attributes.value.find((a) => String(a.attribute_id) === v)?.attribute_name ?? ''
}

// พิมพ์/เลือกในช่องค้นหา — ตรงกับชื่อหัวข้อที่มีอยู่จริงเมื่อไหร่ก็เลือกให้ทันที
function onOtherText(name: string, text: string) {
  otherText.value = { ...otherText.value, [name]: text }
  const match = attributeByName.value.get(text.trim().toLowerCase())
  if (match && choiceOf(name) !== String(match.attribute_id)) setChoice(name, String(match.attribute_id))
}

const REASON_LABEL: Record<string, string> = { value: 'ค่าคล้ายกัน', name: 'ชื่อคล้ายกัน', category: 'หมวดเดียวกันใช้อยู่' }
function reasonText(reasons: string[] = []) {
  return reasons.map((r) => REASON_LABEL[r] ?? r).join(' · ')
}

let planSeq = 0
async function setChoice(name: string, value: string) {
  choices.value = { ...choices.value, [name]: value }
  const seq = ++planSeq
  planning.value = true
  try {
    const res = await adminAPI.planImport({ rows: rows.value, attribute_map: attributeMap() })
    // เลือกหลายข้อติดกัน — ใช้ผลของคำขอล่าสุดเท่านั้น
    if (seq === planSeq) plan.value = res.data.plan
  } catch {
    toast.error('คำนวณรายการใหม่ไม่สำเร็จ')
  } finally {
    if (seq === planSeq) planning.value = false
  }
}

async function commit() {
  committing.value = true
  try {
    const res = await adminAPI.commitImport({ rows: rows.value, attribute_map: attributeMap() })
    const d = res.data
    toast.success(`นำเข้าแล้ว: สินค้าใหม่ ${d.created.length} · แก้ ${d.updated.length} · ค่าคุณสมบัติ ${d.spec_written}${d.images_downloaded ? ` · รูป ${d.images_downloaded}` : ""}`)
    reset()
  } catch (err: any) {
    // ข้อมูลในระบบเปลี่ยนระหว่างดูพรีวิว — server ส่งแผนใหม่มาให้ดูแทน
    if (err?.response?.data?.plan) plan.value = err.response.data.plan
    toast.error(err?.response?.data?.message ?? 'บันทึกไม่สำเร็จ')
  } finally {
    committing.value = false
  }
}

function reset() {
  plan.value = null
  rows.value = null
  choices.value = {}
  otherText.value = {}
  fileName.value = ''
}
</script>
