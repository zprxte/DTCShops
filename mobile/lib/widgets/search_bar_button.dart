import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';
import '../screens/search_screen.dart';

// ช่องค้นหาแคปซูล (ไม่ใช่ช่องกรอกจริง) กดแล้วเปิดหน้าค้นหา
class SearchBarButton extends StatelessWidget {
  const SearchBarButton({super.key, this.query, this.onSearch});

  // คำที่ค้นอยู่ — แสดงแทนข้อความชวนพิมพ์ และเปิดหน้าค้นหาพร้อมคำเดิม
  final String? query;

  // ค้นเสร็จแล้วส่งคำขึ้นไปให้หน้าแม่ตัดสินใจ
  final void Function(String query)? onSearch;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: langs('searchTitle'),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: () async {
          final result = await Navigator.of(context).push<String>(
            MaterialPageRoute(
              builder: (_) => SearchScreen(initialQuery: query),
            ),
          );
          // null = กดย้อนกลับ ไม่ได้ค้น
          if (result != null && result.trim().isNotEmpty) {
            onSearch?.call(result.trim());
          }
        },
        child: Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: AppColors.surface,
            border: Border.all(color: AppColors.button),
            borderRadius: BorderRadius.circular(22),
          ),
          child: Row(
            children: [
              const Icon(LucideIcons.search, size: 18, color: AppColors.muted),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  query ?? langs('searchHint'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 14,
                    color: query == null ? AppColors.muted : AppColors.navy900,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
