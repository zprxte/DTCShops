// เขียนสถิติเข้าชมลง tbl_logs รูปแบบเดียวกับเว็บจริงเป๊ะ (ห้ามเปลี่ยน ไม่งั้นรวมกับข้อมูลเก่าไม่ได้) · ล้มเงียบ ไม่พัง request หลัก

const PRODUCT_VIEW_PAGE = 'product-single'

// ตัดความยาวให้พอดีคอลัมน์ VARCHAR
function clamp(value, max) {
  if (value === null || value === undefined) return null
  const text = String(value)
  return text.length > max ? text.slice(0, max) : text
}

// เขียน 1 แถวลง tbl_logs (error = ข้าม)
async function writeLog(prisma, { type, page, message, user_id }) {
  try {
    await prisma.tbl_logs.create({
      data: {
        type: clamp(type, 50),
        page: clamp(page, 100),
        message: clamp(message, 250),
        user_id: clamp(user_id, 25),
        created_at: new Date(),
      },
    })
  } catch (err) {
    console.error('activity log write failed:', err.message)
  }
}

// บันทึกการเข้าดูสินค้า — ใช้ slug เป็นตัวระบุเหมือนข้อมูลจริง
function logProductView(prisma, product) {
  const key = product?.slug || product?.itm_code
  if (!key) return
  return writeLog(prisma, {
    type: 'view',
    page: PRODUCT_VIEW_PAGE,
    message: `การเข้าดูสินค้า : ${key}`,
  })
}

// บันทึกการเข้าดูหน้าเพจ (หน้าแรก/สินค้า/เปรียบเทียบ)
function logPageView(prisma, page) {
  if (!page) return
  return writeLog(prisma, {
    type: 'view',
    page,
    message: `การเข้าดูหน้าเพจ: ${page}`,
  })
}

module.exports = { writeLog, logProductView, logPageView, PRODUCT_VIEW_PAGE }
