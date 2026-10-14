import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';
import '../services/api_service.dart';
import '../stores/search_history.dart';
import 'product_detail_screen.dart';

// หน้าค้นหา: ช่องค้นหาแคปซูล + ประวัติ (ตอนช่องว่าง) / ประวัติที่ตรง + คำแนะนำสินค้า (ตอนพิมพ์)
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, this.initialQuery});

  // คำค้นเดิม (เปิดจากหน้าผลค้นหา) ใส่ในช่องให้แก้ต่อ
  final String? initialQuery;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final TextEditingController _controller = TextEditingController();
  final ApiService _api = ApiService();

  Timer? _debounce;
  List<SearchSuggestion> _suggestions = [];
  String? _error;
  List<String> _history = [];

  @override
  void initState() {
    super.initState();
    SearchHistory.instance
        .load()
        .then((items) {
          if (mounted) setState(() => _history = items);
        })
        .catchError((Object e) {
          // โหลดประวัติไม่ได้ก็ใช้ต่อได้ แค่ไม่มีประวัติ
          debugPrint('โหลดประวัติการค้นหาไม่ได้: $e');
        });
    final initial = widget.initialQuery;
    if (initial != null && initial.isNotEmpty) {
      _controller.text = initial;
      _controller.selection = TextSelection.collapsed(offset: initial.length);
      _onChanged(initial);
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  // พิมพ์แล้วหน่วง 300ms ค่อยดึงคำแนะนำ
  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final items = await _api.fetchAutocomplete(value);
        if (mounted) setState(() => _suggestions = items);
      } catch (e) {
        if (mounted) setState(() => _suggestions = []);
      }
    });
  }

  // ค้นทั้งคำ: ส่งคำกลับให้หน้าที่เปิดมา แล้วไปแสดงผลในแท็บสินค้า (ไม่เปิดหน้าซ้อน)
  void _search(String word) {
    final q = word.trim();
    if (q.isEmpty) return;
    _debounce?.cancel();
    FocusScope.of(context).unfocus();
    SearchHistory.instance
        .add(q)
        .then((items) {
          if (mounted) setState(() => _history = items);
        })
        .catchError((Object e) {
          debugPrint('บันทึกประวัติการค้นหาไม่ได้: $e');
        });
    Navigator.of(context).pop(q);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: Column(
          children: [
            _SearchHeader(
              controller: _controller,
              onChanged: _onChanged,
              onSubmitted: _search,
              onClear: () => setState(() {
                _controller.clear();
                _suggestions = [];
              }),
            ),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_error != null) {
      return _centered(
        icon: LucideIcons.wifiOff,
        title: langs('searchSuggestError'),
        detail: _error,
      );
    }

    final query = _controller.text.trim();

    // ช่องว่าง → ประวัติทั้งหมด
    if (query.isEmpty) {
      if (_history.isNotEmpty) return _historyList();
      return _centered(
        icon: LucideIcons.search,
        title: langs('searchPlaceholder'),
        detail: langs('searchExample'),
      );
    }

    // กำลังพิมพ์ → ประวัติที่ตรงก่อน แล้วคำแนะนำจาก API
    final matched = _matchingHistory(query);
    if (matched.isNotEmpty || _suggestions.isNotEmpty) {
      return _suggestionList(query, matched);
    }

    if (query.length >= 2) {
      return _centered(
        icon: LucideIcons.search,
        title: langs('searchPressEnter', {'query': query}),
        detail: langs('searchNoNameMatch'),
      );
    }

    return _centered(
      icon: LucideIcons.search,
      title: langs('searchPlaceholder'),
      detail: langs('searchExample'),
    );
  }

  // ประวัติที่มีคำค้น (ขึ้นต้นด้วยมาก่อน) สูงสุด 3 คำ
  List<String> _matchingHistory(String query) {
    final q = query.toLowerCase();
    final starts = <String>[];
    final contains = <String>[];
    for (final word in _history) {
      final w = word.toLowerCase();
      if (w.startsWith(q)) {
        starts.add(word);
      } else if (w.contains(q)) {
        contains.add(word);
      }
    }
    return [...starts, ...contains].take(3).toList();
  }

  // ลบคำออกจากประวัติ
  Future<void> _removeHistory(String word) async {
    final items = await SearchHistory.instance.remove(word);
    if (mounted) setState(() => _history = items);
  }

  // แถวประวัติ 1 คำ — กดแล้วค้นซ้ำ
  Widget _historyRow(String word, {String query = ''}) {
    return _SuggestionRow(
      icon: LucideIcons.history,
      name: word,
      query: query,
      maxLines: 1,
      onTap: () {
        _controller.text = word;
        _search(word);
      },
      trailing: IconButton(
        onPressed: () => _removeHistory(word),
        tooltip: langs('searchRemoveOne'),
        icon: const Icon(LucideIcons.x, size: 16, color: AppColors.muted),
      ),
    );
  }

  // ประวัติ 10 คำล่าสุด
  Widget _historyList() {
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 8, 6),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  langs('searchRecent'),
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ),
              TextButton(
                onPressed: () async {
                  await SearchHistory.instance.clear();
                  if (mounted) setState(() => _history = []);
                },
                child: Text(langs('searchClearAll')),
              ),
            ],
          ),
        ),
        ..._history.map((word) => _historyRow(word)),
      ],
    );
  }

  // ประวัติที่ตรง (นาฬิกา) + คำแนะนำสินค้า (แว่นขยาย) ในรายการเดียว
  Widget _suggestionList(String query, List<String> matched) {
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        ...matched.map((word) => _historyRow(word, query: query)),
        ..._suggestions.map(
          (s) => _SuggestionRow(
            icon: LucideIcons.search,
            name: s.productName,
            query: query,
            // กดคำแนะนำ = เข้าหน้าสินค้านั้นเลย
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ProductDetailScreen(productId: s.productId),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _centered({
    required IconData icon,
    required String title,
    String? detail,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 44, color: AppColors.muted),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: AppColors.navy900,
              ),
            ),
            if (detail != null) ...[
              const SizedBox(height: 6),
              Text(
                detail,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, color: AppColors.muted),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// แถบบน: ย้อนกลับ + ช่องค้นหาแคปซูล
class _SearchHeader extends StatelessWidget {
  const _SearchHeader({
    required this.controller,
    required this.onChanged,
    required this.onSubmitted,
    required this.onClear,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onSubmitted;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(4, 10, 12, 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            tooltip: langs('back'),
            icon: const Icon(LucideIcons.chevronLeft),
          ),
          Expanded(
            child: Container(
              height: 44,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                border: Border.all(color: AppColors.brand700, width: 2),
                borderRadius: BorderRadius.circular(22),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: controller,
                      autofocus: true,
                      textInputAction: TextInputAction.search,
                      onChanged: onChanged,
                      onSubmitted: onSubmitted,
                      style: const TextStyle(fontSize: 15),
                      decoration: InputDecoration(
                        hintText: langs('searchTitle'),
                        border: InputBorder.none,
                        isCollapsed: true,
                      ),
                    ),
                  ),
                  ValueListenableBuilder<TextEditingValue>(
                    valueListenable: controller,
                    builder: (context, value, _) => value.text.isEmpty
                        ? const SizedBox.shrink()
                        : IconButton(
                            onPressed: onClear,
                            tooltip: langs('searchClear'),
                            visualDensity: VisualDensity.compact,
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(
                              minWidth: 32,
                              minHeight: 32,
                            ),
                            icon: const Icon(
                              LucideIcons.x,
                              size: 18,
                              color: AppColors.muted,
                            ),
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

// แถวรายการสูง 52 (ส่วนที่ตรงคำค้นเป็นตัวหนา)
class _SuggestionRow extends StatelessWidget {
  const _SuggestionRow({
    required this.icon,
    required this.name,
    required this.query,
    required this.onTap,
    this.trailing,
    this.maxLines = 2,
  });

  final IconData icon;
  final String name;
  final String query;
  final VoidCallback onTap;

  final Widget? trailing;
  final int maxLines;

  // ทำตัวหนาเฉพาะช่วงที่ตรงคำค้น
  List<TextSpan> _spans() {
    final q = query.trim();
    if (q.isEmpty) return [TextSpan(text: name)];

    final index = name.toLowerCase().indexOf(q.toLowerCase());
    if (index < 0) return [TextSpan(text: name)];

    return [
      if (index > 0) TextSpan(text: name.substring(0, index)),
      TextSpan(
        text: name.substring(index, index + q.length),
        style: const TextStyle(fontWeight: FontWeight.w700),
      ),
      TextSpan(text: name.substring(index + q.length)),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 52),
        padding: EdgeInsets.only(left: 16, right: trailing == null ? 16 : 4),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: AppColors.surface)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: AppColors.muted),
            const SizedBox(width: 12),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text.rich(
                  TextSpan(children: _spans()),
                  maxLines: maxLines,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    height: 1.35,
                    color: AppColors.navy900,
                  ),
                ),
              ),
            ),
            ?trailing,
          ],
        ),
      ),
    );
  }
}
