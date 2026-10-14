// อ่านค่าจาก env / line/.env และเรียก LINE Messaging API
import fs from 'fs';
import { fileURLToPath } from 'url';

const ENV_FILE = fileURLToPath(new URL('./.env', import.meta.url));

// อ่านค่าหนึ่งตัว: ตัวแปรสภาพแวดล้อมมาก่อน แล้วค่อยดู line/.env — ไม่มี = สตริงว่าง
export function envValue(key) {
  if (process.env[key]) return process.env[key].trim();
  if (!fs.existsSync(ENV_FILE)) return '';
  const text = fs.readFileSync(ENV_FILE, 'utf8');
  const m = text.match(new RegExp('^\\s*' + key + '\\s*=\\s*(.*)$', 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

// คืน channel secret และ access token
export function loadLineEnv() {
  return { secret: envValue('LINE_CHANNEL_SECRET'), token: envValue('LINE_CHANNEL_ACCESS_TOKEN') };
}

// เรียก LINE API แล้วคืน JSON (ล้ม = throw พร้อมข้อความจาก LINE)
export async function line(method, path, body, { host = 'api.line.me', type = 'application/json' } = {}) {
  const { token } = loadLineEnv();
  const res = await fetch(`https://${host}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': type } : {}) },
    body: body == null ? undefined : type === 'application/json' ? JSON.stringify(body) : body,
  });
  const out = await res.text();
  let data; try { data = JSON.parse(out); } catch { data = out; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}
