<script setup lang="ts">
import { onMounted, ref } from 'vue'
import TableRowsSkeleton from '../../components/common/TableRowsSkeleton.vue'
import { Plus, SquarePen, Trash2 } from 'lucide-vue-next'
import { adminAPI } from '../../services/api'
import { toast } from '../../stores/toast'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'
import EntityFormModal, { type EntityField } from '../../components/admin/EntityFormModal.vue'

interface Shop {
  shop_id: string
  shop_name: string
  address: string | null
  mdf_dt: string | null
  ist_dt: string | null
  [key: string]: unknown
}

const FIELDS: EntityField[] = [
  { key: 'shop_name', label: 'ชื่อร้านค้า', required: true },
  { key: 'address', label: 'ที่อยู่' },
  { key: 'road', label: 'ถนน' },
  { key: 'province', label: 'จังหวัด', half: true },
  { key: 'district', label: 'เขต/อำเภอ', half: true },
  { key: 'sub_district', label: 'แขวง/ตำบล', half: true },
  { key: 'postcode', label: 'รหัสไปรษณีย์', half: true },
  { key: 'lat', label: 'ละติจูด', half: true },
  { key: 'lon', label: 'ลองจิจูด', half: true },
  { key: 'tel', label: 'เบอร์โทร' },
  { key: 'thumbnail', label: 'รูปภาพ' },
]

const rows = ref<Shop[]>([])
const q = ref('')
const loading = ref(true)
const pendingDeleteId = ref<string | null>(null)
const modalOpen = ref(false)
const editing = ref<Shop | null>(null)
const saving = ref(false)

function load() {
  loading.value = true
  adminAPI
    .listShops({ q: q.value })
    .then((res) => { rows.value = res.data })
    .catch(() => toast.error('โหลดร้านค้าไม่สำเร็จ'))
    .finally(() => { loading.value = false })
}
onMounted(load)

function openAdd() {
  editing.value = null
  modalOpen.value = true
}
function openEdit(row: Shop) {
  editing.value = row
  modalOpen.value = true
}

async function handleSave(data: Record<string, unknown>) {
  saving.value = true
  try {
    if (editing.value) {
      await adminAPI.updateShop(editing.value.shop_id, data)
      toast.success('บันทึกแล้ว')
    } else {
      await adminAPI.createShop(data)
      toast.success('เพิ่มร้านค้าแล้ว')
    }
    modalOpen.value = false
    load()
  } catch {
    toast.error('บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: string) {
  try {
    await adminAPI.deleteShop(id)
    toast.success('ลบแล้ว')
    load()
  } catch {
    toast.error('ลบไม่สำเร็จ')
  } finally {
    pendingDeleteId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-bold text-gray-800">ข้อมูลร้านค้า</h1>

    <div class="bg-white border rounded-xl p-4 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <button type="button" @click="openAdd" class="flex items-center gap-1.5 bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800">
          <Plus aria-hidden="true" class="w-4 h-4" />
          เพิ่มร้านค้า
        </button>
        <input v-model="q" @keyup.enter="load" placeholder="ค้นหาร้านค้า..." class="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b">
            <th class="py-2 font-medium">ร้านค้า</th>
            <th class="py-2 font-medium">ที่อยู่</th>
            <th class="py-2 font-medium">อัพเดตล่าสุด</th>
            <th class="py-2 font-medium w-40 text-right">การดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          <TableRowsSkeleton v-if="loading" :columns="4" />
          <tr v-if="!loading && rows.length === 0"><td colspan="4" class="py-6 text-center text-gray-500">ยังไม่มีร้านค้า</td></tr>
          <tr v-for="r in rows" :key="r.shop_id" class="border-b last:border-0">
            <td class="py-2.5">{{ r.shop_name }}</td>
            <td class="py-2.5 text-gray-500">{{ r.address || '-' }}</td>
            <td class="py-2.5 text-gray-500">{{ (r.mdf_dt || r.ist_dt) ? String(r.mdf_dt || r.ist_dt).slice(0, 16).replace('T', ' ') : '-' }}</td>
            <td class="py-2.5 text-right">
              <div class="flex justify-end gap-3">
                <button @click="openEdit(r)" class="flex items-center gap-1 text-brand-700 hover:underline">
                  <SquarePen aria-hidden="true" class="w-3.5 h-3.5" />
                  แก้ไข
                </button>
                <button @click="pendingDeleteId = r.shop_id" class="flex items-center gap-1 text-red-600 hover:underline">
                  <Trash2 aria-hidden="true" class="w-3.5 h-3.5" />
                  ลบ
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <p class="text-xs text-gray-500">จำนวนข้อมูลทั้งหมด {{ rows.length }} รายการ</p>
    </div>

    <EntityFormModal
      v-if="modalOpen"
      :title="editing ? 'แก้ไขร้านค้า' : 'เพิ่มร้านค้า'"
      :fields="FIELDS"
      :initial="editing ?? {}"
      :saving="saving"
      @save="handleSave"
      @cancel="modalOpen = false"
    />

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      message="ยืนยันการลบร้านค้านี้?"
      @confirm="pendingDeleteId !== null && handleDelete(pendingDeleteId)"
      @cancel="pendingDeleteId = null"
    />
  </div>
</template>
