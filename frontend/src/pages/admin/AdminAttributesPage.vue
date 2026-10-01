<script setup lang="ts">
import { onMounted, ref } from 'vue'
import TableRowsSkeleton from '../../components/common/TableRowsSkeleton.vue'
import { FilePlus, SquarePen, Trash2 } from 'lucide-vue-next'
import { adminAPI } from '../../services/api'
import { toast } from '../../stores/toast'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'

interface Attribute {
  attribute_id: number
  attribute_name: string
}

const attributes = ref<Attribute[]>([])
const filtered = ref<Attribute[]>([])
const q = ref('')
const loading = ref(true)
const pendingDeleteId = ref<number | null>(null)

function applyFilter() {
  const term = q.value.trim().toLowerCase()
  filtered.value = term ? attributes.value.filter((a) => a.attribute_name.toLowerCase().includes(term)) : attributes.value
}

function load() {
  loading.value = true
  adminAPI
    .listAttributes()
    .then((res) => { attributes.value = res.data; applyFilter() })
    .catch(() => toast.error('โหลดคุณสมบัติไม่สำเร็จ'))
    .finally(() => { loading.value = false })
}
onMounted(load)

async function handleDelete(id: number) {
  try {
    await adminAPI.deleteAttribute(id)
    toast.success('ลบแล้ว')
    load()
  } catch {
    toast.error('ลบไม่สำเร็จ (อาจมีสินค้าผูกค่าอยู่)')
  } finally {
    pendingDeleteId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-gray-800">รายการคุณสมบัติสินค้า (Attribute)</h1>
      <router-link to="/admin/attributes/new" class="flex items-center gap-1.5 bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800">
        <FilePlus aria-hidden="true" class="w-4 h-4" />
        เพิ่มคุณสมบัติ
      </router-link>
    </div>

    <div class="bg-white border rounded-xl p-4 space-y-4">
      <div class="flex flex-wrap items-center justify-end gap-3">
        <input v-model="q" @input="applyFilter" placeholder="ค้นหาสินค้า..." class="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b">
            <th class="py-2 font-medium">คุณสมบัติสินค้า</th>
            <th class="py-2 font-medium w-40 text-right">การดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          <TableRowsSkeleton v-if="loading" :columns="2" />
          <tr v-if="!loading && filtered.length === 0">
            <td colspan="2" class="py-6 text-center text-gray-500">ยังไม่มีคุณสมบัติ</td>
          </tr>
          <tr v-for="a in filtered" :key="a.attribute_id" class="border-b last:border-0">
            <td class="py-2.5">{{ a.attribute_name }}</td>
            <td class="py-2.5 text-right">
              <div class="flex justify-end gap-3">
                <router-link :to="`/admin/attributes/${a.attribute_id}/edit`" class="flex items-center gap-1 text-brand-700 hover:underline">
                  <SquarePen aria-hidden="true" class="w-3.5 h-3.5" />
                  แก้ไข
                </router-link>
                <button @click="pendingDeleteId = a.attribute_id" class="flex items-center gap-1 text-red-600 hover:underline">
                  <Trash2 aria-hidden="true" class="w-3.5 h-3.5" />
                  ลบ
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <p class="text-xs text-gray-500">จำนวนข้อมูลทั้งหมด {{ filtered.length }} รายการ</p>
    </div>

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      message="ยืนยันการลบคุณสมบัตินี้?"
      @confirm="pendingDeleteId !== null && handleDelete(pendingDeleteId)"
      @cancel="pendingDeleteId = null"
    />
  </div>
</template>
