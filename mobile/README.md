# DTC SHOPS — แอป Android

## ระบบนี้คืออะไร

แอปมือถือของระบบค้นหาและเปรียบเทียบสินค้า DTC ทำด้วย Flutter (Dart) ใช้ API ชุดเดียวกับเว็บ (`backend/`) ข้อมูลสินค้าจึงตรงกับหน้าเว็บเสมอ

แถบเมนูล่าง 3 แท็บ: **หน้าแรก / สินค้า / เปรียบเทียบ**

| จอ | ทำอะไรได้ |
|---|---|
| หน้าแรก | ช่องค้นหา · หมวดหมู่ · สินค้าแนะนำ (ยอดนิยม) · รายชื่อสาขาพร้อมปุ่มโทร |
| สินค้าทั้งหมด | grid สินค้า · กรองหมวดหมู่/แท็ก · เรียงลำดับ · แบ่งหน้า |
| ค้นหา | แนะนำคำขณะพิมพ์ · ประวัติการค้นหา · พิมพ์ผิด/ลืมสลับแป้นก็เจอ · "คุณหมายถึง…?" |
| รายละเอียดสินค้า | แกลเลอรีรูป · เลือกโมเดล · ตัวเลือกเสริม · สเปค · ปุ่มสั่งซื้อเปิดแอป Shopee / Lazada / TikTok / LINE |
| เปรียบเทียบ | เทียบสเปค 2 ชิ้น (เทียบสินค้าเดียวกันคนละโมเดลได้) · ป้ายเหมือน/ต่าง · คัดกรองคุณสมบัติ · จำรายการไว้แม้ปิดแอป |

ภาษา UI: ไทย / อังกฤษ / ญี่ปุ่น · **Android เท่านั้น** (build iOS ต้องใช้ Mac — ผู้ใช้ iPhone ใช้เว็บแทนได้)

---

## วิธีติดตั้ง

### แบบที่ 1: ลงไฟล์ APK (ผู้ใช้ทั่วไป)

1. ขอไฟล์ `app-release.apk` จากผู้พัฒนา
2. ก๊อปไฟล์ลงมือถือแล้วกดติดตั้ง (ต้องอนุญาต "ติดตั้งแอปที่ไม่รู้จัก" ในเครื่อง)

ถ้าไฟล์ build ให้ชี้ `https://dtc-shops.vercel.app` (ดูคำสั่ง build ด้านล่าง) ใช้เน็ตมือถือได้เลย ไม่ต้องเปิดคอม · ถ้า build ให้ชี้ IP ของคอม มือถือต้องอยู่วง Wi-Fi เดียวกับคอมที่รัน backend

### แบบที่ 2: build เอง (นักพัฒนา)

**สิ่งที่ต้องมี**

- [Flutter SDK](https://docs.flutter.dev/get-started/install) (Dart 3.13 ขึ้นไป) + Android Studio (Android SDK และ emulator)
- Windows: **เปิด Developer Mode** ก่อน (`start ms-settings:developers`) — ไม่เปิด plugin `shared_preferences` สร้าง symlink ไม่ได้และ build พัง
- backend ที่แอปจะเรียก — รันเองในเครื่อง (ดู [README หลัก](../README.md)) หรือใช้ `https://dtc-shops.vercel.app`

ตรวจเครื่องมือด้วย `flutter doctor`

**ติดตั้ง package**

```bash
cd mobile
flutter pub get
```

**รันระหว่างพัฒนา**

ที่อยู่ backend ส่งตอนสั่งรันผ่าน `--dart-define=API_ORIGIN` ไม่ต้องแก้โค้ด

| รันบน | คำสั่ง |
|---|---|
| Emulator + backend ในเครื่อง | `flutter run` (ค่าเริ่มต้น `http://10.0.2.2:4000` = เครื่องคอมเมื่อมองจาก emulator) |
| มือถือจริง + backend ในเครื่อง | `flutter run --dart-define=API_ORIGIN=http://<IP ของคอม>:4000` — มือถือต้องอยู่วง Wi-Fi เดียวกับคอม (ดู IP ด้วย `ipconfig`) |
| backend บนคลาวด์ | `flutter run --dart-define=API_ORIGIN=https://dtc-shops.vercel.app` |

ต่อหลายเครื่องพร้อมกันให้ระบุเครื่อง: `flutter devices` แล้ว `flutter run -d <serial>`

**build ไฟล์ APK**

```bash
flutter build apk --release --dart-define=API_ORIGIN=https://dtc-shops.vercel.app
```

ได้ไฟล์ที่ `build/app/outputs/flutter-apk/app-release.apk` (~46 MB) · ลงเครื่องด้วย `adb install -r <ไฟล์>` · อยากได้ไฟล์เล็กลงเพิ่ม `--split-per-abi` (~17 MB ต่อไฟล์ เครื่องส่วนใหญ่ใช้ `arm64-v8a`)

- ที่อยู่ backend ถูกฝังตอน build — ถ้าชี้ IP ของคอมแล้ว IP เปลี่ยน ต้อง build ใหม่
- ตอนนี้เซ็นด้วย debug key แจกทดสอบได้แต่ขึ้น Google Play ไม่ได้

### ปัญหาที่เจอบ่อย

| อาการ | วิธีแก้ |
|---|---|
| build ขึ้น error เรื่อง symlink | เปิด Windows Developer Mode |
| แอปเปิดได้แต่ไม่มีข้อมูล | backend ไม่ได้รัน หรือ `API_ORIGIN` ผิด · มือถือจริงห้ามใช้ `localhost` |
| emulator ค้างตั้งแต่ยังไม่บูต (`adb devices` ว่าง) | ตั้ง Graphics เป็น *Software - GLES 2.0* ใน Android Studio › Edit AVD (หรือ `hw.gpu.mode=swiftshader_indirect` ใน `config.ini` ของ AVD) |
| พิมพ์ภาษาไทยใน emulator ไม่ได้ | คัดลอกข้อความแล้ววางแทน |
