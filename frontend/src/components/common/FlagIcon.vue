<script setup lang="ts">
import { computed } from 'vue'
import type { Lang } from '../../language/translations'

const props = defineProps<{ code: Lang; className?: string }>()

const uid = computed(() => `flag-${props.code}`)
const white = computed(() => `${uid.value}-white`)
const blue = computed(() => `${uid.value}-blue`)
const red = computed(() => `${uid.value}-red`)
</script>

<template>
  <svg v-if="code === 'en'" viewBox="0 0 21 15" width="21" height="15" :class="className" role="img" aria-label="English">
    <defs>
      <linearGradient x1="50%" y1="0%" x2="50%" y2="100%" :id="white">
        <stop stop-color="#FFF" offset="0%" />
        <stop stop-color="#F0F0F0" offset="100%" />
      </linearGradient>
      <linearGradient x1="50%" y1="0%" x2="50%" y2="100%" :id="blue">
        <stop stop-color="#0A17A7" offset="0%" />
        <stop stop-color="#030E88" offset="100%" />
      </linearGradient>
      <linearGradient x1="50%" y1="0%" x2="50%" y2="100%" :id="red">
        <stop stop-color="#E6273E" offset="0%" />
        <stop stop-color="#CF152B" offset="100%" />
      </linearGradient>
    </defs>
    <g fill="none" fill-rule="evenodd">
      <path :fill="`url(#${white})`" d="M0 0h21v15H0z" />
      <path :fill="`url(#${blue})`" d="M-.002 0h21v15h-21z" />
      <path
        d="M5.003 10H-.002V5h5.005L-2.082.22l1.118-1.657 8.962 6.045V-1h5v5.608l8.962-6.045L23.078.22 15.993 5h5.005v5h-5.005l7.085 4.78-1.118 1.657-8.962-6.045V16h-5v-5.608l-8.962 6.045-1.118-1.658L5.003 10z"
        :fill="`url(#${white})`"
      />
      <path
        d="M14.136 4.958l9.5-6.25a.25.25 0 00-.275-.417l-9.5 6.25a.25.25 0 10.275.417zm.732 5.522l8.515 5.74a.25.25 0 10.28-.415l-8.516-5.74a.25.25 0 00-.279.415zM6.142 4.526L-2.74-1.461a.25.25 0 00-.28.415L5.863 4.94a.25.25 0 00.279-.414zm.685 5.469l-9.845 6.53a.25.25 0 10.276.416l9.846-6.529a.25.25 0 00-.277-.417z"
        fill="#DB1F35"
        fill-rule="nonzero"
      />
      <path :fill="`url(#${red})`" d="M-.002 9h9v6h3V9h9V6h-9V0h-3v6h-9z" />
    </g>
  </svg>

  <svg v-else-if="code === 'th'" viewBox="0 0 21 15" width="21" height="15" :class="className" role="img" aria-label="ไทย">
    <defs>
      <linearGradient x1="50%" y1="0%" x2="50%" y2="100%" :id="white">
        <stop stop-color="#FFF" offset="0%" />
        <stop stop-color="#F0F0F0" offset="100%" />
      </linearGradient>
      <linearGradient x1="50%" y1="0%" x2="50%" y2="100%" :id="blue">
        <stop stop-color="#0A17A7" offset="0%" />
        <stop stop-color="#030E88" offset="100%" />
      </linearGradient>
      <linearGradient x1="50%" y1="0%" x2="50%" y2="100%" :id="red">
        <stop stop-color="#E6273E" offset="0%" />
        <stop stop-color="#CF152B" offset="100%" />
      </linearGradient>
    </defs>
    <g fill-rule="evenodd">
      <rect :fill="`url(#${white})`" width="21" height="15" />
      <rect :fill="`url(#${red})`" width="21" height="2.5" y="0" />
      <rect :fill="`url(#${blue})`" width="21" height="5" y="5" />
      <rect :fill="`url(#${red})`" width="21" height="2.5" y="12.5" />
    </g>
  </svg>

  <svg v-else viewBox="0 0 21 15" width="21" height="15" :class="className" role="img" aria-label="日本語">
    <defs>
      <linearGradient x1="50%" y1="0%" x2="50%" y2="100%" :id="white">
        <stop stop-color="#FFF" offset="0%" />
        <stop stop-color="#F0F0F0" offset="100%" />
      </linearGradient>
      <linearGradient x1="50%" y1="0%" x2="50%" y2="100%" :id="red">
        <stop stop-color="#E6273E" offset="0%" />
        <stop stop-color="#CF152B" offset="100%" />
      </linearGradient>
    </defs>
    <g fill-rule="evenodd">
      <rect :fill="`url(#${white})`" width="21" height="15" />
      <circle :fill="`url(#${red})`" cx="10.5" cy="7.5" r="4.3" />
    </g>
  </svg>
</template>
