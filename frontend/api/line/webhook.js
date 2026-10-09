// Webhook ของบอท LINE บน Vercel — ตั้ง Webhook URL ใน LINE Developers เป็น https://<โดเมน>/api/line/webhook
// ตัวบอทอยู่ใน line/handler.js (ตัวเดียวกับ npm run bot) · ค่าจาก env ของโปรเจกต์ Vercel:
//   LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, API_ORIGIN, WEB_BASE_URL (+ SUPABASE_* สำหรับสถานะ "รอคำค้น")
// ต่างจาก npm run bot: ต้องตอบ LINE หลังประมวลผลเสร็จ — function ถูกหยุดทันทีที่ส่ง response
import { botFromEnv } from '../../../line/handler.js'

const bot = botFromEnv()

export async function POST(request) {
  const raw = Buffer.from(await request.arrayBuffer())
  const done = bot.handleWebhook(raw, request.headers.get('x-line-signature'))
  if (!done) return new Response('bad signature', { status: 401 })
  await done
  return new Response('ok')
}

export function GET() {
  return new Response('ok')
}
