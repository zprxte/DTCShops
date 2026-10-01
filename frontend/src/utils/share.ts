import { toast } from '../stores/toast'

/**
 * คัดลอกลิงก์ใส่คลิปบอร์ด แบบที่ใช้ได้ทุกสภาพแวดล้อม (เพิ่ม 16 ก.ย. 2026)
 *
 * ปัญหาที่แก้: `navigator.clipboard` มีให้ใช้เฉพาะ **secure context** (HTTPS หรือ
 * localhost) เท่านั้น — ตอนทดสอบ/ทำ UAT ที่เปิดผ่าน `http://<IP>:5173` บนมือถือ
 * `navigator.clipboard` เป็น `undefined` ทั้งก้อน โค้ดเดิมเขียน
 * `navigator.clipboard?.writeText(url).then(ok, fail)` ซึ่ง `?.` ทำให้ทั้งบรรทัด
 * ถูกข้ามรวมถึง `.then()` → กดปุ่มแล้วเงียบสนิท ไม่มีแม้แต่ toast แจ้งเตือน
 *
 * ทางแก้เป็นชั้น ไล่จากวิธีที่ดีที่สุดลงมา:
 *   1. navigator.clipboard  — HTTPS/localhost (รวมถึงบน production จริง)
 *   2. execCommand('copy')  — API เก่าที่ deprecated แล้ว แต่ยังทำงานบน origin
 *                             ที่ไม่ปลอดภัย ซึ่งคือสภาพของการทดสอบในวง LAN
 *   3. toast แสดง URL       — คัดลอกให้ไม่ได้จริงๆ ก็แสดงให้ผู้ใช้คัดลอกเอง
 *                             ดีกว่าไม่มีอะไรเกิดขึ้น
 *
 * ขึ้น production ที่เป็น HTTPS แล้วชั้นที่ 1 จะทำงานเสมอ — ชั้น 2-3 เป็นตาข่าย
 * รองรับกรณีที่ writeText ปฏิเสธเองได้แม้บน HTTPS (ผู้ใช้ไม่ให้สิทธิ์ / แท็บไม่ได้ focus)
 */
function legacyCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    // ต้องอยู่ใน DOM และมองเห็นได้ในทางเทคนิคถึงจะ select ได้ แต่ห้ามให้หน้าเว็บ
    // กระโดด — fixed + opacity 0 จึงไม่ดันเลย์เอาต์และไม่ทำให้หน้าเลื่อน
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    // iOS Safari ไม่สนใจ select() อย่างเดียว ต้องระบุช่วงเองด้วย
    textarea.setSelectionRange(0, text.length)
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  } catch {
    return false
  }
}

export async function copyLink(url: string, copiedMessage: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(copiedMessage)
      return
    } catch {
      // ตกไปใช้วิธีสำรองด้านล่าง
    }
  }
  if (legacyCopy(url)) {
    toast.success(copiedMessage)
    return
  }
  toast.info(url)
}
