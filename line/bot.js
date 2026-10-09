// บอทตอบปุ่มแท็บ DTC SHOPS — รับ webhook จาก LINE แล้วดึงข้อมูลจาก API ของระบบเรา
//   npm run bot              → เปิดบอท + tunnel (cloudflared) + ตั้ง Webhook URL ให้ LINE อัตโนมัติ
//                              ไม่ได้ตั้ง WEB_BASE_URL = เปิดหน้าเว็บ dev (:5173) ผ่าน tunnel เดียวกัน
//                              แล้วตั้งเมนูใหม่ให้ปุ่ม "เปรียบเทียบสินค้า" ชี้ URL นั้น
//   node bot.js --no-tunnel  → เปิดเฉพาะบอทที่ localhost (production / tunnel ที่เปิดเอง)
import http from 'http';
import fs from 'fs';
import { spawn } from 'child_process';
import { loadLineEnv, envValue, line } from './env.js';
import { createBot } from './handler.js';
import { setupRichMenu } from './setup-richmenu.js';

const PORT = Number(envValue('BOT_PORT') || 4100);
const API = (envValue('API_ORIGIN') || 'http://localhost:4000').replace(/\/$/, '');
// หน้าเว็บที่คนนอกเปิดได้ (production) — ว่าง + มี tunnel = ใช้หน้าเว็บ dev ผ่าน tunnel แทน
const WEB = envValue('WEB_BASE_URL').replace(/\/$/, '');
const WEB_DEV = (envValue('WEB_DEV_ORIGIN') || 'http://localhost:5173').replace(/\/$/, '');
let webBase = WEB;
let proxyWeb = false; // true = คำขออื่นทั้งหมดส่งต่อให้หน้าเว็บ dev
let publicUrl = envValue('PUBLIC_BASE_URL').replace(/\/$/, ''); // tunnel จะเติมให้

// ส่วนตอบข้อความอยู่ใน handler.js (ใช้ร่วมกับ Vercel Function) — รูปโหลดผ่าน tunnel นี้ (/uploads ด้านล่าง)
const bot = createBot({ api: API, webBase: () => webBase, imageBase: () => publicUrl });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'POST' && url.pathname === '/webhook') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const done = bot.handleWebhook(raw, req.headers['x-line-signature']);
    if (!done) { res.writeHead(401).end('bad signature'); return; }
    res.writeHead(200).end('ok');
    return;
  }

  // รูปสินค้า/สาขา — LINE ต้องโหลดรูปผ่าน HTTPS จึงส่งต่อจาก backend ผ่าน tunnel นี้
  if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) {
    const up = await fetch(API + url.pathname).catch(() => null);
    if (!up || !up.ok) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': up.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
    res.end(Buffer.from(await up.arrayBuffer()));
    return;
  }

  if (url.pathname === '/health') { res.writeHead(200).end('ok'); return; }
  if (proxyWeb) { proxyToWeb(req, res, url); return; }
  res.writeHead(404).end();
});

// ตอนพัฒนา: ส่งคำขออื่นต่อให้หน้าเว็บ dev (Vite :5173 ซึ่งส่ง /api ต่อให้ backend เอง)
// ปุ่มในเมนู/การ์ดจึงเปิดหน้าเว็บบนมือถือได้ · หลังบ้านไม่เปิดออกไปข้างนอก (รหัสแอดมินของ dev ไม่ได้ตั้งไว้ให้ปลอดภัย)
const BLOCKED = /^\/(admin|api\/admin|api\/auth)(\/|$)/;
function proxyToWeb(req, res, url) {
  if (BLOCKED.test(url.pathname)) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('หน้านี้ไม่เปิดผ่านลิงก์ทดสอบ'); return; }
  const target = new URL(url.pathname + url.search, WEB_DEV);
  // Host ต้องเป็นของ dev server (Vite ปฏิเสธชื่อโดเมนที่ไม่รู้จัก)
  const up = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) res.writeHead(502).end('หน้าเว็บ dev ไม่ได้เปิดอยู่ (' + WEB_DEV + ')'); });
  req.pipe(up);
}

