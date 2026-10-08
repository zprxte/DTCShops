// สร้างข้อความ Flex ของ LINE จากข้อมูลสินค้า/สาขาของ API ระบบเรา

const SPEC_ROWS = 8; // การ์ด LINE ขยายเองไม่ได้ — ที่เหลือดูบนเว็บ

export function formatPrice(p) {
  const min = Number(p.product_price ?? 0);
  const max = Number(p.product_price_max ?? min);
  if (!(min > 0)) return 'ติดต่อสอบถาม';
  const baht = (n) => '฿' + n.toLocaleString('th-TH');
  return max > min ? `${baht(min)} – ${baht(max)}` : baht(min);
}

const shortName = (name) => (name.length > 40 ? name.slice(0, 40) + '…' : name);

// ปุ่มลิงก์ของ Flex ต้องเป็น http/https/tel/line ยาวไม่เกิน 1000 ตัว และเป็น URL ที่สมบูรณ์
// (ลิงก์ Shopee บางตัวใน DB ถูกตัดกลาง %xx — ถ้าส่งไป LINE ปฏิเสธทั้งข้อความ)
function okUri(u) {
  if (typeof u !== 'string' || u.length > 1000 || !/^(https?:|tel:|line:)/.test(u)) return false;
  try { decodeURI(u); new URL(u); return true; } catch { return false; }
}

function productBubble(p, ctx) {
  const footer = [{
    type: 'button', style: 'primary', color: '#06A648', height: 'sm',
    action: { type: 'postback', label: 'ดูคุณสมบัติ', data: `spec=${p.product_id}`, displayText: `ดูคุณสมบัติ ${shortName(p.product_name)}` },
  }];
  const web = ctx.webUrl(p);
  if (web) footer.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: 'ดูบนเว็บ', uri: web } });

  const bubble = {
    type: 'bubble', size: 'kilo',
    body: {
      type: 'box', layout: 'vertical', spacing: 'xs',
      contents: [
        { type: 'text', text: p.category_name || 'สินค้า', size: 'xxs', color: '#2479BF', weight: 'bold' },
        { type: 'text', text: p.product_name, size: 'sm', weight: 'bold', wrap: true, maxLines: 2 },
        { type: 'text', text: formatPrice(p), size: 'lg', weight: 'bold', color: '#D6402A' },
      ],
    },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer },
  };
  const img = ctx.imageUrl(p.product_image);
  if (img) bubble.hero = { type: 'image', url: img, size: 'full', aspectRatio: '4:3', aspectMode: 'fit', backgroundColor: '#F3F6F9' };
  return bubble;
}

// การ์ดใบสุดท้ายของชุด — กดแล้วบอทส่งชุดถัดไป (carousel มีได้ไม่เกิน 12 ใบ)
function moreBubble({ remaining, data }) {
  return {
    type: 'bubble', size: 'kilo',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', justifyContent: 'center',
      contents: [
        { type: 'text', text: 'ดูเพิ่มเติม', size: 'lg', weight: 'bold', align: 'center' },
        { type: 'text', text: `อีก ${remaining} รายการ`, size: 'sm', color: '#666666', align: 'center' },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', contents: [{
        type: 'button', style: 'primary', color: '#06A648', height: 'sm',
        action: { type: 'postback', label: 'ดูชุดถัดไป', data, displayText: 'ดูเพิ่มเติม' },
      }],
    },
  };
}

// more = { remaining, data } → สินค้า 11 ใบ + การ์ด "ดูเพิ่มเติม"
export function productCarousel(products, ctx, altText = 'สินค้า', more = null) {
  const bubbles = products.slice(0, more ? 11 : 12).map((p) => productBubble(p, ctx));
  if (more) bubbles.push(moreBubble(more));
  return { type: 'flex', altText, contents: { type: 'carousel', contents: bubbles } };
}

