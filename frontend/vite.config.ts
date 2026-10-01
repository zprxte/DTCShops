import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

declare const process: { env: Record<string, string | undefined>; cwd(): string }

export default defineConfig(({ mode }) => {
  // loadEnv อ่านทั้งไฟล์ .env และตัวแปรจริงใน process.env (ที่ docker-compose ตั้งให้)
  // prefix '' = ไม่จำกัดเฉพาะ VITE_* เพราะค่านี้ใช้ฝั่ง Node ไม่ได้ส่งเข้าเบราว์เซอร์
  const env = loadEnv(mode, process.cwd(), '')
  // แหล่งค่า 2 ที่ ตัวล่างทับตัวบน:
  //   frontend/.env            → http://localhost:4000  (รัน npm run dev บนเครื่อง)
  //   docker-compose.yml:76    → http://backend:4000    (รันใน Docker — ชนะเสมอ)
  // ไม่มีค่าสำรองในโค้ด: ลบ frontend/.env ทิ้งแล้วรันนอก Docker จะได้ undefined
  const proxyTarget = env.VITE_PROXY_TARGET

  return {
    plugins: [vue()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/uploads': { target: proxyTarget, changeOrigin: true },
      },
      watch: {
        usePolling: true,
      },
    },
  }
})
