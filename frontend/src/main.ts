import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './index.css'

const app = createApp(App)

// ดัก error ที่หลุดนอก ErrorBoundary (เช่นใน watcher หลังคอมโพเนนต์ถูกถอด) ให้ลงคอนโซล
app.config.errorHandler = (err, _instance, info) => {
  console.error('[app]', info, err)
}

app.use(createPinia()).use(router).mount('#app')
