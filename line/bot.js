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

// คำถามถึงเจ้าหน้าที่ที่พิมพ์มาตอนอยู่ในโหมดค้นหา เช่น "ส่งของกี่วันครับ" — ใช้เฉพาะตอนค้นไม่เจอ
// (ถามถึงสินค้าที่มีอยู่ เช่น "DTRACK ราคาเท่าไหร่" ยังได้การ์ดสินค้าตามปกติ)
const QUESTION = /[?？]|ไหม|มั้ย|มั๊ย|เปล่า|ยังไง|อย่างไร|เท่าไ|กี่|ทำไม|ไหน|อะไร|บ้าง|หรือไม่|เมื่อไ|สอบถาม|ทราบ|รบกวน|ช่วย|ติดต่อ|ครับ|คะ|ค่ะ|จ้า|ขอบคุณ|สวัสดี/;
const STAFF = 'สอบถามเจ้าหน้าที่';
// คำลงท้าย/คำถามที่ไม่ใช่ชื่อสินค้า — ตัดก่อนค้น ไม่งั้น "มีกล้องกันน้ำไหม" ค้นไม่เจอ
// (ตัวยาวอยู่หน้าตัวสั้น: "ได้ไหม" ต้องหลุดทั้งก้อน ไม่เหลือ "ได้")
const FILLER = /ครับ|คับ|ค่ะ|คะ|จ้า|ได้ไหม|ได้มั้ย|ไหม|มั้ย|มั๊ย|หรือเปล่า|รึเปล่า|หรือไม่|เท่าไหร่|เท่าไร|ราคา|มีกี่รุ่น|กี่รุ่น|(?:รุ่น|ตัว|แบบ|อัน)ไหน(?:ดี)?|อะไรบ้าง|บ้าง|อยากได้|สนใจ|มีขาย|^มี|[?？]/g;
const cleanQuery = (s) => s.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();

// ออกจากโหมดค้นหา ข้อความถัดไปไปถึงเจ้าหน้าที่ใน Chat
function handoff(token, user) {
  awaitingSearch.delete(user);
  return reply(token, text('ส่งเรื่องให้เจ้าหน้าที่แล้วครับ พิมพ์รายละเอียดเพิ่มได้เลย เจ้าหน้าที่จะตอบในแชตนี้', {
    quickReply: quickReply([{ label: 'ค้นหาสินค้า' }, { label: 'สินค้าแนะนำ' }, { label: 'หมวดหมู่สินค้า' }]),
  }));
}

// user = มาจากข้อความที่พิมพ์ในโหมดค้นหา (ไม่ใช่ปุ่มดูเพิ่มเติม) → ค้นไม่เจอแล้วส่งต่อเจ้าหน้าที่ได้
// ชื่อ/แท็ก/หมวดตรงคำค้น — ค่าสเปคมีน้ำหนัก 0.8 (search.js itemFields) ผลที่มาจากสเปคล้วนจึงได้ไม่เกิน 0.8
const nameHit = (p) => p.exact_term || p.relevance_score > 0.81;

// scope = '' ผลหลัก · 'spec' = เฉพาะสินค้าที่มีคำค้นแค่ในคุณสมบัติ (กดจากปุ่มใต้ผลหลัก)
// ดึงผลทั้งหมดครั้งเดียว (สินค้ามีไม่กี่สิบตัว) แล้วแบ่งชุดเอง เพราะต้องแยก "ชื่อตรง" ออกจาก "สเปคตรง" ก่อนแบ่งหน้า
async function onSearch(token, word, page = 1, user = null, typed = word, scope = '') {
  const r = await api(`/api/search?searchword=${encodeURIComponent(word)}&limit=100`);
  // ข้อความที่พิมพ์มา: ผลที่ไม่มีคำไหนตรงชัดสักคำ (matched_words = 0) คือ fuzzy เดามั่ว
  // เช่น "ครับ" / "ผ่อนได้" ได้การ์ดกล้อง 15 ใบ — นับเป็นค้นไม่เจอ
  // ประโยคคำถามเข้มกว่า: ต้องตรงชัดครบทุกคำ ("หน้าร้าน" ตรงแค่ "หน้า" ของกล้องติดหน้ารถ ≠ สินค้า)
  const question = user && QUESTION.test(typed);
  const need = question ? Math.max(1, (r.query_words || []).length) : 1;
  const weak = user && !r.products.some((p) => p.matched_words >= need);
  if (r.products.length && !weak) {
    // มีสินค้าที่ชื่อตรง → แสดงเฉพาะตัวนั้น ("sd card" = การ์ด Sandisk ไม่ใช่กล้องที่สเปคเขียนว่ารองรับ SD Card)
    // สินค้าที่ตรงแค่สเปคย้ายไปไว้หลังปุ่ม ไม่หายไปเฉยๆ (ค้นฟีเจอร์อย่าง ADAS ยังต้องเจอ)
    const named = r.products.filter(nameHit);
    const specOnly = r.products.filter((p) => !nameHit(p));
    const list = scope === 'spec' ? specOnly : named.length ? named : r.products;
    const rest = scope === 'spec' || !named.length ? 0 : specOnly.length;
    const from = (page - 1) * SEARCH_PAGE;
    const part = list.slice(from, from + SEARCH_PAGE);
    if (!part.length) return reply(token, text('แสดงผลครบแล้วครับ'));
    const to = from + part.length;
    const remaining = list.length - to;
    const data = new URLSearchParams({ more: word, page: String(page + 1), ...(scope ? { s: scope } : {}) }).toString();
    const more = remaining > 0 && data.length <= 300 ? { remaining, data } : null; // postback data ยาวได้ 300 ตัว
    const intro = page > 1
      ? `แสดงรายการที่ ${from + 1}–${to} จาก ${list.length} ครับ`
      : scope === 'spec'
        ? `สินค้าที่มี “${word}” ในคุณสมบัติ ${list.length} รายการครับ`
        : r.searched_as
          ? `แสดงผลของ “${r.searched_as}” ครับ (${list.length} รายการ)`
          : `พบ ${list.length} รายการ แสดงรายการที่ ${from + 1}–${to} ครับ`;
    const carousel = productCarousel(part, ctx, intro, more);
    const restData = new URLSearchParams({ more: word, page: '1', s: 'spec' }).toString();
    if (page === 1 && rest > 0 && restData.length <= 300) {
      carousel.quickReply = quickReply([{ label: `ที่เกี่ยวข้องอีก ${rest} รายการ`, data: restData, text: `ดูสินค้าที่มี “${word}” ในคุณสมบัติ` }]);
    }
    const hint = page === 1 && rest > 0 ? `\n(มีอีก ${rest} สินค้าที่มีคำนี้ในคุณสมบัติ กดปุ่มด้านล่าง)` : '';
    return reply(token, [text(intro + hint), carousel]);
  }
  if (page > 1 || scope) return reply(token, text('แสดงผลครบแล้วครับ'));
  if (question) return handoff(token, user);
  const sugg = (r.suggestions || []).map((s) => ({ label: s.product_name, data: `spec=${s.product_id}`, text: `ดูคุณสมบัติ ${s.product_name}` }));
  return reply(token, text(
    sugg.length
      ? `ไม่พบ “${word}” ครับ คุณหมายถึงสินค้าเหล่านี้ไหม? หรือกด “${STAFF}”`
      : `ไม่พบ “${word}” ครับ ลองพิมพ์ชื่อรุ่นหรือคุณสมบัติอื่น หรือกด “${STAFF}”`,
    { quickReply: quickReply([...sugg, { label: STAFF }]) },
  ));
}

