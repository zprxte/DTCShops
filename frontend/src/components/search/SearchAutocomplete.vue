<script setup lang="ts">
// ช่องค้นหาใน header + รายการแนะนำขณะพิมพ์ (หน่วง 300ms, ใช้คีย์บอร์ดได้)
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from 'lucide-vue-next'
import { searchAPI } from '../../services/api'
import { productSlug } from '../../utils/slug'
import { useLanguage } from '../../language/useLanguage'

const MIN_CHARS = 2
const DEBOUNCE_MS = 300

const props = defineProps<{
  autoFocus?: boolean
  className?: string
}>()
const emit = defineEmits<{ navigate: [] }>()

const { langs } = useLanguage()
const router = useRouter()
const listboxId = `autocomplete-${Math.random().toString(36).slice(2, 9)}`

type Suggestion = { product_id: string; product_name: string; slug?: string | null }

const searchword = ref('')
const suggestions = ref<Suggestion[]>([])
const open = ref(false)
const activeIndex = ref(-1)

const containerRef = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
// คำขอล่าสุดชนะ — ผลของคำขอเก่าที่มาช้าห้ามทับ
let requestId = 0

// พิมพ์แล้วดึงคำแนะนำ (หน่วง 300ms)
watch(searchword, (query) => {
  const trimmed = query.trim()
  const thisRequestId = ++requestId
  if (debounceTimer) clearTimeout(debounceTimer)
  if (trimmed.length < MIN_CHARS) {
    suggestions.value = []
    activeIndex.value = -1
    return
  }
  debounceTimer = setTimeout(() => {
    searchAPI
      .autocomplete(trimmed)
      .then((res) => {
        if (thisRequestId !== requestId) return
        suggestions.value = res.data.suggestions ?? []
        activeIndex.value = -1
      })
      .catch(() => {
        if (thisRequestId === requestId) suggestions.value = []
      })
  }, DEBOUNCE_MS)
})

// คลิกนอกกล่องแล้วปิด
function handlePointerDown(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    open.value = false
  }
}
onMounted(() => document.addEventListener('mousedown', handlePointerDown))
onBeforeUnmount(() => document.removeEventListener('mousedown', handlePointerDown))

// ปิดรายการแล้วเอาโฟกัสออกจากช่อง
function closeAndLeave() {
  open.value = false
  inputRef.value?.blur()
  emit('navigate')
}

// กดคำแนะนำ = เข้าหน้าสินค้านั้นเลย
function goToProduct(suggestion: Suggestion) {
  searchword.value = suggestion.product_name
  closeAndLeave()
  router.push(`/product/${productSlug(suggestion)}`)
}

// Enter โดยไม่ได้เลือกคำแนะนำ = ไปหน้าผลค้นหา
function goToSearch(term: string) {
  const trimmed = term.trim()
  searchword.value = trimmed
  closeAndLeave()
  router.push(trimmed ? `/products?searchword=${encodeURIComponent(trimmed)}` : '/products')
}

// Enter: มีคำแนะนำที่เลือกไว้ไปหน้าสินค้า ไม่งั้นไปหน้าผลค้นหา
function handleSubmit() {
  if (!searchword.value.trim()) {
    goToSearch('')
    return
  }
  const highlighted = activeIndex.value >= 0 ? suggestions.value[activeIndex.value] : undefined
  if (highlighted) goToProduct(highlighted)
  else goToSearch(searchword.value)
}

// ลูกศรขึ้น/ลง/Esc เลือกคำแนะนำ
function handleKeyDown(e: KeyboardEvent) {
  if (!showDropdown.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % suggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = activeIndex.value <= 0 ? suggestions.value.length - 1 : activeIndex.value - 1
  } else if (e.key === 'Escape') {
    open.value = false
  }
}

const showDropdown = computed(() => open.value && suggestions.value.length > 0)
</script>

<template>
  <div ref="containerRef" :class="['relative', props.className]">
    <form @submit.prevent="handleSubmit">
      <input
        ref="inputRef"
        v-model="searchword"
        type="text"
        :autofocus="autoFocus"
        :placeholder="langs('searchPlaceholder')"
        role="combobox"
        :aria-expanded="showDropdown"
        aria-autocomplete="list"
        :aria-controls="listboxId"
        :aria-activedescendant="activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined"
        autocomplete="off"
        enterkeyhint="search"
        class="w-full border rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        @focus="open = true"
        @keydown="handleKeyDown"
      />
      <Search aria-hidden="true" class="absolute left-3 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
    </form>

    <ul
      v-if="showDropdown"
      :id="listboxId"
      role="listbox"
      class="absolute z-30 left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg overflow-hidden py-1"
    >
      <li v-for="(s, i) in suggestions" :key="s.product_id" :id="`${listboxId}-${i}`" role="option" :aria-selected="i === activeIndex">
        <button
          type="button"
          @mousedown.prevent
          @click="goToProduct(s)"
          :class="[
            'w-full text-left px-4 py-2 text-sm flex items-center gap-2',
            i === activeIndex ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50',
          ]"
        >
          <Search aria-hidden="true" class="w-3.5 h-3.5 text-gray-500 shrink-0" />
          <span class="truncate">{{ s.product_name }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
