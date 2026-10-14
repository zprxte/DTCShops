import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';
import '../models/product.dart';
import '../screens/product_detail_screen.dart';
import '../stores/compare_store.dart';
import 'compare_model_dialog.dart';
import 'remote_image.dart';
import '../utils/highlight.dart';
import '../utils/format.dart';
import '../utils/compare_actions.dart';

// การ์ดสินค้า: รูป ชื่อ (ไฮไลต์คำค้น) ราคา + ปุ่มเปรียบเทียบ 2 สถานะ
class ProductCard extends StatefulWidget {
  const ProductCard({super.key, required this.product, this.onTap, this.query});

  final Product product;
  final VoidCallback? onTap;

  // คำค้นปัจจุบัน (ไฮไลต์ในชื่อ)
  final String? query;

  @override
  State<ProductCard> createState() => _ProductCardState();
}

class _ProductCardState extends State<ProductCard> {
  // กำลังโหลดโมเดลอยู่ กันกดรัว
  bool _loadingModels = false;

  // ปุ่มเปรียบเทียบ: ไม่มี/1 โมเดล = เพิ่ม/เอาออกเลย · หลายโมเดล = เปิดป็อปอัปเลือก
  Future<void> _toggleCompare(bool inCompare) async {
    final product = widget.product;

    if (!product.hasModels) {
      if (inCompare) {
        removeCompareProduct(product.productId);
      } else {
        addCompareItem(CompareItem.fromProduct(product));
      }
      return;
    }

    if (_loadingModels) return;
    setState(() => _loadingModels = true);
    try {
      final resolved = await resolveCompareItem(product);
      if (!mounted || resolved.failed) return;

      if (resolved.product != null) {
        await showCompareModelDialog(context, product: resolved.product!);
        return;
      }
      if (inCompare) {
        removeCompareProduct(product.productId);
      } else {
        addCompareItem(resolved.item!);
      }
    } finally {
      if (mounted) setState(() => _loadingModels = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final nameHeight = MediaQuery.textScalerOf(context).scale(13.5) * 1.35 * 2;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14081C30),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: AppColors.white,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.border),
        ),
        child: InkWell(
          // ไม่ส่ง onTap = เข้าหน้ารายละเอียดเป็นค่าเริ่มต้น
          onTap:
              widget.onTap ??
              () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      ProductDetailScreen(productId: widget.product.productId),
                ),
              ),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // รูปพื้นขาว (รูปสินค้าส่วนใหญ่มีพื้นขาวในไฟล์)
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      color: AppColors.white,
                      padding: const EdgeInsets.all(10),
                      child: RemoteImage(
                        path: widget.product.productImage,
                        iconSize: 28,
                        keepSpaceWhileLoading: true,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: nameHeight,
                  child: Text.rich(
                    TextSpan(
                      children: highlightSegments(
                        widget.product.productName,
                        widget.query ?? '',
                        highlightStyle: const TextStyle(
                          backgroundColor: AppColors.brand50,
                          color: AppColors.brand700,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13.5,
                      height: 1.35,
                      fontWeight: FontWeight.w600,
                      color: AppColors.navy900,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  formatPrice(widget.product.productPrice),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brand700,
                  ),
                ),
                const SizedBox(height: 8),
                ValueListenableBuilder<List<CompareItem>>(
                  valueListenable: CompareStore.instance.items,
                  builder: (context, items, _) {
                    final inCompare = items.any(
                      (item) => item.productId == widget.product.productId,
                    );
                    return TextButton.icon(
                      onPressed: _loadingModels
                          ? null
                          : () => _toggleCompare(inCompare),
                      icon: Icon(
                        inCompare ? LucideIcons.check : LucideIcons.gitCompare,
                        size: 16,
                      ),
                      label: Text(
                        inCompare ? langs('inCompare') : langs('compare'),
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      style: TextButton.styleFrom(
                        foregroundColor: inCompare
                            ? AppColors.white
                            : AppColors.brand700,
                        backgroundColor: inCompare
                            ? AppColors.brand700
                            : AppColors.brand50,
                        minimumSize: const Size.fromHeight(36),
                        padding: EdgeInsets.zero,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        animationDuration: const Duration(milliseconds: 150),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
