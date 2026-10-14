import 'package:flutter/material.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';
import '../models/compare_product.dart';
import '../stores/compare_store.dart';
import '../utils/format.dart';
import '../utils/compare_actions.dart';
import 'pick_button.dart';

// ป็อปอัปเลือกโมเดลเข้าตารางเปรียบเทียบ — เพิ่มแล้วค้างไว้พร้อมปุ่ม "เลือกแล้ว" กดยกเลิกได้ · เต็มแล้วปิดเอง · replaceKey = โหมดเปลี่ยนสินค้า
Future<bool?> showCompareModelDialog(
  BuildContext context, {
  required CompareProduct product,
  String? replaceKey,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: ValueListenableBuilder<List<CompareItem>>(
        valueListenable: CompareStore.instance.items,
        builder: (context, items, _) => Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
              child: Text(
                langs('compareModelTitle'),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.navy900,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(
                product.productName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, color: AppColors.muted),
              ),
            ),
            const Divider(height: 1),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: product.models.map((model) {
                  final picked = items.any(
                    (item) =>
                        item.productId == product.productId &&
                        item.modelId == model.modelId,
                  );

                  // ปุ่ม "เลือกแล้ว" กดยกเลิกได้ทุกโหมด (โหมดเปลี่ยนสินค้าจึงสลับกับช่องอื่นจากตรงนี้ไม่ได้)
                  final canCancel = picked;

                  // เพิ่ม/แทนที่ด้วยโมเดลนี้
                  void addModel() {
                    final store = CompareStore.instance;
                    final ok = addCompareItem(
                      CompareItem(
                        productId: product.productId,
                        productName: product.productName,
                        productImage: product.productImage,
                        productPrice: model.productPrice,
                        modelId: model.modelId,
                        modelName: model.modelName,
                      ),
                      replaceKey: replaceKey,
                      modelName: model.modelName,
                    );
                    // เปลี่ยนสินค้า = ปิดเลย · เพิ่มแล้วยังเหลือช่อง = เปิดค้างไว้
                    if (replaceKey != null || !ok || store.isFull) {
                      Navigator.pop(sheetContext, ok);
                    }
                  }

                  // ยกเลิกโมเดลที่เพิ่มแล้ว (ป็อปอัปไม่ปิด ให้เลือกโมเดลอื่นต่อ)
                  void cancelModel() {
                    final store = CompareStore.instance;
                    removeCompareModel(product.productId, model.modelId);
                    // ยกเลิกช่องที่กำลังจะเปลี่ยนเอง = ไม่มีช่องให้แทนที่แล้ว
                    final target = replaceKey;
                    if (target != null && !store.containsKey(target)) {
                      Navigator.pop(sheetContext, false);
                    }
                  }

                  return ListTile(
                    title: Text(model.modelName),
                    subtitle: Text(formatPrice(model.productPrice)),
                    trailing: PickButton(
                      picked: picked,
                      label: picked
                          ? langs('pickedAlready')
                          : langs('pickerPick'),
                      onTap: canCancel ? cancelModel : addModel,
                    ),
                    // เพิ่มแล้วต้องกดที่ปุ่มเท่านั้นถึงยกเลิก กันแตะพลาด
                    onTap: canCancel ? null : addModel,
                  );
                }).toList(),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
