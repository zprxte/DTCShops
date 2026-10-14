// ส่วนตอบข้อความของบอท LINE แท็บ DTC SHOPS — ใช้ร่วมกันทั้ง bot.js และ Vercel (frontend/api/line/webhook.js)
import crypto from 'crypto';
import { loadLineEnv, envValue, line } from './env.js';
import { productCarousel, specBubble, shopCarousel, quickReply } from './flex.js';

// ปุ่มในแท็บ DTC GPS & IoT ให้เจ้าหน้าที่ตอบ บอทไม่ยุ่ง
const HUMAN_TOPICS = new Set(['แจ้งยอดชำระค่าบริการ', 'สอบถามสินค้า', 'สอบถามเรื่องอื่นๆ']);

// ข้อความที่ขึ้นต้นด้วย "ค้นหา:" = คำค้น ข้อความอื่นปล่อยให้เจ้าหน้าที่ — บอทจึงไม่ต้องจำสถานะ (Vercel อาจได้เครื่องใหม่ทุกคำขอ)
const SEARCH_PREFIX = 'ค้นหา: ';
const SEARCH_TYPED = /^ค้นหา(?:\s*[:：]|\s)\s*([\s\S]*)$/;
const searchButton = { label: 'ค้นหาสินค้า', data: 'search', keyboard: SEARCH_PREFIX };
const example = (label, word = label) => ({ label, data: new URLSearchParams({ more: word, page: '1' }).toString(), text: SEARCH_PREFIX + word });
const SEARCH_HINT = 'พิมพ์ชื่อสินค้า รุ่น หรือคุณสมบัติต่อจาก “ค้นหา:” แล้วกดส่งได้เลยครับ เช่น ค้นหา: Hikvision (หรือเลือกด้านล่าง)';
const searchExamples = () => quickReply([example('กล้องติดรถยนต์'), example('GPS ติดตามรถ', 'GPS'), example('DTRACK'), example('Hikvision'), example('กันน้ำ IP67', 'IP67'), searchButton]);

// carousel มีได้ 12 ใบ = สินค้า 11 + การ์ดดูเพิ่มเติม
const SEARCH_PAGE = 11;

// คำถามถึงเจ้าหน้าที่ — ใช้ตัดสินเฉพาะตอนค้นไม่เจอ
const QUESTION = /[?？]|ไหม|มั้ย|มั๊ย|เปล่า|ยังไง|อย่างไร|เท่าไ|กี่|ทำไม|ไหน|อะไร|บ้าง|หรือไม่|เมื่อไ|สอบถาม|ทราบ|รบกวน|ช่วย|ติดต่อ|ครับ|คะ|ค่ะ|จ้า|ขอบคุณ|สวัสดี/;
const STAFF = 'สอบถามเจ้าหน้าที่';
// คำลงท้าย/คำถามที่ตัดก่อนค้น — ตัวยาวต้องอยู่หน้าตัวสั้น ("ได้ไหม" ต้องหลุดทั้งก้อน ไม่เหลือ "ได้")
const FILLER = /ครับ|คับ|ค่ะ|คะ|จ้า|ได้ไหม|ได้มั้ย|ไหม|มั้ย|มั๊ย|หรือเปล่า|รึเปล่า|หรือไม่|เท่าไหร่|เท่าไร|ราคา|มีกี่รุ่น|กี่รุ่น|(?:รุ่น|ตัว|แบบ|อัน)ไหน(?:ดี)?|อะไรบ้าง|บ้าง|อยากได้|สนใจ|มีขาย|^มี|[?？]/g;
// ตัดคำลงท้าย/คำถามออกจากข้อความก่อนค้น
const cleanQuery = (s) => s.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();

// ชื่อ/แท็ก/หมวดตรงคำค้น — ผลจากค่าสเปคล้วนได้คะแนนไม่เกิน 0.8 (search.js)
const nameHit = (p) => p.exact_term || p.relevance_score > 0.81;

