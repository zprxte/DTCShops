# Mobile App — Product Search & Comparison System

> เพิ่มเข้าขอบเขตงานเมื่อ **15 ก.ย. 2026** · Flutter (Dart) · package `search_comparison_product`

## สถานะ

🟡 **ครบ 5 จอตาม wireframe แล้ว** — หน้าแรก / สินค้าทั้งหมด / ค้นหา / รายละเอียดสินค้า / เปรียบเทียบ · ยังไม่มี: สลับภาษา TH-EN-JA, แผนที่สาขา (ต้องลง `flutter_map`), เปิดลิงก์ร้านค้าจากปุ่มสั่งซื้อ (ต้องลง `url_launcher`), ตะกร้าเปรียบเทียบยังไม่จำข้ามการเปิดแอป (ดู checklist "Mobile App" ใน [`CLAUDE.md`](../CLAUDE.md) หัวข้อ 2.3)

⚠️ ตั้งแต่ลง `shared_preferences` **ต้องเปิด Windows Developer Mode** ก่อน build/run (`start ms-settings:developers`) ไม่งั้น plugin สร้าง symlink ไม่ได้

**แพลตฟอร์ม: Android เท่านั้น** — build iOS ต้องใช้ Xcode บน macOS ซึ่งเครื่องพัฒนาเป็น Windows · ผู้ใช้ iPhone เปิดเว็บแทนได้ (ฟังก์ชันครบกว่าแอป)

## โครงสร้างโค้ด

| ไฟล์ | หน้าที่ |
|---|---|
| `lib/main.dart` | `MaterialApp` + `colorScheme` จากสี brand · ตอนนี้เปิดที่ `ProductsScreen` |
| `lib/config/api_config.dart` | ที่อยู่ backend อ่านจาก `--dart-define=API_ORIGIN` + `imageUrl()` ต่อ origin ให้ path `/uploads/...` — แอปไม่มี Vite proxy แบบเว็บ จึงต้องต่อเอง |
| `lib/config/app_colors.dart` | สี brand/navy ถอดมาจาก `frontend/tailwind.config.js` — เป็น `static const` เพื่อให้ใส่ใน `const` widget ได้ |
| `lib/utils/format.dart` | `formatPrice()` — ราคา 0 = "ติดต่อสอบถาม" + คั่นหลักพัน (กติกาเดียวกับเว็บ อยู่ที่เดียวไม่ต้องเขียนซ้ำทุกหน้า) |
| `lib/models/*.dart` | `fromJson` ของแต่ละ endpoint — `product.dart` (การ์ด) · `product_detail.dart` (หน้ารายละเอียด) · `compare_product.dart` (ตารางเทียบสเปค) · `filter_option.dart` (ตัวกรอง/เรียง) · `category.dart` · `shop.dart` — `product_id` เป็น String |
| `lib/services/api_service.dart` | `fetchProducts()` (รับ `categoryId`, `categoryIds`, `tags`, `sort`) · `searchProducts()` · `fetchAutocomplete()` · `fetchCompare()` · `fetchProductDetail()` · `fetchFilters()` · `fetchCategories()` · `fetchShops()` · response ของ `/products` เป็น `{ products: [...], total, page, total_pages }` ไม่ใช่ array ตรงๆ |
| `lib/stores/compare_store.dart` | ตะกร้าเปรียบเทียบของทั้งแอป (singleton + `ValueNotifier`) เพดาน 4 ชิ้นเท่าเว็บ — หน้าไหนครอบด้วย `ValueListenableBuilder` ก็อัปเดตเองเมื่อรายการเปลี่ยน |
| `lib/stores/search_history.dart` | ประวัติการค้นหา 10 คำล่าสุด เก็บในเครื่องด้วย `shared_preferences` (ไม่ส่งขึ้น server จึงไม่ต้องมีระบบล็อกอิน) |
| `lib/utils/snap_scroll_physics.dart` | ทำให้ตัวเลื่อนแนวนอนหยุดตรงขอบช่องเสมอ — ใช้ทั้งรางสินค้าแนะนำและตารางเปรียบเทียบ |
| `lib/utils/highlight.dart` | ตัดชื่อสินค้าเป็นช่วงเพื่อไฮไลต์คำค้น (เทียบเท่า `highlightSegments()` ของเว็บ) |
| `lib/widgets/product_card.dart` | การ์ดสินค้า — รูปเป็น `Expanded` (การ์ดเตี้ยลงรูปหดเอง ไม่ล้น) · ชื่อจองที่ 2 บรรทัดตามขนาดตัวอักษรของเครื่อง · ปุ่มเปรียบเทียบ 2 สถานะ |
| `lib/widgets/product_rail.dart` · `pagination_bar.dart` · `filter_sheet.dart` · `search_bar_button.dart` | รางสินค้าแนะนำ (ปุ่มลูกศร + หยุดตรงขอบการ์ด) · แถบเลขหน้าแบบวงกลม · แผ่นตัวกรอง/เรียง · ช่องค้นหาแคปซูล |
| `lib/screens/main_screen.dart` | แถบเมนูล่าง 3 แท็บ (`IndexedStack`) + ป้ายจำนวนสินค้าที่เปรียบเทียบ |
| `lib/screens/products_screen.dart` | สินค้าทั้งหมด — grid 2 คอลัมน์ + ตัวกรอง + แบ่งหน้า · หน้าเดียวกันนี้แสดงผลการค้นหาเมื่อส่ง `searchword` |
| `lib/screens/home_screen.dart` | หน้าแรก — เรียงตาม `HomePage.vue`: ค้นหา → หมวดหมู่ → สินค้าแนะนำ → สาขา (ไม่มีแบนเนอร์ — เว็บมี) |
| `lib/screens/search_screen.dart` · `product_detail_screen.dart` · `compare_screen.dart` | ค้นหา (autocomplete + ประวัติ) · รายละเอียดสินค้า (แกลเลอรี/โมเดล/ตัวเลือก/แท็บสเปค) · ตารางเทียบสเปค |

