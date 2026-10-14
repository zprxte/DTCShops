import 'package:flutter/material.dart';

// ตัดชื่อสินค้าเป็นช่วง ให้ช่วงที่ตรงคำค้น (ทุกคำ ไม่สนตัวพิมพ์) เป็นตัวหนาพื้นฟ้า
List<TextSpan> highlightSegments(
  String text,
  String query, {
  required TextStyle highlightStyle,
}) {
  final words = query
      .toLowerCase()
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .toList();
  if (words.isEmpty) return [TextSpan(text: text)];

  final lower = text.toLowerCase();
  // ทำเครื่องหมายทีละตัวอักษร รองรับคำค้นที่ซ้อนทับกัน
  final marks = List<bool>.filled(text.length, false);
  for (final word in words) {
    var from = 0;
    while (true) {
      final index = lower.indexOf(word, from);
      if (index < 0) break;
      for (var i = index; i < index + word.length; i++) {
        marks[i] = true;
      }
      from = index + word.length;
    }
  }

  final spans = <TextSpan>[];
  var start = 0;
  for (var i = 1; i <= text.length; i++) {
    final end = i == text.length || marks[i] != marks[start];
    if (!end) continue;
    spans.add(
      TextSpan(
        text: text.substring(start, i),
        style: marks[start] ? highlightStyle : null,
      ),
    );
    start = i;
  }
  return spans;
}
