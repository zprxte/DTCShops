import 'package:flutter/material.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';

// ตัวหมุนตอนกำลังโหลด
class LoadingView extends StatelessWidget {
  const LoadingView({super.key});

  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}

// โหลดไม่สำเร็จ: ข้อความ + ปุ่มลองใหม่ (ทุกหน้าใช้ตัวเดียวกัน)
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, this.title, this.onRetry});

  // ข้อผิดพลาดจริง (บรรทัดเล็กไว้แจ้งปัญหา)
  final Object? error;

  final String? title;

  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              title ?? langs('loadFailed', {'error': ''}).trim(),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, color: AppColors.navy900),
            ),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(
                '$error',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, color: AppColors.muted),
              ),
            ],
            if (onRetry != null) ...[
              const SizedBox(height: 12),
              FilledButton(onPressed: onRetry, child: Text(langs('retry'))),
            ],
          ],
        ),
      ),
    );
  }
}
