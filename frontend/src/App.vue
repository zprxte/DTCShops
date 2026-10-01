<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ToastContainer from './components/common/ToastContainer.vue'
import ErrorBoundary from './components/common/ErrorBoundary.vue'
import { usePageTitle } from './composables/usePageTitle'
usePageTitle()
const route = useRoute()
const isAdmin = computed(() => route.path.startsWith('/admin'))
</script>

<template>
  <ToastContainer />
  <ErrorBoundary :thai="isAdmin">
    <router-view />
  </ErrorBoundary>
</template>