export function specBubble(d, ctx) {
  const specs = (d.product_attribute_value || []).map((a) => ({ k: a.attribute?.attribute_name ?? '', v: String(a.value ?? '') }));
  const rows = specs.slice(0, SPEC_ROWS).map((s) => ({
    type: 'box', layout: 'horizontal', spacing: 'md', margin: 'sm',
    contents: [
      { type: 'text', text: s.k || '-', size: 'xxs', color: '#5F6B78', flex: 4, wrap: true },
      { type: 'text', text: s.v || '-', size: 'xxs', weight: 'bold', flex: 6, wrap: true },
    ],
  }));

  const head = [{ type: 'text', text: d.product_name, size: 'sm', weight: 'bold', wrap: true, maxLines: 3, flex: 1 }];
  const img = ctx.imageUrl(d.product_image);
  if (img) head.unshift({ type: 'image', url: img, size: 'xs', aspectMode: 'fit', flex: 0, backgroundColor: '#FFFFFF' });

  const body = [
    { type: 'box', layout: 'horizontal', spacing: 'md', contents: head, alignItems: 'center' },
    { type: 'text', text: `คุณสมบัติ · ${formatPrice(d)}`, size: 'xs', weight: 'bold', color: '#1F6FB2', margin: 'lg' },
    { type: 'separator', margin: 'sm' },
    ...(rows.length ? rows : [{ type: 'text', text: 'ยังไม่มีข้อมูลคุณสมบัติ', size: 'xs', color: '#5F6B78', margin: 'sm' }]),
  ];
  if (specs.length > SPEC_ROWS) {
    body.push({ type: 'text', text: `อีก ${specs.length - SPEC_ROWS} หัวข้อ ${ctx.webUrl(d) ? 'กด “ดูคุณสมบัติทั้งหมด”' : 'ดูได้บนเว็บ'}`, size: 'xxs', color: '#5F6B78', margin: 'md' });
  }

  // ปุ่มสั่งซื้อของสินค้านั้น (มีลิงก์ไหนแสดงลิงก์นั้น) + ปุ่มเปิดหน้าสินค้าบนเว็บ
  // ไม่มีปุ่มสั่งซื้อ LINE — ลูกค้าคุยอยู่ใน LINE ของร้านอยู่แล้ว
  const buttons = [
    ['Shopee', d.shopee_link, '#D8481C'], ['Lazada', d.lazada_link, '#1A1A8E'], ['TikTok', d.tiktok_link, '#111111'],
  ].filter(([, u]) => okUri(u)).map(([label, uri, color]) => ({
    type: 'button', style: 'primary', color, height: 'sm', action: { type: 'uri', label: `สั่งซื้อ ${label}`, uri },
  }));
  // ปุ่มเว็บต่อท้ายปุ่มร้าน (อยู่ข้าง TikTok) — ครึ่งแถวบนมือถือจริงตัดชื่อเหลือ "ดูคุณสมบัติทั้ง…"
  // จึงให้ LINE ย่อตัวอักษรให้พอดีปุ่มแทน (shrink-to-fit · LINE รุ่นเก่าที่ไม่รู้จักจะตัดชื่อเหมือนเดิม)
  const web = ctx.webUrl(d);
  if (web) buttons.push({ type: 'button', style: 'primary', color: '#1F6FB2', height: 'sm', adjustMode: 'shrink-to-fit', action: { type: 'uri', label: 'ดูคุณสมบัติทั้งหมด', uri: web } });
  const footer = [];
  for (let i = 0; i < buttons.length; i += 2) {
    const row = buttons.slice(i, i + 2);
    // เหลือปุ่มเดียว ใส่กล่องว่างไว้ข้างๆ ให้กว้างครึ่งแถวเท่าปุ่มอื่น ไม่ยืดเต็มแถว
    if (row.length === 1) row.push({ type: 'box', layout: 'vertical', contents: [], flex: 1 });
    footer.push({ type: 'box', layout: 'horizontal', spacing: 'sm', contents: row });
  }

  const bubble = { type: 'bubble', size: 'mega', body: { type: 'box', layout: 'vertical', contents: body } };
  if (footer.length) bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer };
  return { type: 'flex', altText: `คุณสมบัติ ${shortName(d.product_name)}`, contents: bubble };
}

export function shopCarousel(shops, ctx) {
  const bubbles = shops.slice(0, 12).map((s) => {
    const buttons = [];
    const tel = String(s.tel || '').match(/[0-9]{3,}/)?.[0];
    if (tel) buttons.push({ type: 'button', style: 'primary', color: '#06A648', height: 'sm', action: { type: 'uri', label: `โทร ${s.tel}`.slice(0, 40), uri: `tel:${tel}` } });
    if (s.lat && s.lon) buttons.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: 'เปิดแผนที่', uri: `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}` } });
    const bubble = {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'text', text: s.shop_name, size: 'sm', weight: 'bold', wrap: true },
          { type: 'text', text: s.address || '-', size: 'xxs', color: '#5F6B78', wrap: true },
        ],
      },
    };
    if (buttons.length) bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: buttons };
    const img = ctx.imageUrl(s.image);
    if (img) bubble.hero = { type: 'image', url: img, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' };
    return bubble;
  });
  return { type: 'flex', altText: 'สาขา DTC Shop', contents: { type: 'carousel', contents: bubbles } };
}

// Quick Reply — ปุ่มเลือกใต้ช่องแชต (สูงสุด 13 ปุ่ม, ป้ายยาวสุด 20 ตัวอักษร)
export function quickReply(items) {
  return {
    items: items.slice(0, 13).map((it) => ({
      type: 'action',
      action: it.data
        ? { type: 'postback', label: it.label.slice(0, 20), data: it.data, displayText: it.text ?? it.label }
        : { type: 'message', label: it.label.slice(0, 20), text: it.text ?? it.label },
    })),
  };
}
