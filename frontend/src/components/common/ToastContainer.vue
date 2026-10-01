<script setup lang="ts">
import { toastState } from '../../stores/toast'

const STYLES: Record<string, string> = {
  success: 'bg-white border-l-4 border-accent-500 text-navy-900',
  error: 'bg-white border-l-4 border-red-500 text-navy-900',
  info: 'bg-white border-l-4 border-brand-500 text-navy-900',
}
</script>

<template>
  <!-- aria-live=polite + role=status — โปรแกรมอ่านหน้าจอจะอ่านข้อความแจ้งเตือน
       ที่โผล่มาให้เอง (Week 14 — accessibility) เดิมเป็น div เปล่าที่คนใช้
       โปรแกรมอ่านหน้าจอไม่มีทางรู้เลยว่ามีข้อความเด้งขึ้นมา -->
  <div
    role="status"
    aria-live="polite"
    aria-atomic="false"
    class="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-xs pointer-events-none print:hidden"
  >
    <TransitionGroup name="toast">
      <div
        v-for="item in toastState.items"
        :key="item.id"
        :class="['rounded-lg shadow-lg px-4 py-3 text-sm pointer-events-auto', STYLES[item.kind]]"
      >
        {{ item.message }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.toast-leave-to {
  opacity: 0;
}
</style>
