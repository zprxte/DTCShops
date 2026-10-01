<script setup lang="ts">
defineProps<{ class?: string }>()
</script>
<!--ใช้แทน Loading สี่เหลี่ยมๆตอนกำลังโหลด-->
<template>
  <div class="animate-pulse rounded bg-gray-200" :class="$props.class" aria-hidden="true"></div>
</template>
