// Webhook ของบอท LINE บน Vercel (https://<โดเมน>/api/line/webhook) — ต้องตอบ LINE หลังประมวลผลเสร็จ เพราะ function หยุดทันทีที่ส่ง response
import { botFromEnv } from '../../../line/handler.js'

const bot = botFromEnv()

// รับ event จาก LINE → handler.js
export async function POST(request) {
  const raw = Buffer.from(await request.arrayBuffer())
  const done = bot.handleWebhook(raw, request.headers.get('x-line-signature'))
  if (!done) return new Response('bad signature', { status: 401 })
  await done
  return new Response('ok')
}

// ใช้ตรวจว่า endpoint ยังทำงาน
export function GET() {
  return new Response('ok')
}
