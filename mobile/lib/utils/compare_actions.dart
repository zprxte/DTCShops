// การเพิ่ม/เอาออกจากตารางเปรียบเทียบที่ใช้ร่วมกันทุกหน้า + แจ้งผลผู้ใช้
import 'package:flutter/material.dart';

import '../language/app_language.dart';
import '../models/compare_product.dart';
import '../models/product.dart';
import '../services/api_service.dart';
import '../stores/compare_store.dart';

// ScaffoldMessenger ระดับแอป — แจ้งเตือนได้แม้ป็อปอัปที่สั่งปิดตัวเองไปแล้ว
final GlobalKey<ScaffoldMessengerState> appMessengerKey =
    GlobalKey<ScaffoldMessengerState>();

// แถบข้อความสั้นท้ายจอ (ข้อความใหม่แทนอันเดิม ไม่ต่อคิว)
void showAppMessage(String message) {
  final messenger = appMessengerKey.currentState;
  if (messenger == null) return;
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(duration: const Duration(seconds: 2), content: Text(message)),
    );
}

// เพิ่มช่อง (หรือแทนที่เมื่อมี replaceKey) แล้วแจ้งผลเอง — คืน true เมื่อตะกร้าเปลี่ยนจริง
bool addCompareItem(CompareItem item, {String? replaceKey, String? modelName}) {
  final store = CompareStore.instance;
  final ok = replaceKey == null
      ? store.add(item)
      : store.replace(replaceKey, item);
  showAppMessage(
    ok
        ? (modelName == null
              ? langs('compareAdded')
              : langs('compareAddedModel', {'model': modelName}))
        : replaceKey != null
        ? langs('swapDuplicate')
        : langs('compareFull', {'max': CompareStore.maxItems}),
  );
  return ok;
}

// เอาสินค้านี้ออกทุกโมเดล
void removeCompareProduct(String productId) {
  CompareStore.instance.remove(productId);
  showAppMessage(langs('compareRemoved'));
}

// เอาออกเฉพาะโมเดลเดียว
void removeCompareModel(String productId, String? modelId) {
  CompareStore.instance.removeExact(productId, modelId);
  showAppMessage(langs('compareRemoved'));
}

// สินค้าจากการ์ด → ช่องที่พร้อมเข้าตาราง (หลายโมเดล = ต้องเลือกก่อน · โหลดไม่ได้ = แจ้งแล้ว)
Future<CompareResolution> resolveCompareItem(Product product) async {
  if (!product.hasModels) {
    return CompareResolution.item(CompareItem.fromProduct(product));
  }
  try {
    final detail = (await ApiService().fetchCompare([product.productId]))
        .firstOrNull;
    final models = detail?.models ?? const <CompareModel>[];
    if (detail != null && models.length > 1) {
      return CompareResolution.needsModel(detail);
    }
    final only = models.firstOrNull;
    return CompareResolution.item(
      CompareItem(
        productId: product.productId,
        productName: product.productName,
        productImage: product.productImage,
        productPrice: only?.productPrice ?? product.productPrice,
        modelId: only?.modelId,
        modelName: only?.modelName,
      ),
    );
  } catch (_) {
    showAppMessage(langs('compareModelError'));
    return const CompareResolution.failed();
  }
}

// ผลของ resolveCompareItem: ได้ช่อง / ต้องเลือกโมเดล / โหลดไม่สำเร็จ
class CompareResolution {
  const CompareResolution.item(CompareItem this.item)
    : product = null,
      failed = false;
  const CompareResolution.needsModel(CompareProduct this.product)
    : item = null,
      failed = false;
  const CompareResolution.failed() : item = null, product = null, failed = true;

  final CompareItem? item;
  final CompareProduct? product;
  final bool failed;
}
