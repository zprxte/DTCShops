<script setup lang="ts">
defineProps<{ class?: string }>()
</script>
<!-- กล่องเทาวูบวาบแทนเนื้อหาตอนกำลังโหลด -->
<template>
  <div class="animate-pulse rounded bg-gray-200" :class="$props.class" aria-hidden="true"></div>
</template>
