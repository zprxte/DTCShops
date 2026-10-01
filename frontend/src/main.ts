import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './index.css'

const app = createApp(App)

// ตาข่ายรับสุดท้าย — ErrorBoundary (components/common/ErrorBoundary.vue) ดัก
// error ไว้ 2 ชั้นแล้ว (ใน App.vue ครอบทั้งแอป + ในแต่ละ layout ครอบ <router-view>)
// ตัวนี้รับเฉพาะที่หลุดออกมานอกขอบเขตนั้น (เช่นใน ToastContainer หรือใน watcher
// ที่ทำงานหลังคอมโพเนนต์ถูกถอดไปแล้ว) ให้ลงคอนโซลเป็นก้อนเดียวอ่านง่าย แทนที่จะเงียบหายไป
app.config.errorHandler = (err, _instance, info) => {
  console.error('[app]', info, err)
}

app.use(createPinia()).use(router).mount('#app')
