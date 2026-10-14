import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';
import '../models/product.dart';
import '../services/api_service.dart';
import '../stores/compare_store.dart';
import '../utils/format.dart';
import '../utils/compare_actions.dart';
import '../utils/product_filter.dart';
import 'compare_model_dialog.dart';
import 'async_state.dart';
import 'pick_button.dart';
import 'remote_image.dart';

// ป็อปอัปเลือกสินค้าเข้าตารางเปรียบเทียบ (เพิ่มได้ทีละชิ้นไม่ปิดแผ่น) · replaceKey = โหมดเปลี่ยนสินค้า
Future<void> showProductPickerSheet(
  BuildContext context, {
  VoidCallback? onBrowseAll,
  String? replaceKey,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true, // ไม่ใส่แผ่นสูงได้แค่ครึ่งจอ
    showDragHandle: true,
    builder: (context) =>
        _ProductPickerSheet(onBrowseAll: onBrowseAll, replaceKey: replaceKey),
  );
}

class _ProductPickerSheet extends StatefulWidget {
  const _ProductPickerSheet({this.onBrowseAll, this.replaceKey});

  final VoidCallback? onBrowseAll;

  // ช่องที่กำลังจะถูกแทนที่ (null = เพิ่มช่องใหม่)
  final String? replaceKey;

  @override
  State<_ProductPickerSheet> createState() => _ProductPickerSheetState();
}

class _ProductPickerSheetState extends State<_ProductPickerSheet> {
  final TextEditingController _controller = TextEditingController();
  final ApiService _api = ApiService();