// สาขาทีละชุด: 11 ใบ + การ์ด "ดูเพิ่มเติม" (กดแล้ว postback shops=<หน้า>) · ชุดสุดท้ายไม่มีการ์ดนี้
async function onShops(token, page = 1) {
  const shops = await api('/api/shops');
  const PER = 11;
  const from = (page - 1) * PER;
  const part = shops.slice(from, from + PER);
  if (!part.length) return reply(token, text('แสดงสาขาครบแล้วครับ'));
  const to = from + part.length;
  const remaining = shops.length - to;
  const more = remaining > 0 ? { remaining, data: `shops=${page + 1}` } : null;
  const intro = page > 1 ? `สาขาที่ ${from + 1}–${to} จาก ${shops.length} ครับ` : `สาขา DTC Shop ${shops.length} สาขาครับ`;
  return reply(token, [text(intro), shopCarousel(part, ctx, intro, more)]);
}

async function onText(ev) {
  const msg = ev.message.text.trim();
  const user = ev.source.userId;
  const token = ev.replyToken;

  switch (msg) {
    case 'ค้นหาสินค้า':
      awaitingSearch.set(user, Date.now() + SEARCH_TTL);
      return reply(token, text('พิมพ์ชื่อสินค้า รุ่น หรือคุณสมบัติที่ต้องการได้เลยครับ (หรือเลือกด้านล่าง)', {
        quickReply: quickReply([{ label: 'กล้องติดรถยนต์' }, { label: 'GPS ติดตามรถ' }, { label: 'DTRACK' }, { label: 'Hikvision' }, { label: 'กันน้ำ IP67', text: 'IP67' }]),
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
    case 'สาขา DTC Shop':
      return onShops(token);
    case 'สั่งซื้อออนไลน์':
      return reply(token, text('เลือกสินค้าแล้วกด “ดูคุณสมบัติ” จะมีปุ่มสั่งซื้อผ่าน Shopee / Lazada / TikTok ของสินค้านั้นครับ หรือพิมพ์สอบถาม/สั่งซื้อในแชตนี้ได้เลย', {
        quickReply: quickReply([{ label: 'สินค้าแนะนำ' }, { label: 'ค้นหาสินค้า' }, { label: 'หมวดหมู่สินค้า' }]),
      }));
  }

  if (msg === STAFF) return handoff(token, user);
  if (HUMAN_TOPICS.has(msg)) { awaitingSearch.delete(user); return; } // ให้เจ้าหน้าที่ตอบใน Chat

  const until = awaitingSearch.get(user);
  if (until && until > Date.now()) {
    awaitingSearch.set(user, Date.now() + SEARCH_TTL); // ค้นต่อได้อีกโดยไม่ต้องกดปุ่มใหม่
    const typed = msg.replace(/^GPS ติดตามรถ$/, 'GPS');
    const q = cleanQuery(typed);
    if (!q && QUESTION.test(typed)) return handoff(token, user); // "ครับ" / "?" อย่างเดียว
    return onSearch(token, q || typed, 1, user, typed);
  }
  // ข้อความอื่นปล่อยให้เจ้าหน้าที่ตอบ
}

async function onPostback(ev) {
  const data = new URLSearchParams(ev.postback.data);
  if (data.has('spec')) {
    const d = await api(`/api/products/${encodeURIComponent(data.get('spec'))}`);
    return reply(ev.replyToken, specBubble(d, ctx));
  }
  if (data.has('shops')) return onShops(ev.replyToken, Math.max(2, Number(data.get('shops')) || 2));
  if (data.has('more')) return onSearch(ev.replyToken, data.get('more'), Math.max(1, Number(data.get('page')) || 2), null, data.get('more'), data.get('s') || '');
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
