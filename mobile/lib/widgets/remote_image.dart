import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/api_config.dart';
import '../config/app_colors.dart';

// รูปจากเซิร์ฟเวอร์ พร้อมไอคอนแทนตอนไม่มีรูป/โหลดไม่ขึ้น
class RemoteImage extends StatelessWidget {
  const RemoteImage({
    super.key,
    required this.path,
    this.fit = BoxFit.contain,
    this.iconSize,
    this.width,
    this.placeholderIcon = LucideIcons.image,
    this.errorIcon = LucideIcons.imageOff,
    this.keepSpaceWhileLoading = false,
  });

  // path จาก DB (null = ไม่มีรูป)
  final String? path;
  final BoxFit fit;
  final double? iconSize;
  final double? width;

  // ไอคอน "ไม่มีรูป" กับ "โหลดไม่ขึ้น" แยกกัน ให้รู้ว่าลืมใส่รูปหรือไฟล์หาย
  final IconData placeholderIcon;
  final IconData errorIcon;

  // จองที่ระหว่างโหลด กันกริดกระตุก
  final bool keepSpaceWhileLoading;

  Widget _icon(IconData icon) => Center(
    child: Icon(icon, size: iconSize, color: AppColors.muted),
  );

  @override
  Widget build(BuildContext context) {
    if (path == null) return _icon(placeholderIcon);
    return Image.network(
      ApiConfig.imageUrl(path),
      fit: fit,
      width: width,
      loadingBuilder: keepSpaceWhileLoading
          ? (context, child, progress) =>
                progress == null ? child : const SizedBox.shrink()
          : null,
      errorBuilder: (context, error, stack) => _icon(errorIcon),
    );
  }
}
