// เขียนบันทึกกิจกรรมลง tbl_logs — ตารางเดียวกับที่ dtcshops.com ของจริงใช้
// (restore มาพร้อมดัมป์ มีข้อมูลจริง 39,395 แถวถึง 3 ส.ค. 2026) ไม่ได้สร้าง
// ตารางใหม่ของโปรเจกต์นี้เอง จึงต้องเขียนให้รูปแบบ message/type/page ตรงกับ
// ของเดิมทุกประการ ไม่งั้นสถิติเก่ากับใหม่จะรวมกันไม่ได้
//
// รูปแบบที่ข้อมูลจริงใช้ (ห้ามเปลี่ยน):
//   type='view'  page='product-single'  message='การเข้าดูสินค้า : <slug>'
//   type='view'  page='pge-0000001'     message='การเข้าดูหน้าเพจ: <page>'
//
// ทุกฟังก์ชันในไฟล์นี้ "ห้ามพัง request หลัก" — การบันทึก log ล้มเหลวไม่ควร
// ทำให้ผู้ใช้เปิดหน้าสินค้าไม่ได้ จึง catch ทุก error แล้วปล่อยผ่าน

const PRODUCT_VIEW_PAGE = 'product-single'

// ตัดความยาวให้พอดีคอลัมน์จริง (VARCHAR ตามตารางต้นทาง) กันเขียนไม่ลง
function clamp(value, max) {
  if (value === null || value === undefined) return null
  const text = String(value)
  return text.length > max ? text.slice(0, max) : text
}

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

// เข้าดูหน้าสินค้า — ใช้ slug เป็นตัวระบุสินค้าเหมือนข้อมูลจริง (ไม่ใช่ itm_code)
// เพราะแดชบอร์ดต้อง join ข้อมูลเก่ากับใหม่เข้าด้วยกันได้
function logProductView(prisma, product) {
  const key = product?.slug || product?.itm_code
  if (!key) return
  return writeLog(prisma, {
    type: 'view',
    page: PRODUCT_VIEW_PAGE,
    message: `การเข้าดูสินค้า : ${key}`,
  })
}

// เข้าดูหน้าเพจทั่วไป (หน้าแรก/ค้นหา/เปรียบเทียบ) — หน้าสินค้าไม่ผ่านทางนี้
// เพราะ backend บันทึกให้เองแล้วตอนดึงข้อมูลสินค้า
function logPageView(prisma, page) {
  if (!page) return
  return writeLog(prisma, {
    type: 'view',
    page,
    message: `การเข้าดูหน้าเพจ: ${page}`,
  })
}

module.exports = { writeLog, logProductView, logPageView, PRODUCT_VIEW_PAGE }