อ่าน response ต้อง `utf8.decode(response.bodyBytes)` ไม่ใช่ `response.body` — ตัวหลังตกไปใช้ latin1 เมื่อ header ไม่ระบุ charset ทำให้ข้อความไทยเพี้ยน

ชื่อโฟลเดอร์ใน `lib/` ต้องเป็น**ตัวพิมพ์เล็กทั้งหมด** — import ที่พิมพ์ตัวใหญ่เล็กต่างกัน Dart นับเป็นคนละไฟล์ แม้ Windows จะเปิดได้ทั้งคู่

## รันระหว่างพัฒนา

1. ให้ backend รันอยู่ (`docker compose up -d` ใน `database/`)
2. `flutter emulators --launch Pixel_8` แล้ว `flutter run`
3. **ไม่ต้องแก้โค้ดเวลาเปลี่ยนเครื่องที่รัน** — ทับที่อยู่ backend ตอนสั่งรันได้เลย:

| รันบน | คำสั่ง |
|---|---|
| Emulator | `flutter run` เฉยๆ — `defaultValue` เป็น `http://10.0.2.2:4000` อยู่แล้ว (emulator มองเครื่องคอมเป็น `10.0.2.2` เสมอ ไม่ใช่ IP วง Wi-Fi) |
| มือถือจริง | `flutter run --dart-define=API_ORIGIN=http://<IP ของคอม>:4000` — ต้องอยู่วง Wi-Fi เดียวกัน (ดู IP ด้วย `ipconfig`) |

⚠️ `--dart-define` จะมีผลก็ต่อเมื่อโค้ดอ่านค่าด้วย `String.fromEnvironment` — ถ้าเผลอเปลี่ยนกลับเป็นค่า hardcode **Flutter จะเมิน flag เงียบๆ โดยไม่เตือน** build ผ่านปกติแต่ได้ค่าเดิม

