import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/product.dart';

// 1 ช่องในตารางเปรียบเทียบ = (สินค้า, โมเดล) · modelId เป็น null เฉพาะสินค้าที่ไม่มีโมเดล
@immutable
class CompareItem {
  final String productId;
  final String productName;
  final String? productImage;
  final num productPrice; // ราคาของโมเดลที่เลือก
  final String? modelId;
  final String? modelName;

  const CompareItem({
    required this.productId,
    required this.productName,
    required this.productImage,
    required this.productPrice,
    this.modelId,
    this.modelName,
  });

  // รหัสประจำช่อง (สินค้าเดียวกันคนละโมเดลได้คนละค่า)
  String get key => modelId == null ? productId : '$productId::$modelId';

  Map<String, dynamic> toJson() => {
    'product_id': productId,
    'product_name': productName,
    'product_image': productImage,
    'product_price': productPrice,
    'model_id': modelId,
    'model_name': modelName,
  };

  factory CompareItem.fromJson(Map<String, dynamic> json) => CompareItem(
    productId: json['product_id'] as String,
    productName: json['product_name'] as String? ?? '',
    productImage: json['product_image'] as String?,
    productPrice: json['product_price'] as num? ?? 0,
    modelId: json['model_id'] as String?,
    modelName: json['model_name'] as String?,
  );

  factory CompareItem.fromProduct(Product product) => CompareItem(
    productId: product.productId,
    productName: product.productName,
    productImage: product.productImage,
    productPrice: product.productPrice,
  );
}

// ตะกร้าเปรียบเทียบของทั้งแอป (singleton + ValueNotifier) บันทึกลง shared_preferences ทุกครั้งที่เปลี่ยน
class CompareStore {
  CompareStore._() {
    // ฟังที่ notifier จุดเดียว ทุกเมธอดที่แก้รายการจึงบันทึกเอง
    items.addListener(_persist);
  }
  static final CompareStore instance = CompareStore._();

  static const String _storageKey = 'compare_items';

  // เพดานของแอป: เทียบได้ทีละ 2 ช่อง (เว็บ 4)
  static const int maxItems = 2;

  final ValueNotifier<List<CompareItem>> items =
      ValueNotifier<List<CompareItem>>([]);

  // โหลดรายการที่เคยเลือก — ข้อมูลเสียเริ่มจากตะกร้าว่าง
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_storageKey);
      if (raw == null) return;
      final list = (jsonDecode(raw) as List)
          .map((e) => CompareItem.fromJson(e as Map<String, dynamic>))
          .toList();
      // ตัดท้ายให้ไม่เกินเพดานปัจจุบัน
      items.value = list.take(maxItems).toList();
    } catch (e) {
      debugPrint('โหลดตะกร้าเปรียบเทียบไม่ได้: $e');
    }
  }

  // บันทึกรายการลงเครื่อง
  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _storageKey,
        jsonEncode(items.value.map((item) => item.toJson()).toList()),
      );
    } catch (e) {
      debugPrint('บันทึกตะกร้าเปรียบเทียบไม่ได้: $e');
    }
  }

  // สินค้านี้อยู่ในตารางอย่างน้อยหนึ่งโมเดลไหม
  bool contains(String productId) =>
      items.value.any((item) => item.productId == productId);

  // สินค้า + โมเดลนี้อยู่ในตารางไหม
  bool containsKey(String key) => items.value.any((item) => item.key == key);

  bool containsExact(String productId, String? modelId) => items.value.any(
    (item) => item.productId == productId && item.modelId == modelId,
  );

  bool get isFull => items.value.length >= maxItems;

  // เพิ่มหนึ่งช่อง — เต็มแล้วคืน false · มีอยู่แล้วถือว่าสำเร็จ
  bool add(CompareItem item) {
    if (containsExact(item.productId, item.modelId)) return true;
    if (isFull) return false;
    // ต้องสร้าง list ใหม่ ไม่งั้น ValueNotifier มองว่าค่าเดิมแล้วไม่แจ้งเปลี่ยน
    items.value = [...items.value, item];
    return true;
  }

  // เพิ่มถ้ายังไม่มี / เอาออกถ้ามี
  bool toggle(CompareItem item) {
    if (containsExact(item.productId, item.modelId)) {
      removeExact(item.productId, item.modelId);
      return true;
    }
    return add(item);
  }

  // เอาออกทุกโมเดลของสินค้านี้
  void remove(String productId) {
    items.value = items.value
        .where((item) => item.productId != productId)
        .toList();
  }

  // เอาออกเฉพาะช่องที่ตรงทั้งสินค้าและโมเดล
  void removeExact(String productId, String? modelId) {
    items.value = items.value
        .where(
          (item) => !(item.productId == productId && item.modelId == modelId),
        )
        .toList();
  }

  // แทนที่ช่องเดิมในตำแหน่งเดิม — ถ้าของใหม่ตรงกับช่องอื่น = สลับกัน · หาช่องไม่เจอคืน false
  bool replace(String key, CompareItem item) {
    final list = [...items.value];
    final index = list.indexWhere((old) => old.key == key);
    if (index < 0) return false;

    final other = list.indexWhere(
      (old) => old.key == item.key && old.key != key,
    );
    if (other >= 0) list[other] = list[index];

    list[index] = item;
    items.value = list;
    return true;
  }

  // เอาออกด้วยรหัสช่อง (ปุ่ม ✕ บนหัวคอลัมน์)
  void removeKey(String key) {
    items.value = items.value.where((item) => item.key != key).toList();
  }

  void clear() => items.value = [];
}