  // แคตตาล็อกทั้งชุด โหลดครั้งเดียวแล้วกรองในเครื่องทุกตัวอักษร (/search เข้มเกินสำหรับการเลือกจากรายการ)
  List<Product> _all = [];
  String _query = '';
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  // โหลดแคตตาล็อก (เรียงตามยอดนิยม)
  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // limit 100 = เพดานของ /products
      final result = await _api.fetchProducts(limit: 100, sort: 'popular');
      if (!mounted) return;
      setState(() {
        _all = result.products;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  // กรองในเครื่อง ไม่ต้องหน่วง
  void _onChanged(String value) => setState(() => _query = value);

  // ตารางเต็มแล้วปิดแผ่นเอง (เรียกหลังป็อปอัปโมเดลปิดแล้วเท่านั้น ไม่งั้นปิดผิดตัว)
  void _closeIfFull() {
    if (mounted && CompareStore.instance.isFull) Navigator.pop(context);
  }

  // รหัสช่องในตะกร้าตอนนี้ ไว้เทียบว่าป็อปอัปโมเดลเปลี่ยนอะไรจริงไหม
  List<String> get _cartKeys =>
      CompareStore.instance.items.value.map((item) => item.key).toList();

  bool get _isReplacing => widget.replaceKey != null;

  // เพิ่มสินค้า — หลายโมเดลต้องเลือกในป็อปอัปก่อน
  Future<void> _add(Product product) async {
    final before = _cartKeys;
    final resolved = await resolveCompareItem(product);
    if (!mounted || resolved.failed) return;

    if (resolved.product != null) {
      final done = await showCompareModelDialog(
        context,
        product: resolved.product!,
        replaceKey: widget.replaceKey,
      );
      if (!mounted) return;
      if (_isReplacing && done == true) {
        Navigator.pop(context);
      } else if (_isReplacing &&
          !CompareStore.instance.containsKey(widget.replaceKey!)) {
        // ผู้ใช้ยกเลิกช่องที่กำลังจะเปลี่ยน — ไม่มีช่องให้แทนที่แล้ว
        Navigator.pop(context);
      } else if (!listEquals(before, _cartKeys)) {
        // ปิดตามเฉพาะเมื่อเลือกจริงแล้วตารางเต็ม (ปัดป็อปอัปทิ้งต้องได้แผ่นนี้คืน)
        _closeIfFull();
      }
      return;
    }

    final ok = addCompareItem(resolved.item!, replaceKey: widget.replaceKey);
    if (_isReplacing && ok) {
      Navigator.pop(context);
    } else {
      _closeIfFull();
    }
  }

  // ยกเลิกสินค้าที่เพิ่มแล้ว (เฉพาะไม่มี/1 โมเดล — หลายโมเดลยกเลิกในป็อปอัปโมเดล)
  void _cancel(Product product) {
    removeCompareProduct(product.productId);
    if (_isReplacing &&
        !CompareStore.instance.containsKey(widget.replaceKey!)) {
      Navigator.pop(context);
    }
  }

  // ต้องผ่านป็อปอัปเลือกโมเดลไหม (ข้อมูลไม่ครบให้ถือว่าต้อง)
  bool _needsModelPick(Product product) =>
      product.hasModels &&
      (product.modelIds.isEmpty || product.modelIds.length > 1);

  @override
  Widget build(BuildContext context) {
    // สูง 85% ของจอ และดันขึ้นเหนือแป้นพิมพ์
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.85,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                langs(_isReplacing ? 'swapProductTitle' : 'pickerTitle'),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.navy900,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: TextField(
                controller: _controller,
                onChanged: _onChanged,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: langs('pickerSearchHint'),
                  prefixIcon: const Icon(LucideIcons.search, size: 20),
                  isDense: true,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(22),
                  ),
                ),
              ),
            ),
            const Divider(height: 1),
            Expanded(child: _buildList()),
            if (widget.onBrowseAll != null)
              SafeArea(
                top: false,
                child: TextButton(
                  onPressed: () {
                    Navigator.pop(context);
                    widget.onBrowseAll!();
                  },
                  child: Text(langs('seeAllProducts')),
                ),
              ),
          ],
        ),
      ),
    );
  }

  // รายการสินค้าที่กรองแล้ว พร้อมปุ่มเลือก
  Widget _buildList() {
    if (_loading) return const LoadingView();
    if (_error != null) {
      return ErrorView(error: _error, onRetry: _load);
    }
    final results = filterProductsByName(_all, _query);
    if (results.isEmpty) {
      return Center(
        child: Text(
          langs('noProducts'),
          style: const TextStyle(color: AppColors.muted),
        ),
      );
    }

    // ฟังตะกร้า ปุ่มเปลี่ยนทันทีที่เพิ่ม
    return ValueListenableBuilder<List<CompareItem>>(
      valueListenable: CompareStore.instance.items,
      builder: (context, items, _) {
        // ที่เพิ่มแล้วค้างในรายการพร้อมปุ่ม "✓ เลือกแล้ว" กดยกเลิกได้
        final visible = results;
        return ListView.separated(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: visible.length,
          separatorBuilder: (context, index) =>
              const Divider(height: 1, indent: 76),
          itemBuilder: (context, index) {
            final product = visible[index];
            // หลายโมเดลที่เพิ่มไปบางส่วน ต้องมีเครื่องหมายบอก
            final pickedCount = items
                .where((item) => item.productId == product.productId)
                .length;
            final picked = pickedCount > 0;

            // เพิ่มแล้วต้องกดที่ปุ่มเท่านั้นถึงยกเลิก กันแตะพลาด
            final lockRowTap = picked;
            return ListTile(
              onTap: lockRowTap ? null : () => _add(product),
              leading: SizedBox(
                width: 48,
                height: 48,
                child: RemoteImage(path: product.productImage),
              ),
              title: Text(
                product.productName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14),
              ),
              subtitle: Row(
                children: [
                  Text(
                    formatPrice(product.productPrice),
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.brand700,
                    ),
                  ),
                  // บอกจำนวนโมเดลที่เลือก เฉพาะสินค้าหลายโมเดล
                  if (pickedCount > 0 && product.modelIds.length > 1) ...[
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        langs('pickedModels', {
                          'picked': pickedCount,
                          'total': product.modelIds.length,
                        }),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.brand600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              trailing: PickButton(
                picked: picked,
                label: picked ? langs('pickedAlready') : langs('pickerPick'),
                // เพิ่มแล้วแต่ยังมีโมเดลอื่น = เปิดรายการโมเดลให้จัดการทีละตัว
                onTap: !lockRowTap
                    ? () => _add(product)
                    : _needsModelPick(product)
                    ? () => _add(product)
                    : () => _cancel(product),
              ),
            );
          },
        );
      },
    );
  }
}
