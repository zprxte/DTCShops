// ถ่ายภาพ rich menu จาก rich-menu.html ให้ได้ 2500 x 1686 พอดี (กว้าง 500px x zoom 2.5 x deviceScaleFactor 2 = 1250 x 843 จุดเต็ม)
import { chromium } from 'playwright';
import path from 'path';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 2600, height: 2400 }, deviceScaleFactor: 2 });
await p.goto(new URL('./rich-menu.html', import.meta.url).href);
await p.evaluate(() => document.fonts.ready);
await p.addStyleTag({ content: `
  .wrap { grid-template-columns: 1400px 1fr !important; max-width: none !important; }
  .phone { width: 520px !important; max-width: none !important; padding: 10px !important; zoom: 2.5; }
  .rich { width: 500px !important; height: 337.2px !important; aspect-ratio: auto !important; }
  .cell { font-size: 15.5px !important; }
  .cell svg, .cell .fb { width: 48px !important; height: 48px !important; }
  .cell .fb { font-size: 34px !important; }
  .cell .shops img { width: 32px !important; height: 32px !important; }
  .tab { font-size: 17px !important; }
  .tab .new { font-size: 12px !important; }
  .cell:hover { filter: none !important; }
`});
for (const tab of ['gps', 'shop']) {
  await p.evaluate((t) => document.querySelector(`[data-tab=${t}]`).click(), tab);
  await p.mouse.move(0, 0);
  // ตัดภาพตามกรอบเมนูเอง — ขอบบนของ .rich อยู่ที่พิกัดทศนิยม ถ่ายทั้ง element แล้วติดเส้นดำของหน้าจอมาด้วย
  const box = await p.locator('#rich').boundingBox();
  const clip = { x: Math.ceil(box.x), y: Math.ceil(box.y), width: 1250, height: 843 };
  await p.screenshot({ path: path.join(dir, `menu-${tab}.jpg`), type: 'jpeg', quality: 90, clip });
  console.log(`menu-${tab}.jpg`, box.width, 'x', box.height, '(css px หลัง zoom)');
}
await b.close();
