import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'translations.dart';

// ภาษาที่เลือกของทั้งแอป (singleton) — แปลเฉพาะข้อความ UI ไม่แปลข้อมูลสินค้า
class LanguageStore {
  LanguageStore._();
  static final LanguageStore instance = LanguageStore._();

  static const String _storageKey = 'app_lang';

  // เริ่มที่ไทย แล้วแทนด้วยค่าที่เคยเลือกเมื่อโหลดเสร็จ
  final ValueNotifier<String> code = ValueNotifier<String>('th');

  // อ่านภาษาที่เคยเลือกจาก shared_preferences
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_storageKey);
      if (saved != null && dict.containsKey(saved)) code.value = saved;
    } catch (e) {
      // อ่านไม่ได้ใช้ภาษาไทยไปก่อน
      debugPrint('โหลดภาษาที่เลือกไว้ไม่ได้: $e');
    }
  }

  // เปลี่ยนภาษาแล้วจำไว้
  Future<void> setLang(String next) async {
    if (!dict.containsKey(next)) {
      // รหัสภาษาต้องตรงกับคีย์ของ dict ไม่งั้นกดแล้วเงียบ — ให้ฟ้องใน console
      debugPrint('ไม่รู้จักรหัสภาษา "$next" — ต้องตรงกับคีย์ใน dict');
      assert(false, 'ไม่รู้จักรหัสภาษา "$next"');
      return;
    }
    code.value = next;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_storageKey, next);
    } catch (e) {
      debugPrint('บันทึกภาษาที่เลือกไม่ได้: $e');
    }
  }
}

// ข้อความตามภาษาที่เลือก · [vars] แทน {ชื่อ} · คีย์ที่ไม่มีตกไปภาษาไทย แล้วเป็นตัวคีย์เอง
String langs(String key, [Map<String, Object>? vars]) {
  final lang = LanguageStore.instance.code.value;
  var text = dict[lang]?[key] ?? dict['th']?[key] ?? key;
  if (vars != null) {
    vars.forEach((name, value) {
      text = text.replaceAll('{$name}', '$value');
    });
  }
  return text;
}
