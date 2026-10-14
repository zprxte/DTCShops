import '../language/app_language.dart';

// ราคา → "฿x,xxx" (0 = ติดต่อสอบถาม)
String formatPrice(num price) {
  if (price == 0) return langs('priceOnRequest');
  final digits = price.toStringAsFixed(0);
  final withComma = digits.replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (m) => ',',
  );
  return '฿$withComma';
}

// หมวด Software ขายรายเดือน (ดูจากรหัสหมวด กติกาเดียวกับเว็บ)
const subscriptionCategoryId = 'PT-00006';

// หน่วยต่อท้ายราคา "/ ชิ้น" หรือ "/ เดือน"
String priceUnitLabel(String? categoryId) => langs(
  categoryId == subscriptionCategoryId
      ? 'priceUnitSubscriptionLabel'
      : 'priceUnitLabel',
);
