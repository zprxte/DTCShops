import 'package:flutter/material.dart';

import 'screens/main_screen.dart';
import 'config/app_colors.dart';
import 'language/app_language.dart';
import 'stores/compare_store.dart';
import 'utils/compare_actions.dart';

// เปิดแอป: โหลดภาษาและตะกร้าเปรียบเทียบก่อนวาดหน้าแรก
void main() async {
  // โหลดก่อนวาด ไม่งั้นเห็นภาษาไทย / ป้ายจำนวน 0 แวบหนึ่ง
  WidgetsFlutterBinding.ensureInitialized();
  await Future.wait([
    LanguageStore.instance.load(),
    CompareStore.instance.load(),
  ]);
  runApp(const MyApp());
}

// รากของแอป: ธีมกลาง + วาดใหม่ทั้งแอปเมื่อสลับภาษา
class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    // langs() อ่านตัวแปรกลาง จึงต้องฟังการเปลี่ยนภาษาที่ราก
    return ValueListenableBuilder<String>(
      valueListenable: LanguageStore.instance.code,
      builder: (context, _, _) => _buildApp(),
    );
  }

  Widget _buildApp() {
    return MaterialApp(
      // แจ้งเตือนได้จากทุกที่ (showAppMessage)
      scaffoldMessengerKey: appMessengerKey,
      scrollBehavior: MaterialScrollBehavior().copyWith(overscroll: false),
      title: 'DTC Compare',
      theme: ThemeData(
        scaffoldBackgroundColor: AppColors.surface,
        fontFamily: 'NotoSansThai', // ฝังในแอป ดู fonts: ใน pubspec.yaml
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.brand500,
          primary: AppColors.brand600,
        ),
        // หัวขาว + เส้นใต้ แยกจากพื้นหน้าสีเทา
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.white,
          surfaceTintColor: Colors.transparent,
          scrolledUnderElevation: 0,
          shape: Border(bottom: BorderSide(color: AppColors.border)),
        ),
        chipTheme: ChipThemeData(
          backgroundColor: AppColors.white, // ชิปที่ยังไม่เลือก
          selectedColor: AppColors.brand50, // ชิปที่เลือกแล้ว (พื้น)
          showCheckmark: false,
          side: WidgetStateBorderSide.resolveWith(
            (states) => states.contains(WidgetState.selected)
                ? const BorderSide(color: AppColors.brand700, width: 1.5)
                : const BorderSide(color: AppColors.border),
          ),
          // ห้ามใช้ WidgetStateTextStyle — RawChip merge ทีละช่องแล้วได้ null (ตัวอักษรกลืนพื้น) ใส่สีตามสถานะใน color แทน
          labelStyle: TextStyle(
            fontWeight: FontWeight.w500,
            color: WidgetStateColor.resolveWith(
              (states) => states.contains(WidgetState.selected)
                  ? AppColors.brand700
                  : AppColors.navy900,
            ),
          ),
          elevation: 0,
          selectedShadowColor: AppColors.brand700,
          pressElevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8), // 999 = แคปซูล
          ),
        ),
      ),
      // ห้าม const — widget ตัวเดิมเป๊ะจะถูกข้าม build สลับภาษาแล้วหน้าไม่เปลี่ยน
      // ignore: prefer_const_constructors
      home: MainScreen(),
    );
  }
}
