import 'package:flutter/material.dart';

import 'screens/main_screen.dart';
import 'config/app_colors.dart';
import 'language/app_language.dart';
import 'stores/compare_store.dart';
import 'utils/compare_actions.dart';

void main() async {
  // อ่านภาษาที่เคยเลือกไว้ก่อนวาดหน้าแรก ไม่งั้นจะเห็นภาษาไทยแวบหนึ่งทุกครั้ง
  WidgetsFlutterBinding.ensureInitialized();
  // ตะกร้าเปรียบเทียบก็เช่นกัน ไม่งั้นป้ายจำนวนบนแท็บล่างจะขึ้น 0 แวบหนึ่ง
  await Future.wait([
    LanguageStore.instance.load(),
    CompareStore.instance.load(),
  ]);
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    // ครอบทั้งแอปไว้ เพื่อให้ทุกหน้าวาดใหม่ทันทีที่ผู้ใช้สลับภาษา
    // (langs() อ่านค่าจากตัวแปรกลาง ไม่ได้เป็น InheritedWidget ของ Flutter)
    return ValueListenableBuilder<String>(
      valueListenable: LanguageStore.instance.code,
      builder: (context, _, _) => _buildApp(),
    );
  }

  Widget _buildApp() {
    return MaterialApp(
      // แจ้งเตือนได้จากทุกที่ แม้ตัวที่สั่งจะปิดตัวเองไปแล้ว (ดู showAppMessage)
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
        // หัวขาว + เส้นใต้หัว แยกจากพื้นหน้าสีเทา — ถ้าสีเดียวกับพื้น หัวจะกลืน
        // ไปกับเนื้อหา ดูเหมือนกรอบหัวลากยาวลงมาทั้งจอ
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
          // ห้ามใช้ WidgetStateTextStyle ที่ช่องนี้ — RawChip เอาสไตล์ของ theme
          // ไป merge กับของ widget ก่อนใช้ ซึ่งอ่านค่าทีละช่อง (color/fontWeight)
          // แต่ WidgetStateTextStyle ไม่มีค่าจริงในช่องพวกนั้น เลยได้ null หมด
          // ตัวอักษรจึงกลายเป็นสีที่กลืนกับพื้น (เคยทำชิปดูว่างเปล่ามาแล้ว)
          // ที่รองรับจริงคือใส่ตัวแปรตามสถานะไว้ใน color เพราะ RawChip เรียก
          // resolveAs() กับ labelStyle.color โดยเฉพาะ
          labelStyle: TextStyle(
            fontWeight: FontWeight.w500,
            color: WidgetStateColor.resolveWith(
              (states) => states.contains(WidgetState.selected)
                  ? AppColors.brand700
                  : AppColors.navy900,
            ),
          ),
          // เงาจะเห็นก็ต่อเมื่อ elevation > 0 เท่านั้น อยากได้เงาตอนเลือก
          // ให้เปลี่ยน elevation เป็น 2
          elevation: 0,
          selectedShadowColor: AppColors.brand700,
          pressElevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8), // 999 = แคปซูล
          ),
        ),
      ),
      // ห้ามใส่ const ตรงนี้ — const ทำให้ Flutter ได้ widget ตัวเดิมเป๊ะ
      // (identical) ทุกครั้งที่วาดใหม่ แล้วข้ามการ build ทั้งกิ่งไปเลย
      // สลับภาษาแล้วหน้าจอจะไม่เปลี่ยนจนกว่าจะเปลี่ยนหน้า
      // ignore: prefer_const_constructors
      home: MainScreen(),
    );
  }
}
