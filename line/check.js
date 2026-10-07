import { loadLineEnv, line } from './env.js';

const { secret, token } = loadLineEnv();
console.log('secret: length', secret.length, /^[0-9a-f]{32}$/.test(secret) ? 'OK (32 hex)' : 'รูปแบบไม่ตรง (ควรเป็น 32 ตัว 0-9a-f)');
console.log('token : length', token.length, token.length > 100 ? 'OK' : 'สั้นเกินไป — น่าจะไม่ใช่ access token');
try {
  const info = await line('GET', '/v2/bot/info');
  console.log('bot   :', info.displayName, '| basicId', info.basicId, '| chatMode', info.chatMode);
  const menus = await line('GET', '/v2/bot/richmenu/list');
  console.log('rich menus ที่ตั้งผ่าน API อยู่แล้ว:', menus.richmenus.length);
} catch (e) {
  console.log('เรียก LINE ไม่สำเร็จ:', e.message);
}
