import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../language/app_language.dart';

// เปิดลิงก์ร้านค้า/โทรออก ในแอปภายนอก (Shopee/LINE ฯลฯ ถ้ามี) — เปิดไม่ได้แจ้งผู้ใช้
Future<void> openExternalLink(
  BuildContext context,
  String url, {
  String? label,
}) async {
  final messenger = ScaffoldMessenger.of(context);
  final uri = Uri.tryParse(url.trim());

  // ลิงก์ใน DB บางแถวไม่มี https://
  if (uri == null ||
      !uri.hasScheme ||
      uri.host.isEmpty && !uri.isScheme('tel')) {
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text(langs('linkInvalid', {'url': url}))),
      );
    return;
  }

  final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!opened) {
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(langs('linkFailed', {'label': label ?? langs('link')})),
        ),
      );
  }
}
