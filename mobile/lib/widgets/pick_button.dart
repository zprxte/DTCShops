import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import 'pill_style.dart';

// ปุ่มท้ายแถวในรายการเลือก: "เลือก" (โปร่ง) / "✓ เลือกแล้ว" (ทึบ)
class PickButton extends StatelessWidget {
  const PickButton({
    super.key,
    required this.picked,
    required this.label,
    required this.onTap,
  });

  final bool picked;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // บีบพื้นที่แตะส่วนเกินออก (อยู่ใน trailing ของ ListTile)
    final style = pillButtonStyle(
      foreground: picked ? AppColors.white : AppColors.navy900,
      background: picked ? AppColors.brand600 : AppColors.white,
      borderColor: picked ? AppColors.brand600 : AppColors.border,
      shrinkTapTarget: true,
    );

    return TextButton.icon(
      onPressed: onTap,
      style: style,
      icon: Icon(picked ? LucideIcons.check : LucideIcons.plus, size: 16),
      label: Text(
        label,
        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
      ),
    );
  }
}
