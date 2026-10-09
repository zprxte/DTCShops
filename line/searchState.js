// ผู้ใช้ที่เพิ่งกด "ค้นหาสินค้า" — ข้อความถัดไปถือเป็นคำค้นจนถึงเวลาที่เก็บไว้
//   ไม่ได้ตั้ง SUPABASE_URL + SUPABASE_SERVICE_KEY → จำในหน่วยความจำ (npm run bot ในเครื่อง — process เดียวรันตลอด)
//   ตั้งไว้ (Vercel) → ตาราง line_search_state ใน Supabase ผ่าน REST API
//     เพราะ function บน Vercel แต่ละคำขออาจได้ instance ใหม่ หน่วยความจำไม่คงอยู่
//     ตารางสร้างด้วย SQL ใน line/README.md (เปิด RLS ไว้ — มีแต่ service_role เข้าถึง)
import { envValue } from './env.js';

function memoryStore() {
  const map = new Map();
  return {
    async get(user) { return map.get(user) || 0; },
    async set(user, until) { map.set(user, until); },
    async delete(user) { map.delete(user); },
  };
}

function supabaseStore(url, key) {
  const base = `${url}/rest/v1/line_search_state`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const call = async (path, init) => {
    const res = await fetch(base + path, { ...init, headers: { ...headers, ...init?.headers } });
    if (!res.ok) throw new Error(`line_search_state ${init?.method || 'GET'} → ${res.status} ${await res.text()}`);
    return res;
  };
  return {
    async get(user) {
      const rows = await (await call(`?user_id=eq.${encodeURIComponent(user)}&select=until`)).json();
      return rows[0] ? Date.parse(rows[0].until) : 0;
    },
    async set(user, until) {
      await call('?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: user, until: new Date(until).toISOString() }),
      });
    },
    async delete(user) {
      await call(`?user_id=eq.${encodeURIComponent(user)}`, { method: 'DELETE' });
    },
  };
}

export function createSearchState() {
  const url = envValue('SUPABASE_URL').replace(/\/$/, '');
  const key = envValue('SUPABASE_SERVICE_KEY');
  return url && key ? supabaseStore(url, key) : memoryStore();
}
