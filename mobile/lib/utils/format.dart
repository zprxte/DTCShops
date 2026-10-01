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
