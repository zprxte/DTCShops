import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

declare const process: { env: Record<string, string | undefined>; cwd(): string }

export default defineConfig(({ mode }) => {
  // อ่าน VITE_PROXY_TARGET จาก .env หรือ process.env (ใช้ฝั่ง Node ไม่ส่งเข้าเบราว์เซอร์)
  const env = loadEnv(mode, process.cwd(), '')
  // frontend/.env = localhost:4000 (รันบนเครื่อง) · docker-compose ทับเป็น backend:4000 · ไม่มีค่าสำรองในโค้ด
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
