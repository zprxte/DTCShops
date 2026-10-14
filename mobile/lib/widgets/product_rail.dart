import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';
import '../utils/snap_scroll_physics.dart';
import '../models/product.dart';
import 'product_card.dart';

// รางสินค้าเลื่อนแนวนอน + ปุ่มลูกศรซ้ายขวา หยุดตรงขอบการ์ดและวนรอบได้
class ProductRail extends StatefulWidget {
  const ProductRail({
    super.key,
    required this.products,
    this.height = 300,
    this.visibleCards = 2,
    this.gutter = 28, // ระยะขอบจอถึงการ์ด (ที่ของปุ่มลูกศร)
    this.gap = 12,
  });

  final List<Product> products;
  final double height;
  final double visibleCards;
  final double gutter;
  final double gap;

  @override
  State<ProductRail> createState() => _ProductRailState();
}

class _ProductRailState extends State<ProductRail> {
  static const double _arrowSize = 32;

  final ScrollController _controller = ScrollController();

  int _index = 0; // การ์ดใบซ้ายสุดตอนนี้
  int _animating = 0; // การเลื่อนที่สั่งไปแล้วยังไม่จบ
  double? _lastExtent; // ขนาดการ์ด + ช่องว่างของเฟรมก่อน

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  // เลื่อนไปตำแหน่งแล้วยึดเลขใบจากตำแหน่งจริง
  Future<void> _animateTo(double offset, double itemExtent) async {
    _animating++;
    try {
      await _controller.animateTo(
        offset,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
      );
    } finally {
      _animating--;
      // ยึดตำแหน่งจริงเสมอ — เป้าหมายอาจถูก clamp ที่ขอบราง
      if (mounted && _controller.hasClients) {
        _index = (_controller.position.pixels / itemExtent).round();
      }
    }
  }

  // ใบซ้ายสุดที่ไปได้ไกลสุด = จำนวนสินค้า − จำนวนที่เห็น (ห้ามใช้ maxScrollExtent — ListView lazy ได้ค่าประมาณ)
  int get _lastIndex {
    final steps = widget.products.length - widget.visibleCards;
    return steps <= 0 ? 0 : steps.floor();
  }

  // เลื่อน 1 ใบ (สุดขอบแล้ววนอีกด้าน)
  void _step(int direction, double itemExtent) {
    if (!_controller.hasClients) return;
    final max = _controller.position.maxScrollExtent;
    final lastIndex = _lastIndex;

    var next = _index + direction;
    if (next > lastIndex) {
      // วนกลับใบแรก: วางห่างใบแรก 1 ใบแบบไม่มีภาพก่อน แล้วค่อยเลื่อนเข้า
      _controller.jumpTo(itemExtent.clamp(0.0, max));
      next = 0;
    } else if (next < 0) {
      _controller.jumpTo(((lastIndex - 1) * itemExtent).clamp(0.0, max));
      next = lastIndex;
    }

    _index = next;
    _animateTo((next * itemExtent).clamp(0.0, max), itemExtent);
  }

  // ปุ่มกลมขาววางคร่อมขอบการ์ด
  Widget _arrow(IconData icon, String label, VoidCallback onPressed) {
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: AppColors.white,
        shape: const CircleBorder(),
        elevation: 3,
        shadowColor: const Color(0x33081C30),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: SizedBox(
            width: _arrowSize,
            height: _arrowSize,
            child: Center(
              child: Icon(icon, size: 20, color: AppColors.navy900),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: widget.height,
      // วัดความกว้างที่ได้รับจริง ไม่ใช่ขนาดจอ
      child: LayoutBuilder(
        builder: (context, constraints) {
          final cardWidth =
              (constraints.maxWidth -
                  widget.gutter * 2 -
                  widget.gap * (widget.visibleCards - 1)) /
              widget.visibleCards;
          final itemExtent = cardWidth + widget.gap;

          // ขนาดการ์ดเปลี่ยน (หมุนจอ) จัดตำแหน่งกลับให้ตรงใบเดิม
          if (_lastExtent != itemExtent) {
            _lastExtent = itemExtent;
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted || !_controller.hasClients) return;
              final max = _controller.position.maxScrollExtent;
              _controller.jumpTo((_index * itemExtent).clamp(0.0, max));
            });
          }

          return Stack(
            children: [
              // ปัดเองแล้วอัปเดตเลขใบ (ไม่แก้ระหว่างที่ปุ่มกำลังเลื่อน)
              NotificationListener<ScrollEndNotification>(
                onNotification: (n) {
                  if (_animating == 0) {
                    _index = (n.metrics.pixels / itemExtent).round();
                  }
                  return false;
                },
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: widget.gutter),
                  child: ListView.separated(
                    controller: _controller,
                    scrollDirection: Axis.horizontal,
                    physics: SnapScrollPhysics(itemExtent: itemExtent),
                    padding: EdgeInsets.zero,
                    itemCount: widget.products.length,
                    separatorBuilder: (context, index) =>
                        SizedBox(width: widget.gap),
                    itemBuilder: (context, index) => SizedBox(
                      width: cardWidth,
                      child: ProductCard(product: widget.products[index]),
                    ),
                  ),
                ),
              ),

              if (widget.products.length > 1) ...[
                Positioned(
                  left: widget.gutter - _arrowSize / 2,
                  top: 0,
                  bottom: 0,
                  child: Center(
                    child: _arrow(
                      LucideIcons.chevronLeft,
                      langs('scrollLeft'),
                      () => _step(-1, itemExtent),
                    ),
                  ),
                ),
                Positioned(
                  right: widget.gutter - _arrowSize / 2,
                  top: 0,
                  bottom: 0,
                  child: Center(
                    child: _arrow(
                      LucideIcons.chevronRight,
                      langs('scrollRight'),
                      () => _step(1, itemExtent),
                    ),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
