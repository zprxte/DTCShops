import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';
import '../language/translations.dart';

// ปุ่มสลับภาษา TH / EN / JP บน AppBar (จำค่าในเครื่อง)
class LanguageButton extends StatelessWidget {
  // ห้ามใส่ const ตอนเรียกใช้ — ข้อความเปลี่ยนตามภาษา
  const LanguageButton({super.key});

  @override
  Widget build(BuildContext context) {
    // ฟังการเปลี่ยนภาษาเอง ตัวอักษรบนปุ่มต้องเปลี่ยนทันที
    return ValueListenableBuilder<String>(
      valueListenable: LanguageStore.instance.code,
      builder: (context, current, _) => _button(current),
    );
  }

  // ปุ่มแคปซูล + เมนูเลือกภาษา
  Widget _button(String current) {
    return PopupMenuButton<String>(
      tooltip: langs('languageLabel'),
      onSelected: LanguageStore.instance.setLang,
      padding: EdgeInsets.zero,
      offset: const Offset(0, 44),
      color: AppColors.white,
      elevation: 3,
      constraints: const BoxConstraints(minWidth: 132, maxWidth: 190),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.border),
      ),
      itemBuilder: (context) => appLanguages
          .map(
            (lang) => PopupMenuItem<String>(
              value: lang.code,
              height: 38,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: _LanguageRow(
                badge: lang.badge,
                label: lang.label,
                selected: lang.code == current,
              ),
            ),
          )
          .toList(),
      child: Container(
        margin: const EdgeInsets.only(right: 12),
        padding: const EdgeInsets.fromLTRB(9, 5, 5, 5),
        decoration: BoxDecoration(
          color: AppColors.brand50,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(LucideIcons.globe, size: 16, color: AppColors.brand700),
            const SizedBox(width: 5),
            Text(
              languageBadge(current),
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.brand700,
              ),
            ),
            const Icon(
              LucideIcons.chevronDown,
              size: 16,
              color: AppColors.brand700,
            ),
          ],
        ),
      ),
    );
  }
}

// 1 บรรทัดในเมนู: ป้ายรหัสภาษา (ที่เลือกอยู่พื้นฟ้า) → ชื่อภาษา
class _LanguageRow extends StatelessWidget {
  const _LanguageRow({
    required this.badge,
    required this.label,
    required this.selected,
  });

  final String badge;
  final String label;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    // Noto Sans Thai ไม่มีอักษรญี่ปุ่น — บรรทัดนี้ระบุ Noto Sans JP เอง
    final labelStyle = TextStyle(
      fontSize: 13,
      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
      color: selected ? AppColors.brand700 : AppColors.navy900,
    );

    return Row(
      children: [
        Container(
          width: 26,
          height: 18,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? AppColors.brand600 : AppColors.circle,
            borderRadius: BorderRadius.circular(5),
          ),
          child: Text(
            badge,
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3,
              color: selected ? AppColors.white : AppColors.muted,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            label,
            style: labelStyle,
          ),
        ),
      ],
    );
  }
}
