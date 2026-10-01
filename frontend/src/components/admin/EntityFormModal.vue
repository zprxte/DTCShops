<script setup lang="ts">
// Generic add/edit modal shared by the six simple CRUD admin sections added
// 2026-09-03 (บทความ/ร้านค้า/ADS/แบนเนอร์/ข้อมูล SEO/ข้อมูล Footer) — each
// page just describes its own fields, this renders the form + handles the
// modal chrome so that markup isn't duplicated six times over.
import { reactive, watch } from 'vue'
import { X } from 'lucide-vue-next'

export interface EntityField {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'date' | 'number'
  required?: boolean
  placeholder?: string
  half?: boolean // render at half-width, two per row
}

const props = defineProps<{
  title: string
  fields: EntityField[]
  initial: Record<string, unknown>
  saving?: boolean
}>()

const emit = defineEmits<{ save: [Record<string, unknown>]; cancel: [] }>()

const form = reactive<Record<string, unknown>>({})
watch(
  () => props.initial,
  (val) => {
    for (const key of Object.keys(form)) delete form[key]
    Object.assign(form, val)
  },
  { immediate: true }
)

// <input type="date"> needs a bare YYYY-MM-DD, API rows come back as full ISO timestamps
function dateValue(v: unknown): string {
  return v ? String(v).slice(0, 10) : ''
}

function handleSubmit() {
  emit('save', { ...form })
}
</script>

<template>
  <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" @click.self="emit('cancel')">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
      <div class="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
        <h2 class="text-base font-bold text-gray-800">{{ title }}</h2>
        <button type="button" @click="emit('cancel')" class="text-gray-500 hover:text-gray-600" aria-label="ปิด">
          <X aria-hidden="true" class="w-5 h-5" />
        </button>
      </div>

      <form @submit.prevent="handleSubmit" class="p-5 space-y-4">
        <div class="grid sm:grid-cols-2 gap-4">
          <label v-for="f in fields" :key="f.key" :class="['text-sm space-y-1 block', f.half ? '' : 'sm:col-span-2']">
            <span class="text-gray-600">
              {{ f.label }}
              <span v-if="f.required" class="text-red-600">*</span>
            </span>
            <textarea
              v-if="f.type === 'textarea'"
              v-model="(form[f.key] as string)"
              :placeholder="f.placeholder"
              rows="3"
              class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              v-else-if="f.type === 'date'"
              type="date"
              :value="dateValue(form[f.key])"
              @input="form[f.key] = ($event.target as HTMLInputElement).value"
              class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              v-else
              :type="f.type === 'number' ? 'number' : 'text'"
              v-model="(form[f.key] as string)"
              :placeholder="f.placeholder"
              class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t">
          <button type="button" @click="emit('cancel')" class="px-4 py-2 text-sm rounded-lg border text-gray-600 hover:bg-gray-50">ยกเลิก</button>
          <button type="submit" :disabled="saving" class="bg-brand-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50">
            {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
