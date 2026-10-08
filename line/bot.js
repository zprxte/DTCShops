// บอทตอบปุ่มแท็บ DTC SHOPS — รับ webhook จาก LINE แล้วดึงข้อมูลจาก API ของระบบเรา
//   npm run bot              → เปิดบอท + tunnel (cloudflared) + ตั้ง Webhook URL ให้ LINE อัตโนมัติ
//                              ไม่ได้ตั้ง WEB_BASE_URL = เปิดหน้าเว็บ dev (:5173) ผ่าน tunnel เดียวกัน
//                              แล้วตั้งเมนูใหม่ให้ปุ่ม "เปรียบเทียบสินค้า" ชี้ URL นั้น
//   node bot.js --no-tunnel  → เปิดเฉพาะบอทที่ localhost (production / tunnel ที่เปิดเอง)
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import { spawn } from 'child_process';
import { loadLineEnv, envValue, line } from './env.js';
import { productCarousel, specBubble, shopCarousel, quickReply } from './flex.js';
import { setupRichMenu } from './setup-richmenu.js';

const PORT = Number(envValue('BOT_PORT') || 4100);
const API = (envValue('API_ORIGIN') || 'http://localhost:4000').replace(/\/$/, '');
// หน้าเว็บที่คนนอกเปิดได้ (production) — ว่าง + มี tunnel = ใช้หน้าเว็บ dev ผ่าน tunnel แทน
const WEB = envValue('WEB_BASE_URL').replace(/\/$/, '');
const WEB_DEV = (envValue('WEB_DEV_ORIGIN') || 'http://localhost:5173').replace(/\/$/, '');
let webBase = WEB;
let proxyWeb = false; // true = คำขออื่นทั้งหมดส่งต่อให้หน้าเว็บ dev
let publicUrl = envValue('PUBLIC_BASE_URL').replace(/\/$/, ''); // tunnel จะเติมให้

// ปุ่มในแท็บ DTC GPS & IoT ให้คนตอบ (Chat) — บอทไม่ยุ่ง
const HUMAN_TOPICS = new Set(['แจ้งยอดชำระค่าบริการ', 'สอบถามสินค้า', 'สอบถามเรื่องอื่นๆ']);

// ผู้ใช้ที่เพิ่งกด "ค้นหาสินค้า" — ข้อความถัดไปถือเป็นคำค้น (หมดอายุ 5 นาที)
const SEARCH_TTL = 5 * 60 * 1000;
const awaitingSearch = new Map();

const ctx = {
  imageUrl: (p) => (p && publicUrl ? publicUrl + encodeURI(p.startsWith('/') ? p : '/uploads/' + p) : null),
  webUrl: (p) => (webBase ? `${webBase}/product/${encodeURIComponent(p.slug || p.product_id)}` : null),
};

