const store = new Map()

const DEFAULT_TTL_MS = 5 * 60 * 1000

//คืนค่าที่แคชไว้ถ้ายังไม่หมดอายุ ไม่งั้นเรียก loader() แล้วเก็บผลไว้
function cached(key, loader, ttlMs = DEFAULT_TTL_MS) {
  const hit = store.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value

  const value = Promise.resolve()
    .then(loader)
    .catch((err) => {
      // โหลดพลาดห้ามค้างอยู่ในแคช ไม่งั้น error จะถูกเสิร์ฟซ้ำไปอีก 5 นาที
      store.delete(key)
      throw err
    })

  store.set(key, { value, expiresAt: Date.now() + ttlMs })
  return value
}

// ล้างแคชตาม prefix ("categories" ล้าง "categories" กับ "categories:xxx" ด้วย)
function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`)) store.delete(key)
  }
}

function clearAll() {
  store.clear()
}

module.exports = { cached, invalidate, clearAll }
