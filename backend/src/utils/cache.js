// แคชในหน่วยความจำแบบมีอายุ (ค่าเริ่มต้น 5 นาที)
const store = new Map()

const DEFAULT_TTL_MS = 5 * 60 * 1000

// คืนค่าที่แคชไว้ถ้ายังไม่หมดอายุ ไม่งั้นเรียก loader() แล้วเก็บผล
function cached(key, loader, ttlMs = DEFAULT_TTL_MS) {
  const hit = store.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value

  const value = Promise.resolve()
    .then(loader)
    .catch((err) => {
      // โหลดพลาดห้ามค้างในแคช ไม่งั้น error ถูกเสิร์ฟซ้ำ 5 นาที
      store.delete(key)
      throw err
    })

  store.set(key, { value, expiresAt: Date.now() + ttlMs })
  return value
}

// ล้างแคชตาม prefix ("categories" ล้าง "categories:xxx" ด้วย)
function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`)) store.delete(key)
  }
}

// ล้างแคชทั้งหมด
function clearAll() {
  store.clear()
}

module.exports = { cached, invalidate, clearAll }
