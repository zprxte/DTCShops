// สร้างข้อความ Flex ของ LINE (การ์ดสินค้า / สเปค / สาขา / Quick Reply)

const SPEC_ROWS = 8; // การ์ด LINE ขยายเองไม่ได้ — ที่เหลือดูบนเว็บ

// ราคาแบบเว็บ: 0 = ติดต่อสอบถาม · โมเดลราคาต่างกัน = ช่วงราคา
export function formatPrice(p) {
  const min = Number(p.product_price ?? 0);
  const max = Number(p.product_price_max ?? min);
  if (!(min > 0)) return 'ติดต่อสอบถาม';
  const baht = (n) => '฿' + n.toLocaleString('th-TH');
  return max > min ? `${baht(min)} – ${baht(max)}` : baht(min);
}

const shortName = (name) => (name.length > 40 ? name.slice(0, 40) + '…' : name);

// LINE ปฏิเสธทั้งข้อความถ้าลิงก์ไม่สมบูรณ์ (ลิงก์ Shopee บางตัวใน DB ถูกตัดกลาง %xx) จึงกรองก่อน
function okUri(u) {
  if (typeof u !== 'string' || u.length > 1000 || !/^(https?:|tel:|line:)/.test(u)) return false;
  try { decodeURI(u); new URL(u); return true; } catch { return false; }
}

// การ์ดสินค้า 1 ใบ: รูป หมวด ชื่อ ราคา + ปุ่มดูคุณสมบัติ/ดูบนเว็บ
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

// การ์ดใบสุดท้าย "ดูเพิ่มเติม" — กดแล้วบอทส่งชุดถัดไป
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

// carousel สินค้า (มี more = 11 ใบ + การ์ดดูเพิ่มเติม เพราะ LINE รับได้ 12 ใบ)
export function productCarousel(products, ctx, altText = 'สินค้า', more = null) {
  const bubbles = products.slice(0, more ? 11 : 12).map((p) => productBubble(p, ctx));
  if (more) bubbles.push(moreBubble(more));
  return { type: 'flex', altText, contents: { type: 'carousel', contents: bubbles } };
}

// การ์ดสเปค: หลายโมเดล = การ์ดปัดละโมเดล · โมเดลเดียว = การ์ดเดียว
export function specBubble(d, ctx) {
  const models = (d.product_model || []).slice(0, 12);
  if (models.length < 2) return { type: 'flex', altText: `คุณสมบัติ ${shortName(d.product_name)}`, contents: specCard(d, ctx) };
  return [
    { type: 'text', text: `${shortName(d.product_name)} มี ${d.product_model.length} โมเดลครับ ปัดดูทีละโมเดล` },
    { type: 'flex', altText: `คุณสมบัติ ${shortName(d.product_name)} (${models.length} โมเดล)`, contents: { type: 'carousel', contents: models.map((m) => specCard(d, ctx, m)) } },
  ];
}

