import 'package:shared_preferences/shared_preferences.dart';

// ประวัติการค้นหา 10 คำล่าสุด เก็บในเครื่องเท่านั้น
class SearchHistory {
  SearchHistory._();
  static final SearchHistory instance = SearchHistory._();

  static const _key = 'search_history';
  static const maxItems = 10;

  List<String> _items = [];
  List<String> get items => List.unmodifiable(_items);

  // อ่านจากเครื่อง
  Future<List<String>> load() async {
    final prefs = await SharedPreferences.getInstance();
    _items = prefs.getStringList(_key) ?? [];
    return items;
  }

  // บันทึกคำค้น — คำซ้ำถูกดันขึ้นบนสุด
  Future<List<String>> add(String word) async {
    final q = word.trim();
    if (q.isEmpty) return items;

    _items = [q, ..._items.where((w) => w.toLowerCase() != q.toLowerCase())];
    if (_items.length > maxItems) _items = _items.sublist(0, maxItems);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, _items);
    return items;
  }

  // ลบคำเดียว
  Future<List<String>> remove(String word) async {
    _items = _items.where((w) => w != word).toList();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, _items);
    return items;
  }

  // ล้างทั้งหมด
  Future<void> clear() async {
    _items = [];
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
