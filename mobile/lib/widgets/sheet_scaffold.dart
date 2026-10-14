import 'package:flutter/material.dart';

import '../language/app_language.dart';

// โครงแผ่นตัวกรองที่เด้งจากข้างล่าง: รายการเลื่อนได้ + แถบปุ่ม "ล้าง | ดูผลลัพธ์" ติดล่าง
class SheetScaffold extends StatelessWidget {
  const SheetScaffold({
    super.key,
    required this.children,
    required this.clearLabel,
    required this.onClear,
    required this.onApply,
  });

  final List<Widget> children;

  // ข้อความปุ่มล้าง (สองแผ่นใช้คำต่างกัน)
  final String clearLabel;
  final VoidCallback onClear;

  // กด "ดูผลลัพธ์" — ผู้เรียก pop พร้อมค่าเอง
  final VoidCallback onApply;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, controller) => Column(
        children: [
          Expanded(
            child: ListView(
              controller: controller,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              children: children,
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: Row(
                children: [
                  TextButton(onPressed: onClear, child: Text(clearLabel)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      onPressed: onApply,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                      ),
                      child: Text(langs('showResults')),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