async function api(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

const text = (t, extra = {}) => ({ type: 'text', text: t, ...extra });
const reply = (token, messages) => line('POST', '/v2/bot/message/reply', { replyToken: token, messages: [].concat(messages).slice(0, 5) });

async function sendProducts(token, products, intro) {
  if (!products.length) return reply(token, text('ไม่พบสินค้าครับ'));
  return reply(token, [text(intro), productCarousel(products, ctx, intro)]);
}

// ผลค้นหาส่งทีละชุด: carousel มีได้ 12 ใบ = สินค้า 11 + การ์ด "ดูเพิ่มเติม" (ชุดสุดท้ายไม่มีการ์ดนี้)
const SEARCH_PAGE = 11;

async function onSearch(token, word, page = 1) {
  const r = await api(`/api/search?searchword=${encodeURIComponent(word)}&limit=${SEARCH_PAGE}&page=${page}`);
  if (r.products.length) {
    const from = (page - 1) * SEARCH_PAGE + 1;
    const to = from + r.products.length - 1;
    const remaining = r.total - to;
    const data = new URLSearchParams({ more: word, page: String(page + 1) }).toString();
    const more = remaining > 0 && data.length <= 300 ? { remaining, data } : null; // postback data ยาวได้ 300 ตัว
    const intro = page > 1
      ? `แสดงรายการที่ ${from}–${to} จาก ${r.total} ครับ`
      : r.searched_as
        ? `แสดงผลของ “${r.searched_as}” ครับ (${r.total} รายการ)`
        : `พบ ${r.total} รายการ แสดงรายการที่ ${from}–${to} ครับ`;
    return reply(token, [text(intro), productCarousel(r.products, ctx, intro, more)]);
  }
  if (page > 1) return reply(token, text('แสดงผลครบแล้วครับ'));
  const sugg = (r.suggestions || []).map((s) => ({ label: s.product_name, data: `spec=${s.product_id}`, text: `ดูคุณสมบัติ ${s.product_name}` }));
  return reply(token, text(
    sugg.length ? `ไม่พบ “${word}” ครับ คุณหมายถึงสินค้าเหล่านี้ไหม?` : `ไม่พบ “${word}” ครับ ลองพิมพ์ชื่อรุ่นหรือคุณสมบัติอื่น`,
    sugg.length ? { quickReply: quickReply(sugg) } : {},
  ));
}

async function onText(ev) {
  const msg = ev.message.text.trim();
  const user = ev.source.userId;
  const token = ev.replyToken;

  switch (msg) {
    case 'ค้นหาสินค้า':
      awaitingSearch.set(user, Date.now() + SEARCH_TTL);
      return reply(token, text('พิมพ์ชื่อสินค้า รุ่น หรือคุณสมบัติที่ต้องการได้เลยครับ (หรือเลือกด้านล่าง)', {
        quickReply: quickReply([{ label: 'กล้องติดรถยนต์' }, { label: 'GPS ติดตามรถ' }, { label: 'DTRACK' }, { label: 'hikvison' }, { label: 'กันน้ำ IP67' }]),
      }));
    case 'สินค้าแนะนำ': {
      const r = await api('/api/products?sort=popular&limit=10');
      return sendProducts(token, r.products, 'สินค้ายอดนิยมครับ ปัดดูได้เลย กด “ดูคุณสมบัติ” เพื่อดูสเปค');
    }
    case 'หมวดหมู่สินค้า': {
      const cats = await api('/api/categories');
      return reply(token, text('เลือกหมวดหมู่ที่สนใจได้เลยครับ', {
        quickReply: quickReply(cats.map((c) => ({ label: c.category_name, data: `cat=${c.category_id}`, text: c.category_name }))),
      }));
    }
    case 'เปรียบเทียบสินค้า': // ปกติปุ่มเมนูเปิดหน้าเว็บเอง — ข้อความนี้มาเมื่อเมนูถูกตั้งตอนยังไม่มีเว็บ
      return reply(token, text(webBase
        ? `เปรียบเทียบสินค้าได้สูงสุด 4 รายการที่ ${webBase}/compare`
        : 'หน้าเปรียบเทียบบนเว็บยังไม่เปิดให้ใช้จากภายนอกครับ กด “ดูคุณสมบัติ” บนการ์ดสินค้าเพื่อดูสเปคทีละรายการได้', {
        quickReply: quickReply([{ label: 'สินค้าแนะนำ' }, { label: 'ค้นหาสินค้า' }, { label: 'หมวดหมู่สินค้า' }]),
      }));
    case 'สาขา DTC Shop': {
      const shops = await api('/api/shops');
      return reply(token, [text(`สาขา DTC Shop ${shops.length} สาขาครับ`), shopCarousel(shops, ctx)]);
    }
    case 'สั่งซื้อออนไลน์':
      return reply(token, text('เลือกสินค้าแล้วกด “ดูคุณสมบัติ” จะมีปุ่มสั่งซื้อผ่าน Shopee / Lazada / TikTok ของสินค้านั้นครับ หรือพิมพ์สอบถาม/สั่งซื้อในแชตนี้ได้เลย', {
        quickReply: quickReply([{ label: 'สินค้าแนะนำ' }, { label: 'ค้นหาสินค้า' }, { label: 'หมวดหมู่สินค้า' }]),
      }));
  }

  if (HUMAN_TOPICS.has(msg)) return; // ให้เจ้าหน้าที่ตอบใน Chat

  const until = awaitingSearch.get(user);
  if (until && until > Date.now()) {
    awaitingSearch.set(user, Date.now() + SEARCH_TTL); // ค้นต่อได้อีกโดยไม่ต้องกดปุ่มใหม่
    return onSearch(token, msg.replace(/^GPS ติดตามรถ$/, 'GPS'));
  }
  // ข้อความอื่นปล่อยให้เจ้าหน้าที่ตอบ
}

async function onPostback(ev) {
  const data = new URLSearchParams(ev.postback.data);
  if (data.has('spec')) {
    const d = await api(`/api/products/${encodeURIComponent(data.get('spec'))}`);
    return reply(ev.replyToken, specBubble(d, ctx));
  }
  if (data.has('more')) return onSearch(ev.replyToken, data.get('more'), Math.max(2, Number(data.get('page')) || 2));
  if (data.has('cat')) {
    const r = await api(`/api/products?category_id=${encodeURIComponent(data.get('cat'))}&sort=popular&limit=10`);
    return sendProducts(ev.replyToken, r.products, `สินค้าในหมวดนี้ ${r.total} รายการครับ`);
  }
}

async function handle(ev) {
  try {
    if (ev.type === 'message' && ev.message.type === 'text') await onText(ev);
    else if (ev.type === 'postback') await onPostback(ev);
  } catch (e) {
    console.error('[bot]', ev.type, e.message);
    if (ev.replyToken) await reply(ev.replyToken, text('ขออภัย ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้งครับ')).catch(() => { });
  }
}

// ลายเซ็นยืนยันว่าคำขอมาจาก LINE จริง (HMAC-SHA256 ด้วย channel secret)
function validSignature(raw, sig) {
  if (!sig) return false;
  const expect = crypto.createHmac('sha256', loadLineEnv().secret).update(raw).digest();
  const got = Buffer.from(sig, 'base64');
  return got.length === expect.length && crypto.timingSafeEqual(got, expect);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'POST' && url.pathname === '/webhook') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    if (!validSignature(raw, req.headers['x-line-signature'])) {
      res.writeHead(401).end('bad signature');
      return;
    }
    res.writeHead(200).end('ok'); // ตอบ LINE ทันที แล้วค่อยประมวลผล
    const { events = [] } = JSON.parse(raw.toString('utf8'));
    for (const ev of events) {
      console.log('[event]', ev.type, ev.message?.text ?? ev.postback?.data ?? '');
      handle(ev);
    }
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
