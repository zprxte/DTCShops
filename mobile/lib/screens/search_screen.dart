import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';
import '../services/api_service.dart';
import '../stores/search_history.dart';
import 'product_detail_screen.dart';

/// หน้าค้นหา — หน้าตาตาม wireframe "Wireframe แอป DTC Compare" จอ Search:
/// แถบบนเป็นปุ่มย้อนกลับ + ช่องค้นหาทรงแคปซูลขอบฟ้า
/// ด้านล่างเป็นรายการคำแนะนำ (สูงสุด 8) ปิดท้ายด้วยแถว "ดูผลการค้นหาทั้งหมด"
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, this.initialQuery});

  /// คำค้นเดิม (เปิดจากหน้าผลการค้นหา) — ใส่ในช่องให้เลย ผู้ใช้แก้ต่อได้
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
          // ยังไม่ได้ build ใหม่หลังลง shared_preferences → ใช้แอปต่อได้
          // แค่ไม่มีประวัติ และเห็นสาเหตุจริงใน console
          debugPrint('โหลดประวัติการค้นหาไม่ได้: $e');
        });
    final initial = widget.initialQuery;
    if (initial != null && initial.isNotEmpty) {
      _controller.text = initial;
      // วางเคอร์เซอร์ท้ายคำ จะได้พิมพ์ต่อได้เลย
      _controller.selection = TextSelection.collapsed(offset: initial.length);
      _onChanged(initial); // ดึงคำแนะนำของคำเดิมไว้ให้ด้วย
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  // พิมพ์แล้วรอ 300ms ค่อยยิง — ไม่งั้นพิมพ์ 10 ตัวอักษร = เรียก API 10 ครั้ง
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

  /// ไม่ได้กดคำแนะนำ (กด Enter หรือแถว "ดูผลการค้นหาทั้งหมด")
  /// → ส่งคำค้นกลับให้หน้าที่เปิดเรามา แล้วปิดตัวเอง
  /// ผลการค้นหาไปแสดงในแท็บสินค้า (เหมือนเว็บที่ค้นแล้วไป /products?searchword=)
  /// ไม่ใช่เปิดหน้าใหม่ทับ ไม่งั้นค้น 3 ครั้งจะมีหน้าซ้อนกัน 3 ชั้นและแถบแท็บหาย
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
    if (_suggestions.isNotEmpty) return _suggestionList(query);

    // ประวัติต้องมาก่อนข้อความชวนกด Enter ไม่งั้นพอมีคำค้างในช่อง
    // (เช่นเปิดจากหน้าผลการค้นหา) จะไม่เห็นประวัติเลย
    if (_history.isNotEmpty) return _historyList(hintFor: query);

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

  /// ค้นหาล่าสุด — เก็บในเครื่อง 10 คำล่าสุด กดคำเดิมแล้วค้นซ้ำได้ทันที
  Widget _historyList({String hintFor = ''}) {
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        // พิมพ์ไว้แล้วแต่ยังไม่มีคำแนะนำ — บอกทางออกไว้เหนือประวัติ
        if (hintFor.length >= 2)
          InkWell(
            onTap: () => _search(hintFor),
            child: Container(
              constraints: const BoxConstraints(minHeight: 52),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      langs('searchFor', {'query': hintFor}),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.brand700,
                      ),
                    ),
                  ),
                  const Icon(
                    LucideIcons.chevronRight,
                    size: 20,
                    color: AppColors.brand700,
                  ),
                ],
              ),
            ),
          ),
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
        ..._history.map(
          (word) => InkWell(
            onTap: () {
              _controller.text = word;
              _search(word);
            },
            child: Container(
              constraints: const BoxConstraints(minHeight: 52),
              padding: const EdgeInsets.only(left: 16, right: 4),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: AppColors.surface)),
              ),
              child: Row(
                children: [
                  const Icon(
                    LucideIcons.history,
                    size: 18,
                    color: AppColors.muted,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      word,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppColors.navy900,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () async {
                      final items = await SearchHistory.instance.remove(word);
                      if (mounted) setState(() => _history = items);
                    },
                    tooltip: langs('searchRemoveOne'),
                    icon: const Icon(
                      LucideIcons.x,
                      size: 16,
                      color: AppColors.muted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// รายการคำแนะนำระหว่างพิมพ์ + แถวปิดท้ายไปยังผลการค้นหาทั้งหมด
  Widget _suggestionList(String query) {
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
          child: Text(
            langs('searchSuggestions'),
            style: const TextStyle(fontSize: 12, color: AppColors.muted),
          ),
        ),
        ..._suggestions.map(
          (s) => _SuggestionRow(
            name: s.productName,
            query: query,
            // กดคำแนะนำ = เข้าหน้าสินค้านั้นเลย ไม่ต้องค้นซ้ำ
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ProductDetailScreen(productId: s.productId),
              ),
            ),
          ),
        ),
        InkWell(
          onTap: () => _search(query),
          child: SizedBox(
            height: 52,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      langs('searchSeeAllOf', {'query': query}),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.brand700,
                      ),
                    ),
                  ),
                  const Icon(
                    LucideIcons.chevronRight,
                    size: 20,
                    color: AppColors.brand700,
                  ),
                ],
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

/// แถบบน: ปุ่มย้อนกลับ + ช่องค้นหาทรงแคปซูลขอบฟ้า (ตาม wireframe)
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
                  // ปุ่มล้างคำค้น โผล่เฉพาะตอนมีข้อความ
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

/// แถวคำแนะนำสูง 52 — ไอคอนแว่นขยาย, ชื่อสินค้า (ส่วนที่ตรงกับคำค้นเป็นตัวหนา), ›
class _SuggestionRow extends StatelessWidget {
  const _SuggestionRow({
    required this.name,
    required this.query,
    required this.onTap,
  });

  final String name;
  final String query;
  final VoidCallback onTap;

  /// ทำตัวหนาเฉพาะช่วงที่ตรงกับคำค้น (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
  /// ช่วยให้ผู้ใช้เห็นว่าทำไมรายการนี้ถึงขึ้นมา
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
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: AppColors.surface)),
        ),
        child: Row(
          children: [
            const Icon(LucideIcons.search, size: 18, color: AppColors.muted),
            const SizedBox(width: 12),
            Expanded(
              child: Text.rich(
                TextSpan(children: _spans()),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 14,
                  height: 1.35,
                  color: AppColors.navy900,
                ),
              ),
            ),
            const Icon(
              LucideIcons.chevronRight,
              size: 20,
              color: AppColors.muted,
            ),
          ],
        ),
      ),
    );
  }
}
