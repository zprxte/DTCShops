import 'dart:math';

import '../models/product.dart';

// กรองสินค้าด้วยชื่อในเครื่องแบบทนพิมพ์ผิด (ใช้ในป็อปอัปเลือกสินค้า) — ไม่มีชั้นตัดคำไทย/คำพ้องแบบตัวค้นหาหลัก
const double _fuzzyThreshold = 0.3;

class _Scored {
  const _Scored(this.product, this.score, this.index);
  final Product product;
  final double score;
  final int index;
}

List<Product> filterProductsByName(List<Product> products, String query) {
  // หลายคำ = ต้องเจอทุกคำที่ไหนก็ได้ในชื่อ
  final terms = query
      .toLowerCase()
      .trim()
      .split(RegExp(r'\s+'))
      .where((term) => term.isNotEmpty)
      .toList();
  if (terms.isEmpty) return products;

  final scored = <_Scored>[];
  for (var i = 0; i < products.length; i++) {
    final name = products[i].productName.toLowerCase();
    var total = 0.0;
    var matchedAll = true;
    for (final term in terms) {
      final score = _termScore(name, term);
      if (score == null) {
        matchedAll = false;
        break;
      }
      total += score;
    }
    if (matchedAll) scored.add(_Scored(products[i], total / terms.length, i));
  }

  // คะแนนน้อย = ตรงกว่า · เท่ากันคงลำดับเดิม (sort ของ Dart ไม่ stable)
  scored.sort((a, b) {
    final byScore = a.score.compareTo(b.score);
    return byScore != 0 ? byScore : a.index.compareTo(b.index);
  });
  return scored.map((item) => item.product).toList();
}

// 0 = ตรงเป๊ะ · ยิ่งมากยิ่งเพี้ยน · null = ไม่ตรง
double? _termScore(String name, String term) {
  if (name.contains(term)) return 0;
  final score = _bestSubstringDistance(name, term) / term.length;
  return score <= _fuzzyThreshold ? score : null;
}

// ระยะ Levenshtein น้อยสุดระหว่างคำค้นกับท่อนใดก็ได้ของชื่อ (แถวแรกเป็น 0 = เริ่มที่ไหนก็ได้)
int _bestSubstringDistance(String name, String term) {
  var prev = List<int>.filled(name.length + 1, 0);
  final cur = List<int>.filled(name.length + 1, 0);
  for (var i = 1; i <= term.length; i++) {
    cur[0] = i;
    for (var j = 1; j <= name.length; j++) {
      final cost = term[i - 1] == name[j - 1] ? 0 : 1;
      cur[j] = min(min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
    }
    prev = List<int>.from(cur);
  }
  return prev.reduce(min);
}