// การ์ดสเปคของสินค้า/โมเดล — ค่าเฉพาะโมเดลขึ้นก่อนเพราะการ์ดตัดที่ SPEC_ROWS แถว
function specCard(d, ctx, model = null) {
  const toSpec = (a, own) => ({ k: a.attribute?.attribute_name ?? '', v: String(a.value ?? ''), own });
  const own = (model?.product_attribute_value || []).map((a) => toSpec(a, true));
  const ownNames = new Set(own.map((s) => s.k));
  const specs = [...own, ...(d.product_attribute_value || []).map((a) => toSpec(a, false)).filter((s) => !ownNames.has(s.k))];
  const rows = specs.slice(0, SPEC_ROWS).map((s) => ({
    type: 'box', layout: 'horizontal', spacing: 'md', margin: 'sm',
    contents: [
      { type: 'text', text: s.k || '-', size: 'xxs', color: s.own ? '#1F6FB2' : '#5F6B78', flex: 4, wrap: true },
      { type: 'text', text: s.v || '-', size: 'xxs', weight: 'bold', color: s.own ? '#1F6FB2' : '#111111', flex: 6, wrap: true },
    ],
  }));

  const head = [{ type: 'text', text: d.product_name, size: 'sm', weight: 'bold', wrap: true, maxLines: 3, flex: 1 }];
  const img = ctx.imageUrl(d.product_image);
  if (img) head.unshift({ type: 'image', url: img, size: 'xs', aspectMode: 'fit', flex: 0, backgroundColor: '#FFFFFF' });

  const price = model ? formatPrice({ product_price: model.product_price ?? d.product_price }) : formatPrice(d);
  const body = [
    { type: 'box', layout: 'horizontal', spacing: 'md', contents: head, alignItems: 'center' },
    ...(model ? [{ type: 'text', text: `โมเดล: ${model.model_name}`, size: 'sm', weight: 'bold', color: '#D6402A', margin: 'md', wrap: true }] : []),
    { type: 'text', text: `คุณสมบัติ · ${price}`, size: 'xs', weight: 'bold', color: '#1F6FB2', margin: model ? 'sm' : 'lg' },
    { type: 'separator', margin: 'sm' },
    ...(rows.length ? rows : [{ type: 'text', text: 'ยังไม่มีข้อมูลคุณสมบัติ', size: 'xs', color: '#5F6B78', margin: 'sm' }]),
  ];
  if (own.length) body.push({ type: 'text', text: 'ตัวสีน้ำเงิน = เฉพาะโมเดลนี้', size: 'xxs', color: '#1F6FB2', margin: 'md' });
  if (specs.length > SPEC_ROWS) {
    body.push({ type: 'text', text: `อีก ${specs.length - SPEC_ROWS} หัวข้อ ${ctx.webUrl(d) ? 'กด “ดูคุณสมบัติทั้งหมด”' : 'ดูได้บนเว็บ'}`, size: 'xxs', color: '#5F6B78', margin: 'md' });
  }

  // ไม่มีปุ่มสั่งซื้อ LINE เพราะลูกค้าคุยอยู่ใน LINE ร้านแล้ว
  const buttons = [
    ['Shopee', d.shopee_link, '#D8481C'], ['Lazada', d.lazada_link, '#1A1A8E'], ['TikTok', d.tiktok_link, '#111111'],
  ].filter(([, u]) => okUri(u)).map(([label, uri, color]) => ({
    type: 'button', style: 'primary', color, height: 'sm', action: { type: 'uri', label: `สั่งซื้อ ${label}`, uri },
  }));
  // shrink-to-fit: ครึ่งแถวบนมือถือจริงตัดชื่อปุ่มเว็บ
  const web = ctx.webUrl(d);
  if (web) buttons.push({ type: 'button', style: 'primary', color: '#1F6FB2', height: 'sm', adjustMode: 'shrink-to-fit', action: { type: 'uri', label: 'ดูคุณสมบัติทั้งหมด', uri: web } });
  const footer = [];
  for (let i = 0; i < buttons.length; i += 2) {
    const row = buttons.slice(i, i + 2);
    if (row.length === 1) row.push({ type: 'box', layout: 'vertical', contents: [], flex: 1 });
    footer.push({ type: 'box', layout: 'horizontal', spacing: 'sm', contents: row });
  }

  const bubble = { type: 'bubble', size: 'mega', body: { type: 'box', layout: 'vertical', contents: body } };
  if (footer.length) bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer };
  return bubble;
}

// "1176 ต่อ 51" → tel:1176,51 (จุลภาค = รอสายแล้วกดเบอร์ต่อให้)
function telUri(raw) {
  const [main, ext] = String(raw || '').split(/ต่อ|ext\.?|#/i).map((s) => (s || '').replace(/\D/g, ''));
  if (!main || main.length < 3) return null;
  return `tel:${main}${ext ? ',' + ext : ''}`;
}

// carousel สาขา (มี more = 11 ใบ + การ์ดดูเพิ่มเติม)
export function shopCarousel(shops, ctx, altText = 'สาขา DTC Shop', more = null) {
  const bubbles = shops.slice(0, more ? 11 : 12).map((s) => {
    const buttons = [];
    const tel = telUri(s.tel);
    if (tel) buttons.push({ type: 'button', style: 'primary', color: '#06A648', height: 'sm', action: { type: 'uri', label: `โทร ${s.tel}`.slice(0, 40), uri: tel } });
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
  if (more) bubbles.push(moreBubble(more));
  return { type: 'flex', altText, contents: { type: 'carousel', contents: bubbles } };
}

// ปุ่ม Quick Reply ใต้ช่องแชต (สูงสุด 13 ปุ่ม ป้ายยาวสุด 20 ตัวอักษร)
export function quickReply(items) {
  return {
    items: items.slice(0, 13).map((it) => ({
      type: 'action',
      action: it.keyboard != null
        ? { type: 'postback', label: it.label.slice(0, 20), data: it.data, inputOption: 'openKeyboard', fillInText: it.keyboard }
        : it.data
          ? { type: 'postback', label: it.label.slice(0, 20), data: it.data, displayText: it.text ?? it.label }
          : { type: 'message', label: it.label.slice(0, 20), text: it.text ?? it.label },
    })),
  };
}
