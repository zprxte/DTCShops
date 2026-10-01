<script setup lang="ts">
import { onMounted, ref } from 'vue'
import TableRowsSkeleton from '../../components/common/TableRowsSkeleton.vue'
import { Plus, SquarePen, Trash2 } from 'lucide-vue-next'
import { adminAPI } from '../../services/api'
import { toast } from '../../stores/toast'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'
import EntityFormModal, { type EntityField } from '../../components/admin/EntityFormModal.vue'

interface FooterItem {
  id: number
  name: string | null
  type: string | null
  title: string | null
  sequence: number | null
  [key: string]: unknown
}

const FIELDS: EntityField[] = [
  { key: 'name', label: 'ชื่อ', required: true },
  { key: 'type', label: 'ประเภท (text/link/image/head/social-footer)', half: true },
  { key: 'sequence', label: 'ลำดับข้อมูล', type: 'number', half: true },
  { key: 'title', label: 'รายละเอียด', type: 'textarea' },
  { key: 'head_title', label: 'Head Title (key สำหรับ type=head)' },
  { key: 'url', label: 'URL' },
  { key: 'image', label: 'รูปภาพ' },
]

const rows = ref<FooterItem[]>([])
const q = ref('')
const loading = ref(true)
const pendingDeleteId = ref<number | null>(null)
const modalOpen = ref(false)
const editing = ref<FooterItem | null>(null)
const saving = ref(false)

function load() {
  loading.value = true
  adminAPI
    .listFooterItems({ q: q.value })
    .then((res) => { rows.value = res.data })
    .catch(() => toast.error('โหลดข้อมูล Footer ไม่สำเร็จ'))
    .finally(() => { loading.value = false })
}
onMounted(load)

function openAdd() {
  editing.value = null
  modalOpen.value = true
}
function openEdit(row: FooterItem) {
  editing.value = row
  modalOpen.value = true
}

async function handleSave(data: Record<string, unknown>) {
  saving.value = true
  try {
    if (editing.value) {
      await adminAPI.updateFooterItem(editing.value.id, data)
      toast.success('บันทึกแล้ว')
    } else {
      await adminAPI.createFooterItem(data)
      toast.success('เพิ่มข้อมูลแล้ว')
    }
    modalOpen.value = false
    load()
  } catch {
    toast.error('บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: number) {
  try {
    await adminAPI.deleteFooterItem(id)
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
    <h1 class="text-xl font-bold text-gray-800">ข้อมูล Footer</h1>

    <div class="bg-white border rounded-xl p-4 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <button type="button" @click="openAdd" class="flex items-center gap-1.5 bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800">
          <Plus aria-hidden="true" class="w-4 h-4" />
          เพิ่มข้อมูล
        </button>
        <input v-model="q" @keyup.enter="load" placeholder="ค้นหา..." class="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b">
            <th class="py-2 font-medium">ชื่อ</th>
            <th class="py-2 font-medium">ประเภท</th>
            <th class="py-2 font-medium">รายละเอียด</th>
            <th class="py-2 font-medium w-20">ลำดับ</th>
            <th class="py-2 font-medium w-40 text-right">การดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          <TableRowsSkeleton v-if="loading" :columns="5" />
          <tr v-if="!loading && rows.length === 0"><td colspan="5" class="py-6 text-center text-gray-500">ยังไม่มีข้อมูล</td></tr>
          <tr v-for="r in rows" :key="r.id" class="border-b last:border-0">
            <td class="py-2.5">{{ r.name || '-' }}</td>
            <td class="py-2.5 text-gray-500">{{ r.type || '-' }}</td>
            <td class="py-2.5 text-gray-500 max-w-md truncate">{{ r.title || '-' }}</td>
            <td class="py-2.5">{{ r.sequence ?? '-' }}</td>
            <td class="py-2.5 text-right">
              <div class="flex justify-end gap-3">
                <button @click="openEdit(r)" class="flex items-center gap-1 text-brand-700 hover:underline">
                  <SquarePen aria-hidden="true" class="w-3.5 h-3.5" />
                  แก้ไข
                </button>
                <button @click="pendingDeleteId = r.id" class="flex items-center gap-1 text-red-600 hover:underline">
                  <Trash2 aria-hidden="true" class="w-3.5 h-3.5" />
                  ลบ
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <p class="text-xs text-gray-500">จำนวนข้อมูล {{ rows.length }} รายการ</p>
    </div>

    <EntityFormModal
      v-if="modalOpen"
      :title="editing ? 'แก้ไขข้อมูล Footer' : 'เพิ่มข้อมูล Footer'"
      :fields="FIELDS"
      :initial="editing ?? {}"
      :saving="saving"
      @save="handleSave"
      @cancel="modalOpen = false"
    />

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      message="ยืนยันการลบข้อมูลนี้?"
      @confirm="pendingDeleteId !== null && handleDelete(pendingDeleteId)"
      @cancel="pendingDeleteId = null"
    />
  </div>
</template>
