import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';

// แถบเลขหน้าวงกลม (ตรรกะเดียวกับเว็บ): ≤ 7 หน้าแสดงครบ · มากกว่านั้นย่อด้วย … คงหน้าแรก/สุดท้าย/รอบหน้าปัจจุบัน
class PaginationBar extends StatelessWidget {
  const PaginationBar({
    super.key,
    required this.page,
    required this.totalPages,
    required this.onChanged,
  });

  final int page;
  final int totalPages;
  final ValueChanged<int> onChanged;

  // เลขที่จะแสดง (null = …)
  List<int?> get _pageNumbers {
    if (totalPages <= 7) {
      return List<int?>.generate(totalPages, (i) => i + 1);
    }

    final around = <int>{1, totalPages, page, page - 1, page + 1};
    // อยู่ต้น/ท้าย เติมเพื่อนบ้านฝั่งนั้น ไม่ให้ได้ "1 … 3"
    if (page <= 3) around.addAll([2, 3, 4]);
    if (page >= totalPages - 2) {
      around.addAll([totalPages - 3, totalPages - 2, totalPages - 1]);
    }

    final pages = around.where((n) => n >= 1 && n <= totalPages).toList()
      ..sort();
    final out = <int?>[];
    for (var i = 0; i < pages.length; i++) {
      if (i > 0 && pages[i] - pages[i - 1] > 1) out.add(null);
      out.add(pages[i]);
    }
    return out;
  }

  void _go(int target) {
    if (target < 1 || target > totalPages || target == page) return;
    onChanged(target);
  }

  @override
  Widget build(BuildContext context) {
    if (totalPages <= 1) return const SizedBox.shrink();

    return Semantics(
      label: langs('pageOf', {'page': page, 'total': totalPages}),
      // บังคับกว้างขั้นต่ำเท่าจอ ถึงจะจัดกลางในตัวเลื่อนได้
      child: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: ConstrainedBox(
            constraints: BoxConstraints(minWidth: constraints.maxWidth - 24),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _ArrowButton(
                  icon: LucideIcons.chevronLeft,
                  label: langs('prevPage'),
                  onPressed: page > 1 ? () => _go(page - 1) : null,
                ),
                ..._pageNumbers.map(
                  (n) => n == null
                      ? const SizedBox(
                          width: 36,
                          height: 36,
                          child: Center(
                            child: Text(
                              '…',
                              style: TextStyle(color: AppColors.muted),
                            ),
                          ),
                        )
                      : _PageButton(
                          number: n,
                          isCurrent: n == page,
                          onPressed: () => _go(n),
                        ),
                ),
                _ArrowButton(
                  icon: LucideIcons.chevronRight,
                  label: langs('nextPage'),
                  onPressed: page < totalPages ? () => _go(page + 1) : null,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PageButton extends StatelessWidget {
  const _PageButton({
    required this.number,
    required this.isCurrent,
    required this.onPressed,
  });

  final int number;
  final bool isCurrent;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 3),
      child: Material(
        color: isCurrent ? AppColors.brand600 : AppColors.white,
        shape: CircleBorder(
          side: BorderSide(
            color: isCurrent ? AppColors.brand600 : AppColors.border,
          ),
        ),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: SizedBox(
            width: 36,
            height: 36,
            child: Center(
              child: Text(
                '$number',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w500,
                  color: isCurrent ? AppColors.white : AppColors.navy900,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ArrowButton extends StatelessWidget {
  const _ArrowButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;

  // null = กดไม่ได้ (จางลง)
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 3),
      child: Semantics(
        button: true,
        label: label,
        child: Material(
          color: AppColors.white,
          shape: const CircleBorder(side: BorderSide(color: AppColors.border)),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onPressed,
            child: SizedBox(
              width: 36,
              height: 36,
              child: Icon(
                icon,
                size: 18,
                color: enabled ? AppColors.navy900 : AppColors.border,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
