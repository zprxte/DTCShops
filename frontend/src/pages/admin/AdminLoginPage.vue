<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Eye, EyeOff } from 'lucide-vue-next'
import { useAuthStore } from '../../stores/auth'
//ข้อความ error
const ERROR_TEXT: Record<string, string> = {
  missingCredentials: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน',
  invalidCredentials: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  loginFailedGeneric: 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง',
  networkError: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ ตรวจสอบการเชื่อมต่อของคุณ',
}

const router = useRouter()
const auth = useAuthStore()
const username = ref('')
const password = ref('')
const showPassword = ref(false)

async function handleSubmit() {
  auth.clearError()
  try {
    await auth.login(username.value, password.value)
    router.push('/admin/products')
  } catch {
    // error is already set in the store
  }
}

</script>

<template>
  <!-- <main> = landmark เนื้อหาหลัก (หน้านี้อยู่นอก AdminLayout จึงไม่มี <main> จาก layout) -->
  <main class="min-h-screen relative flex items-center justify-center overflow-hidden p-4">
    <div
      class="absolute inset-0 bg-cover bg-center scale-110 blur-md brightness-[0.6]"
      style="background-image: url(/login-bg.jpg)"
    ></div>
    <div class="absolute inset-0 bg-brand-900/10"></div>

    <div class="relative z-10 w-full max-w-5xl grid md:grid-cols-[1.7fr_1fr] bg-white rounded-2xl shadow-2xl overflow-hidden">
      <div class="hidden md:block relative">
        <img loading="lazy" decoding="async" src="/login-bg.jpg" class="absolute inset-0 w-full h-full object-cover" alt="" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
      </div>

      <!-- Right panel: the login form -->
      <form @submit.prevent="handleSubmit" class="p-8 sm:p-10 flex flex-col justify-center space-y-4">
        <img loading="lazy" decoding="async" src="/logo-shop.png" class="h-10  w-auto self-start" alt="DTCSHOP" />
        <h1 class="text-xl font-bold text-gray-800">ลงชื่อเข้าสู่ระบบ DTCSHOP</h1>

        <p v-if="auth.error" class="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
          {{ ERROR_TEXT[auth.error] ?? ERROR_TEXT.loginFailedGeneric }}
        </p>

        <div>
          <label for="login-username" class="block text-sm text-gray-600 mb-1">บัญชีผู้ใช้งาน</label>
          <input
            id="login-username"
            v-model="username"
            autocomplete="username"
            placeholder="บัญชีผู้ใช้งาน"
            class="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            required
          />
        </div>

        <div>
          <label for="login-password" class="block text-sm text-gray-600 mb-1">รหัสผ่าน</label>
          <div class="relative">
            <input
              id="login-password"
              v-model="password"
              autocomplete="current-password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="รหัสผ่าน"
              class="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              required
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              :aria-label="showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
            >
              <EyeOff aria-hidden="true" v-if="showPassword" class="w-4 h-4" />
              <Eye aria-hidden="true" v-else class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- brand-700 = contrast 4.97:1 กับตัวอักษรขาว (brand-600 ได้แค่ 3.43:1 ไม่ผ่าน WCAG AA 4.5:1) -->
        <button
          type="submit"
          :disabled="auth.isLoading"
          class="w-full bg-brand-700 text-white rounded-lg py-2.5 font-medium hover:bg-brand-800 disabled:opacity-50"
        >
          {{ auth.isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ' }}
        </button>
      </form>
    </div>
  </main>
</template>
