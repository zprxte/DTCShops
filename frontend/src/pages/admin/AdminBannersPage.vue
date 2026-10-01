<script setup lang="ts">
import { onMounted, ref } from 'vue'
import TableRowsSkeleton from '../../components/common/TableRowsSkeleton.vue'
import { Plus, SquarePen, Trash2 } from 'lucide-vue-next'
import { adminAPI } from '../../services/api'
import { toast } from '../../stores/toast'
import ConfirmDialog from '../../components/common/ConfirmDialog.vue'

interface Banner {
  bnn_slide_code: string
  bnn_slide_desc: string
  bnn_slide_index: number | null
  bnn_slide_end_point: string | null
  pb_dt: string | null
  exp_dt: string | null
  [key: string]: unknown
}

const rows = ref<Banner[]>([])
const q = ref('')
const loading = ref(true)
const pendingDeleteId = ref<string | null>(null)

function load() {
  loading.value = true
  adminAPI
    .listBanners({ q: q.value })
    .then((res) => { rows.value = res.data })
    .catch(() => toast.error('โหลดแบนเนอร์ไม่สำเร็จ'))
    .finally(() => { loading.value = false })
}
onMounted(load)

async function handleDelete(code: string) {
  try {
    await adminAPI.deleteBanner(code)
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
    <h1 class="text-xl font-bold text-gray-800">ข้อมูลแบนเนอร์</h1>

    <div class="bg-white border rounded-xl p-4 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <router-link to="/admin/banners/new" class="flex items-center gap-1.5 bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800">
          <Plus aria-hidden="true" class="w-4 h-4" />
          เพิ่มแบนเนอร์
        </router-link>
        <input v-model="q" @keyup.enter="load" placeholder="ค้นหาแบนเนอร์..." class="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-gray-500 border-b">
            <th class="py-2 font-medium w-16">ลำดับ</th>
            <th class="py-2 font-medium">แบนเนอร์</th>
            <th class="py-2 font-medium">Link Banner</th>
            <th class="py-2 font-medium">วันที่เผยแพร่</th>
            <th class="py-2 font-medium">วันที่สิ้นสุด</th>
            <th class="py-2 font-medium w-40 text-right">การดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          <TableRowsSkeleton v-if="loading" :columns="6" />
          <tr v-if="!loading && rows.length === 0"><td colspan="6" class="py-6 text-center text-gray-500">ยังไม่มีแบนเนอร์</td></tr>
          <tr v-for="r in rows" :key="r.bnn_slide_code" class="border-b last:border-0">
            <td class="py-2.5">{{ r.bnn_slide_index ?? '-' }}</td>
            <td class="py-2.5">{{ r.bnn_slide_desc }}</td>
            <td class="py-2.5 text-gray-500">{{ r.bnn_slide_end_point || '-' }}</td>
            <td class="py-2.5 text-gray-500">{{ r.pb_dt ? String(r.pb_dt).slice(0, 10) : '-' }}</td>
            <td class="py-2.5 text-gray-500">{{ r.exp_dt ? String(r.exp_dt).slice(0, 10) : '-' }}</td>
            <td class="py-2.5 text-right">
              <div class="flex justify-end gap-3">
                <router-link :to="`/admin/banners/${r.bnn_slide_code}/edit`" class="flex items-center gap-1 text-brand-700 hover:underline">
                  <SquarePen aria-hidden="true" class="w-3.5 h-3.5" />
                  แก้ไข
                </router-link>
                <button @click="pendingDeleteId = r.bnn_slide_code" class="flex items-center gap-1 text-red-600 hover:underline">
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

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      message="ยืนยันการลบแบนเนอร์นี้?"
      @confirm="pendingDeleteId !== null && handleDelete(pendingDeleteId)"
      @cancel="pendingDeleteId = null"
    />
  </div>
</template>
