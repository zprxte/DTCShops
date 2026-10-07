// ตั้ง rich menu 2 แท็บให้ LINE OA
//   node setup-richmenu.js          → สร้าง/สร้างใหม่ทั้งชุด (ปุ่มเปรียบเทียบเปิด WEB_BASE_URL/compare ถ้าตั้งไว้)
//   node setup-richmenu.js --remove → ลบเมนูที่สคริปต์นี้สร้าง (OA กลับไปใช้เมนูจาก OA Manager)
// bot.js เรียก setupRichMenu() เองตอน npm run bot ที่ไม่มี WEB_BASE_URL — URL ของ tunnel เปลี่ยนทุกครั้ง
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { line, envValue } from './env.js';

const FILE = fileURLToPath(import.meta.url);
const dir = path.dirname(FILE);
const PREFIX = 'dtc-tabs-';
const ALIASES = { gps: 'tab-gps', shop: 'tab-shop' };

// พิกัดบนภาพ 2500 x 1686: แถบแท็บสูง 238 · ตาราง 3 x 2
const TAB_H = 238, ROW_H = 724, COLS = [0, 835, 1665, 2500];
const tabArea = (i, action) => ({ bounds: { x: i * 1250, y: 0, width: 1250, height: TAB_H }, action });
const cell = (row, col, action) => ({
  bounds: { x: COLS[col], y: TAB_H + row * ROW_H, width: COLS[col + 1] - COLS[col], height: ROW_H },
  action,
});
const sw = (to) => ({ type: 'richmenuswitch', richMenuAliasId: ALIASES[to], data: `tab=${to}` });
const msg = (text, label = text) => ({ type: 'message', label: label.slice(0, 20), text });
const uri = (u, label) => ({ type: 'uri', label, uri: u });

// webBase = หน้าเว็บที่คนนอกเปิดได้ · ไม่มี = ปุ่มเปรียบเทียบส่งข้อความให้บอทตอบแทน
function menus(webBase) {
  return {
    gps: {
      image: 'menu-gps.jpg',
      areas: [
        tabArea(0, sw('gps')), tabArea(1, sw('shop')),
        cell(0, 0, msg('แจ้งยอดชำระค่าบริการ')),
        cell(0, 1, sw('shop')), // ดูข้อมูลผลิตภัณฑ์ → เปิดแท็บ DTC SHOPS
        cell(0, 2, msg('สอบถามสินค้า')),
        cell(1, 0, uri('https://www.dtc.co.th', 'ติดตามรถยนต์')), // TODO: ใส่ลิงก์ระบบติดตามรถของจริง
        cell(1, 1, msg('สอบถามเรื่องอื่นๆ')),
        cell(1, 2, uri('https://www.facebook.com/DTCGPSIoT', 'เพจ DTCGPSIoT')),
      ],
    },
    shop: {
      image: 'menu-shop.jpg',
      areas: [
        tabArea(0, sw('gps')), tabArea(1, sw('shop')),
        cell(0, 0, msg('ค้นหาสินค้า')),
        cell(0, 1, webBase ? uri(`${webBase}/compare`, 'เปรียบเทียบสินค้า') : msg('เปรียบเทียบสินค้า')),
        cell(0, 2, msg('สินค้าแนะนำ')),
        cell(1, 0, msg('หมวดหมู่สินค้า')),
        cell(1, 1, msg('สาขา DTC Shop')),
        cell(1, 2, msg('สั่งซื้อออนไลน์')),
      ],
    },
  };
}

export async function removeRichMenu({ log = console.log } = {}) {
  const { aliases } = await line('GET', '/v2/bot/richmenu/alias/list');
  for (const a of aliases) if (Object.values(ALIASES).includes(a.richMenuAliasId)) {
    await line('DELETE', `/v2/bot/richmenu/alias/${a.richMenuAliasId}`);
  }
  const { richmenus } = await line('GET', '/v2/bot/richmenu/list');
  for (const m of richmenus) if (m.name.startsWith(PREFIX)) {
    await line('DELETE', `/v2/bot/richmenu/${m.richMenuId}`);
    log('ลบเมนูเดิม', m.name);
  }
}

export async function setupRichMenu({ webBase = '', log = console.log } = {}) {
  await removeRichMenu({ log });
  const ids = {};
  for (const [key, m] of Object.entries(menus(webBase.replace(/\/$/, '')))) {
    const body = {
      size: { width: 2500, height: 1686 },
      selected: true,
      name: PREFIX + key,
      chatBarText: 'เมนู',
      areas: m.areas,
    };
    await line('POST', '/v2/bot/richmenu/validate', body);
    const { richMenuId } = await line('POST', '/v2/bot/richmenu', body);
    await line('POST', `/v2/bot/richmenu/${richMenuId}/content`, fs.readFileSync(path.join(dir, m.image)),
      { host: 'api-data.line.me', type: 'image/jpeg' });
    await line('POST', '/v2/bot/richmenu/alias', { richMenuAliasId: ALIASES[key], richMenuId });
    ids[key] = richMenuId;
    log('สร้างเมนู', key, '→', richMenuId);
  }
  await line('POST', `/v2/bot/user/all/richmenu/${ids.gps}`);
  log('ตั้งแท็บ DTC GPS & IoT เป็นเมนูเริ่มต้นแล้ว');
  return ids;
}

// รันเป็นสคริปต์ (npm run setup / npm run remove)
if (process.argv[1] && path.resolve(process.argv[1]) === FILE) {
  if (process.argv.includes('--remove')) {
    await removeRichMenu();
    console.log('ลบเรียบร้อย — OA กลับไปใช้เมนูจาก OA Manager');
  } else {
    const webBase = envValue('WEB_BASE_URL');
    if (!webBase) console.log('⚠️ ไม่ได้ตั้ง WEB_BASE_URL — ปุ่มเปรียบเทียบจะส่งข้อความให้บอทตอบแทนการเปิดหน้าเว็บ');
    await setupRichMenu({ webBase });
  }
}