## build ไฟล์ติดตั้ง (APK)

```bash
flutter build apk --release --dart-define=API_ORIGIN=http://<IP ของคอม>:4000
```
ได้ไฟล์ที่ `build/app/outputs/flutter-apk/app-release.apk` (~46 MB) ลงเครื่องด้วย `adb install -r <ไฟล์>` หรือก๊อปไปกดติดตั้งเอง

- **IP ถูกฝังตอน build** — DHCP เปลี่ยน IP เมื่อไหร่ต้อง build ใหม่ · ตรวจว่าค่าเข้าจริงด้วยการแกะ APK แล้ว `grep` หา IP ใน `lib/arm64-v8a/libapp.so`
- ตอนนี้เซ็นด้วย **debug key** (ดู TODO ใน `android/app/build.gradle.kts`) — แจกทดสอบได้ แต่ขึ้น Google Play ไม่ได้ และถ้าเซ็นด้วย key จริงทีหลัง ผู้ใช้ต้องถอนตัวเก่าก่อนติดตั้งตัวใหม่
- ไฟล์รวม 3 ABI ถ้าอยากได้เล็กลงใช้ `--split-per-abi` (เหลือ ~16-18 MB ต่อไฟล์ เครื่องส่วนใหญ่ใช้ `arm64-v8a`)

## emulator ค้างตั้งแต่ยังไม่บูต

ถ้า `qemu-system-x86_64.exe` รันอยู่แต่กินแรมนิ่งที่ ~150 MB และ `adb devices` ว่าง = ค้างเพราะ GPU ไม่ใช่เพราะ adb · เครื่องนี้แก้แล้วโดยตั้ง `hw.gpu.mode=swiftshader_indirect` ใน `~/.android/avd/Pixel_8.avd/config.ini` (เท่ากับเลือก Graphics = *Software - GLES 2.0* ในหน้า Edit AVD ของ Android Studio) เพราะการ์ด AMD ของเครื่องนี้รันโหมด Vulkan host ไม่ไหว · ดูรายละเอียดการวินิจฉัยใน [`CHANGELOG.md`](../CHANGELOG.md) วันที่ 17 ก.ย. 2026

`AndroidManifest.xml` ต้องมี `INTERNET` และ `android:usesCleartextTraffic="true"` — Android 9 ขึ้นไปบล็อก `http://` ธรรมดา

## เรื่องที่ต้องตัดสินใจก่อนเริ่ม

1. **ฟังก์ชันที่แอปต้องมี** — เฉพาะฝั่งผู้ใช้ทั่วไป (P1–P8: ค้นหา, ดูสินค้า, เปรียบเทียบ, สลับภาษา) หรือรวมฝั่งแอดมินด้วย
2. **เทคโนโลยี** — ✅ **Flutter (ภาษา Dart)** เลือกเมื่อ 15 ก.ย. 2026 · เขียน UI ใหม่ทั้งหมด (ไม่ใช้โค้ด Vue ของ `frontend/`) แต่เรียก Backend API เดิม
3. **แพลตฟอร์ม** — Android, iOS หรือทั้งคู่ (iOS ต้องใช้ Mac ในการ build)
4. **การแจกจ่าย** — ขึ้น Store หรือแจกไฟล์ติดตั้งภายในบริษัท

## ข้อตกลงที่ใช้ร่วมกับระบบเดิม

- เรียก **Backend API เดิม** (`backend/`) — ไม่ทำ API แยก และไม่ใช้ข้อมูล mock (ดู API Spec ใน `CLAUDE.md` หัวข้อ 5)
- ระหว่างพัฒนา แอปบนมือถือจริงต้องเรียก API ผ่าน IP ของเครื่องในวง Wi-Fi เดียวกัน ไม่ใช่ `localhost` (ดู `docs/setup.md` หัวข้อ "เปิดจากมือถือ")
- ข้อมูลเป็นสำเนาของจริง — ห้ามฝังข้อมูลสินค้า/บัญชีแอดมินลงในแอป
