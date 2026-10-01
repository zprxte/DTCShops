<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { footerAPI } from '../../services/api'
import { useLanguage } from '../../language/useLanguage'
import type { FooterContent } from '../../types/product'

const { langs } = useLanguage()
const footer = ref<FooterContent | null>(null)

onMounted(() => {
  footerAPI.get().then((res) => { footer.value = res.data }).catch(() => {})
})
</script>

<template>
  <section v-if="footer?.company?.name" class="text-center py-10 border-t">
    <h2 class="text-lg md:text-xl font-bold">{{ langs('contactCtaTitle') }}</h2>
    <div class="w-10 h-0.5 bg-brand-500 mx-auto mt-2 mb-4"></div>
    <p class="text-sm text-gray-500 max-w-2xl mx-auto leading-relaxed">
      {{ langs('contactCtaBody', { company: footer.company.name, tel: footer.contact.tel ?? '' }) }}
    </p>
  </section>
</template>
