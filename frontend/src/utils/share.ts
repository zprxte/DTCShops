// คัดลอกลิงก์: navigator.clipboard (HTTPS/localhost) → execCommand (http ใน LAN) → toast แสดง URL ให้คัดลอกเอง
import { toast } from '../stores/toast'

// คัดลอกด้วย execCommand (ใช้ได้บน http ที่ไม่ปลอดภัย)
function legacyCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    // ต้องอยู่ใน DOM ถึงจะ select ได้ — fixed + opacity 0 ไม่ให้หน้ากระโดด
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    // iOS Safari ต้องระบุช่วงเลือกเอง
    textarea.setSelectionRange(0, text.length)
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  } catch {
    return false
  }
}

// คัดลอกลิงก์แล้วขึ้น toast (ทำไม่ได้ = แสดง URL ให้คัดลอกเอง)
export async function copyLink(url: string, copiedMessage: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(copiedMessage)
      return
    } catch {
    }
  }
  if (legacyCopy(url)) {
    toast.success(copiedMessage)
    return
  }
  toast.info(url)
}