const text = (t, extra = {}) => ({ type: 'text', text: t, ...extra });
// ตอบกลับ LINE (สูงสุด 5 ข้อความต่อครั้ง)
const reply = (token, messages) => line('POST', '/v2/bot/message/reply', { replyToken: token, messages: [].concat(messages).slice(0, 5) });

// ตรวจลายเซ็นว่าคำขอมาจาก LINE จริง (HMAC-SHA256 ด้วย channel secret)
export function validSignature(raw, sig) {
  if (!sig) return false;
  const expect = crypto.createHmac('sha256', loadLineEnv().secret).update(raw).digest();
  const got = Buffer.from(sig, 'base64');
  return got.length === expect.length && crypto.timingSafeEqual(got, expect);
}

// สร้างบอท — webBase/imageBase เป็นฟังก์ชันเพราะ npm run bot รู้ URL ของ tunnel หลังเปิดแล้ว
export function createBot({ api: apiOrigin, webBase, imageBase }) {
  const API = apiOrigin.replace(/\/$/, '');

  const ctx = {
    imageUrl: (p) => (p && imageBase() ? imageBase() + encodeURI(p.startsWith('/') ? p : '/uploads/' + p) : null),
    webUrl: (p) => (webBase() ? `${webBase()}/product/${encodeURIComponent(p.slug || p.product_id)}` : null),
  };

  // เรียก API ของระบบแล้วคืน JSON
  async function api(path) {
    const res = await fetch(API + path);
    if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
    return res.json();
  }

  // ส่งข้อความนำ + carousel สินค้า
  async function sendProducts(token, products, intro) {
    if (!products.length) return reply(token, text('ไม่พบสินค้าครับ'));
    return reply(token, [text(intro), productCarousel(products, ctx, intro)]);
  }

  // ส่งต่อเจ้าหน้าที่ — ข้อความถัดไปที่ไม่ขึ้นต้นด้วย "ค้นหา:" ไปถึงเจ้าหน้าที่ใน Chat อยู่แล้ว
  async function handoff(token) {
    return reply(token, text('ส่งเรื่องให้เจ้าหน้าที่แล้วครับ พิมพ์รายละเอียดเพิ่มได้เลย เจ้าหน้าที่จะตอบในแชตนี้', {
      quickReply: quickReply([searchButton, { label: 'สินค้าแนะนำ' }, { label: 'หมวดหมู่สินค้า' }]),
    }));
  }

  // ค้นหาแล้วตอบเป็นชุดละ 11 ใบ — ชื่อตรงมาก่อน สินค้าที่ตรงแค่สเปคอยู่หลังปุ่ม (scope = 'spec')
  async function onSearch(token, word, page = 1, user = null, typed = word, scope = '') {
    const r = await api(`/api/search?searchword=${encodeURIComponent(word)}&limit=100`);
    // ข้อความที่พิมพ์เองแต่ไม่มีคำตรงชัดสักคำ = fuzzy เดามั่ว นับเป็นค้นไม่เจอ (ประโยคคำถามต้องตรงครบทุกคำ)
    const question = user && QUESTION.test(typed);
    const need = question ? Math.max(1, (r.query_words || []).length) : 1;
    const weak = user && !r.products.some((p) => p.matched_words >= need);
    if (r.products.length && !weak) {
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
    if (question) return handoff(token);
    const sugg = (r.suggestions || []).map((s) => ({ label: s.product_name, data: `spec=${s.product_id}`, text: `ดูคุณสมบัติ ${s.product_name}` }));
    return reply(token, text(
      sugg.length
        ? `ไม่พบ “${word}” ครับ คุณหมายถึงสินค้าเหล่านี้ไหม? หรือกด “${STAFF}”`
        : `ไม่พบ “${word}” ครับ ลองพิมพ์ชื่อรุ่นหรือคุณสมบัติอื่น หรือกด “${STAFF}”`,
      { quickReply: quickReply([...sugg, searchButton, { label: STAFF }]) },
    ));
  }

  // ส่งการ์ดสาขาชุดละ 11 ใบ + การ์ดดูเพิ่มเติม
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

  // ตอบข้อความที่ผู้ใช้พิมพ์/กดเมนู
  async function onText(ev) {
    const msg = ev.message.text.trim();
    const user = ev.source.userId;
    const token = ev.replyToken;

    switch (msg) {
      case 'ค้นหาสินค้า':
        return reply(token, text(SEARCH_HINT, { quickReply: searchExamples() }));
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
      case 'เปรียบเทียบสินค้า':
        return reply(token, text(webBase()
          ? `เปรียบเทียบสินค้าได้สูงสุด 4 รายการที่ ${webBase()}/compare`
          : 'หน้าเปรียบเทียบบนเว็บยังไม่เปิดให้ใช้จากภายนอกครับ กด “ดูคุณสมบัติ” บนการ์ดสินค้าเพื่อดูสเปคทีละรายการได้', {
          quickReply: quickReply([{ label: 'สินค้าแนะนำ' }, searchButton, { label: 'หมวดหมู่สินค้า' }]),
        }));
      case 'สาขา DTC Shop':
        return onShops(token);
      case 'สั่งซื้อออนไลน์':
        return reply(token, text('เลือกสินค้าแล้วกด “ดูคุณสมบัติ” จะมีปุ่มสั่งซื้อผ่าน Shopee / Lazada / TikTok ของสินค้านั้นครับ หรือพิมพ์สอบถาม/สั่งซื้อในแชตนี้ได้เลย', {
          quickReply: quickReply([{ label: 'สินค้าแนะนำ' }, searchButton, { label: 'หมวดหมู่สินค้า' }]),
        }));
    }

    if (msg === STAFF) return handoff(token);
    if (HUMAN_TOPICS.has(msg)) return;

    const m = msg.match(SEARCH_TYPED);
    if (m) {
      const typed = m[1].trim().replace(/^GPS ติดตามรถ$/, 'GPS');
      if (!typed) return reply(token, text(SEARCH_HINT, { quickReply: searchExamples() }));
      const q = cleanQuery(typed);
      if (!q && QUESTION.test(typed)) return handoff(token);
      return onSearch(token, q || typed, 1, user, typed);
    }
  }

  // ตอบปุ่ม postback (ค้นหา / ดูคุณสมบัติ / ดูเพิ่มเติม / หมวดหมู่ / สาขา)
  async function onPostback(ev) {
    const data = new URLSearchParams(ev.postback.data);
    if (data.has('search')) return reply(ev.replyToken, text(SEARCH_HINT, { quickReply: searchExamples() })); // แป้นพิมพ์เปิดพร้อม "ค้นหา: " แล้ว
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

  // จัดการ event เดียว — ล้มแล้วตอบว่าระบบขัดข้อง
  async function handle(ev) {
    console.log('[event]', ev.type, ev.message?.text ?? ev.postback?.data ?? '');
    try {
      if (ev.type === 'message' && ev.message.type === 'text') await onText(ev);
      else if (ev.type === 'postback') await onPostback(ev);
    } catch (e) {
      console.error('[bot]', ev.type, e.message);
      if (ev.replyToken) await reply(ev.replyToken, text('ขออภัย ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้งครับ')).catch(() => { });
    }
  }

  // รับ webhook: ต้องใช้ body ดิบตรวจลายเซ็น (ห้าม parse แล้ว stringify ใหม่) · คืน false = ลายเซ็นผิด
  function handleWebhook(raw, signature) {
    if (!validSignature(raw, signature)) return false;
    const { events = [] } = JSON.parse(raw.toString('utf8'));
    return Promise.all(events.map(handle));
  }

  return { handleWebhook };
}

// สร้างบอทจากค่า env (Vercel / --no-tunnel ที่ URL ไม่เปลี่ยนระหว่างรัน)
export function botFromEnv() {
  const web = envValue('WEB_BASE_URL').replace(/\/$/, '');
  const images = (envValue('PUBLIC_BASE_URL') || web).replace(/\/$/, '');
  return createBot({
    api: envValue('API_ORIGIN') || 'http://localhost:4000',
    webBase: () => web,
    imageBase: () => images,
  });
}