async function startTunnel() {
  const { bin, install } = await import('cloudflared');
  if (!fs.existsSync(bin)) { console.log('กำลังดาวน์โหลด cloudflared…'); await install(bin); }
  const child = spawn(bin, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://localhost:${PORT}`]);
  process.on('exit', () => child.kill());
  process.on('SIGINT', () => process.exit(0));
  return new Promise((resolve, reject) => {
    const onData = (buf) => {
      const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) { child.stderr.off('data', onData); resolve(m[0]); }
    };
    child.stderr.on('data', onData);
    child.on('exit', (code) => reject(new Error('cloudflared ปิดตัว (code ' + code + ')')));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// tunnel ใหม่ต้องใช้เวลาสักพักกว่าจะเรียกจากข้างนอกได้ (ก่อนหน้านั้นตอบ 530 และ LINE ไม่รับ URL)
async function waitPublic(base) {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${base}/health`).catch(() => null);
    if (r?.ok) return true;
    await sleep(2000);
  }
  return false;
}

async function setWebhook(base) {
  const endpoint = `${base}/webhook`;
  if (!(await waitPublic(base))) console.log('⚠️ tunnel ยังเรียกจากข้างนอกไม่ได้ — ลองตั้ง webhook ต่อ');
  for (let i = 0; i < 10; i++) {
    try {
      await line('PUT', '/v2/bot/channel/webhook/endpoint', { endpoint });
      const t = await line('POST', '/v2/bot/channel/webhook/test', { endpoint });
      if (t.success) { console.log('ตั้ง Webhook URL แล้ว และ LINE เรียกถึง ✓', endpoint); return true; }
      console.log('LINE ยังเรียกไม่ถึง:', t.reason || t.detail, '— ลองใหม่');
    } catch (e) { console.log('ตั้ง webhook ไม่สำเร็จ:', e.message, '— ลองใหม่'); }
    await sleep(3000);
  }
  console.log('⚠️ LINE ยังเรียก webhook ไม่ได้ ลองปิดแล้วรัน npm run bot ใหม่');
  return false;
}

server.listen(PORT, async () => {
  console.log(`บอทรอที่ http://localhost:${PORT}/webhook · ดึงข้อมูลจาก ${API}`);
  const { secret, token } = loadLineEnv();
  if (!secret || !token) console.log('⚠️ ไม่มี LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN — ทุกคำขอจาก LINE จะถูกปฏิเสธ');
  if (process.argv.includes('--no-tunnel')) {
    // production: URL คงที่ตั้งใน LINE Developers ครั้งเดียว ไม่ต้องตั้ง webhook เอง
    if (!publicUrl) console.log('⚠️ ไม่ได้ตั้ง PUBLIC_BASE_URL — การ์ดจะไม่มีรูป');
    else console.log('รูปในการ์ดโหลดจาก', publicUrl);
    return;
  }
  try {
    publicUrl = await startTunnel();
    console.log('tunnel:', publicUrl);
    if (!WEB) {
      // ยังไม่มีเว็บจริง → เปิดหน้าเว็บ dev ผ่าน tunnel นี้ แล้วตั้งเมนูใหม่ให้ปุ่มเปรียบเทียบชี้ URL ใหม่
      webBase = publicUrl;
      proxyWeb = true;
      console.log(`หน้าเว็บ dev (${WEB_DEV}) เปิดผ่าน ${publicUrl} — ไม่รวมหลังบ้าน`);
    }
    const ready = await setWebhook(publicUrl);
    if (!WEB) {
      try { await setupRichMenu({ webBase, log: () => { } }); console.log('ตั้งเมนูใหม่แล้ว: ปุ่มเปรียบเทียบ →', webBase + '/compare'); }
      catch (e) { console.log('⚠️ ตั้งเมนูใหม่ไม่สำเร็จ:', e.message, '— ปุ่มเปรียบเทียบจะยังชี้ที่เดิม'); }
    }
    if (ready) console.log('พร้อมใช้งาน — กดปุ่มในแท็บ DTC SHOPS ได้เลย (Ctrl+C เพื่อปิด)');
  } catch (e) {
    console.error('เปิด tunnel ไม่สำเร็จ:', e.message);
  }
});
