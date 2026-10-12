import '../language/app_language.dart';

String formatPrice(num price) {
  if (price == 0) return langs('priceOnRequest');
  final digits = price.toStringAsFixed(0);
  final withComma = digits.replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (m) => ',',
  );
  return '฿$withComma';
}

// สินค้าหมวด Software ขายแบบสมัครสมาชิก คิดราคาต่อเดือน ไม่ใช่ต่อชิ้น
// tbl_item ไม่มีคอลัมน์หน่วยราคา จึงดูจากรหัสหมวดแทน (กติกาเดียวกับเว็บ)
const subscriptionCategoryId = 'PT-00006';

// หน่วยต่อท้ายราคา เช่น "/ ชิ้น" หรือ "/ เดือน"
String priceUnitLabel(String? categoryId) => langs(
  categoryId == subscriptionCategoryId
      ? 'priceUnitSubscriptionLabel'
      : 'priceUnitLabel',
);
