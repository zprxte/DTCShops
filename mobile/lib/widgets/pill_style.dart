import 'package:flutter/material.dart';

// สไตล์ปุ่มเม็ดยา (มุมโค้งเต็ม สูง 34) ใช้ทั่วแอป — คุมแค่รูปทรง สีให้แต่ละปุ่มเลือกเอง
ButtonStyle pillButtonStyle({
  required Color foreground,
  Color? background,
  Color? borderColor,
  double height = 34,
  EdgeInsetsGeometry padding = const EdgeInsets.symmetric(horizontal: 12),

  // ช่องแคบ: ไม่กินพื้นที่แตะส่วนเกิน
  bool shrinkTapTarget = false,

  // กว้างเต็มพื้นที่ (ปุ่มในแถวที่แบ่งครึ่ง)
  bool fillWidth = false,
}) {
  return TextButton.styleFrom(
    foregroundColor: foreground,
    backgroundColor: background,
    side: borderColor == null ? null : BorderSide(color: borderColor),
    padding: padding,
    minimumSize: fillWidth ? Size.fromHeight(height) : Size(0, height),
    tapTargetSize: shrinkTapTarget ? MaterialTapTargetSize.shrinkWrap : null,
    shape: const StadiumBorder(),
  );
}
