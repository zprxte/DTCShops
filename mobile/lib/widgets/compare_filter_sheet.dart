import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';
import 'sheet_scaffold.dart';

const String compareSortNone = '';

// คีย์พิเศษของการเรียงตามราคา (ครอบขีดล่างไม่ให้ชนชื่อหัวข้อจริง)
const String compareSortPrice = '__price__';

// ค่าตัวกรองของตารางเปรียบเทียบ — ติ๊กคุณสมบัติ = จัดอันดับคอลัมน์ ไม่ใช่ซ่อนสินค้า
@immutable
class CompareFilter {
  const CompareFilter({
    this.features = const <String>{},
    this.sortField = compareSortNone,
    this.sortAscending = false,
    this.onlyDifferences = false,
    this.onlySelected = false,
  });

  final Set<String> features;

  // หัวข้อที่ใช้เรียง: ชื่อสเปค / compareSortPrice / compareSortNone
  final String sortField;
  final bool sortAscending;

  final bool onlyDifferences;

  // แสดงเฉพาะแถวที่ติ๊ก (มีเฉพาะแอป จอเล็กเลื่อนหาหัวข้อนาน)
  final bool onlySelected;

  bool get isActive =>
      features.isNotEmpty ||
      sortField != compareSortNone ||
      onlyDifferences ||
      onlySelected;

  // ตัวเลขบนปุ่มตัวกรอง (การเรียงมากับการติ๊กอยู่แล้ว ไม่นับซ้ำ)
  int get badgeCount =>
      features.length +
      (sortField == compareSortPrice ? 1 : 0) +
      (onlyDifferences ? 1 : 0) +
      (onlySelected ? 1 : 0);

  CompareFilter copyWith({
    Set<String>? features,
    String? sortField,
    bool? sortAscending,
    bool? onlyDifferences,
    bool? onlySelected,
  }) {
    return CompareFilter(
      features: features ?? this.features,
      sortField: sortField ?? this.sortField,
      sortAscending: sortAscending ?? this.sortAscending,
      onlyDifferences: onlyDifferences ?? this.onlyDifferences,
      onlySelected: onlySelected ?? this.onlySelected,
    );
  }
}

// เปิดแผ่นตัวกรองของหน้าเปรียบเทียบ — คืนค่าใหม่เมื่อกด "ดูผลลัพธ์" · ปัดปิด = null
Future<CompareFilter?> showCompareFilterSheet(
  BuildContext context, {
  required List<String> attributeNames,
  required Set<String> computableNames,
  required Set<String> sameNames,
  required CompareFilter current,
}) {
  return showModalBottomSheet<CompareFilter>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => _CompareFilterSheet(
      attributeNames: attributeNames,
      computableNames: computableNames,
      sameNames: sameNames,
      current: current,
    ),
  );
}

class _CompareFilterSheet extends StatefulWidget {
  const _CompareFilterSheet({
    required this.attributeNames,
    required this.computableNames,
    required this.sameNames,
    required this.current,
  });

  final List<String> attributeNames;

  // หัวข้อที่เป็นตัวเลขอย่างน้อย 2 คอลัมน์ (เรียงได้)
  final Set<String> computableNames;

  // หัวข้อที่ทุกคอลัมน์ค่าเท่ากัน
  final Set<String> sameNames;

  final CompareFilter current;

  @override
  State<_CompareFilterSheet> createState() => _CompareFilterSheetState();
}

class _CompareFilterSheetState extends State<_CompareFilterSheet> {
  late Set<String> _features = {...widget.current.features};
  late String _sortField = widget.current.sortField;
  late bool _sortAscending = widget.current.sortAscending;
  late bool _onlyDifferences = widget.current.onlyDifferences;
  late bool _onlySelected = widget.current.onlySelected;

  // ติ๊กคุณสมบัติที่เรียงได้ = ตั้งเป็นตัวเรียง (มาก→น้อย) แบบเว็บ
  void _toggleFeature(String name) {
    setState(() {
      if (_features.remove(name)) {
        if (_sortField == name) _sortField = compareSortNone;
        return;
      }
      _features.add(name);
      if (widget.computableNames.contains(name)) {
        _sortField = name;
        _sortAscending = false;
      }
    });
  }

  // เลือกทิศเรียงของหัวข้อ
  void _selectSort(String field, String? value) {
    setState(() {
      if (value == null || value.isEmpty) {
        if (_sortField == field) _sortField = compareSortNone;
        return;
      }
      _sortField = field;
      _sortAscending = value == 'asc';
      // หัวข้อที่เรียงต้องนับเป็นคุณสมบัติที่ติ๊กด้วย
      if (field != compareSortPrice) _features.add(field);
    });
  }

  String? _sortValueFor(String field) {
    if (_sortField != field) return '';
    return _sortAscending ? 'asc' : 'desc';
  }

  // ล้างตัวกรองทั้งหมด
  void _clearAll() {
    setState(() {
      _features = {};
      _sortField = compareSortNone;
      _sortAscending = false;
      _onlyDifferences = false;
      _onlySelected = false;
    });
  }

  // เปิด "เฉพาะที่ต่างกัน" แล้วซ่อนหัวข้อที่ค่าเท่ากันหมด (ยกเว้นที่ติ๊กอยู่)
  List<String> get _visibleNames => widget.attributeNames
      .where(
        (name) =>
            !_onlyDifferences ||
            !widget.sameNames.contains(name) ||
            _features.contains(name),
      )
      .toList();

  @override
  Widget build(BuildContext context) {
    final names = _visibleNames;

    return SheetScaffold(
      clearLabel: langs('compareFilterClear'),
      onClear: _clearAll,
      onApply: () => Navigator.pop(
        context,
        CompareFilter(
          features: _features,
          sortField: _sortField,
          sortAscending: _sortAscending,
          onlyDifferences: _onlyDifferences,
          // ไม่มีอะไรติ๊กไว้ = เปิดโหมดนี้ไม่ได้ (ตารางจะว่าง)
          onlySelected: _features.isEmpty ? false : _onlySelected,
        ),
      ),
      children: [
        Text(
          langs('compareFilterTitle'),
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.navy900,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          langs('compareFilterHint'),
          style: const TextStyle(
            fontSize: 12,
            height: 1.4,
            color: AppColors.muted,
          ),
        ),
        const SizedBox(height: 8),
        SwitchListTile(
          value: _onlyDifferences,
          onChanged: (value) => setState(() => _onlyDifferences = value),
          dense: true,
          contentPadding: EdgeInsets.zero,
          title: Text(
            langs('compareOnlyDiff'),
            style: const TextStyle(fontSize: 14),
          ),
        ),
        SwitchListTile(
          value: _onlySelected,
          onChanged: _features.isEmpty
              ? null
              : (value) => setState(() => _onlySelected = value),
          dense: true,
          contentPadding: EdgeInsets.zero,
          title: Text(
            langs('compareOnlySelected'),
            style: const TextStyle(fontSize: 14),
          ),
        ),
        _heading(langs('comparePriceHeading')),
        _SortRow(
          label: langs('compareSortByPrice'),
          value: _sortValueFor(compareSortPrice),
          onChanged: (value) => _selectSort(compareSortPrice, value),
        ),
        _heading(langs('compareFeatureHeading')),
        if (names.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              langs('compareNoFeatures'),
              style: const TextStyle(fontSize: 13, color: AppColors.muted),
            ),
          ),
        ...names.map(
          (name) => _FeatureRow(
            name: name,
            selected: _features.contains(name),
            onToggle: () => _toggleFeature(name),
            sortValue: widget.computableNames.contains(name)
                ? _sortValueFor(name)
                : null,
            onSortChanged: (value) => _selectSort(name, value),
          ),
        ),
      ],
    );
  }

  Widget _heading(String text) => Padding(
    padding: const EdgeInsets.only(top: 16, bottom: 4),
    child: Text(
      text,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w700,
        color: AppColors.navy900,
      ),
    ),
  );
}

// แถวคุณสมบัติ: ติ๊ก + dropdown เรียง (เฉพาะข้อที่เป็นตัวเลข)
class _FeatureRow extends StatelessWidget {
  const _FeatureRow({
    required this.name,
    required this.selected,
    required this.onToggle,
    required this.sortValue,
    required this.onSortChanged,
  });

  final String name;
  final bool selected;
  final VoidCallback onToggle;

  // null = เรียงไม่ได้ ไม่มี dropdown
  final String? sortValue;
  final ValueChanged<String?> onSortChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: InkWell(
            onTap: onToggle,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Checkbox(
                    value: selected,
                    onChanged: (_) => onToggle(),
                    visualDensity: VisualDensity.compact,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      name,
                      style: const TextStyle(
                        fontSize: 13.5,
                        color: AppColors.navy900,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (sortValue != null)
          _SortDropdown(value: sortValue!, onChanged: onSortChanged),
      ],
    );
  }
}

// แถวเรียงตามราคา (ไม่มี checkbox)
class _SortRow extends StatelessWidget {
  const _SortRow({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(fontSize: 13.5, color: AppColors.navy900),
          ),
        ),
        _SortDropdown(value: value ?? '', onChanged: onChanged),
      ],
    );
  }
}

// dropdown เลือกทิศเรียง
class _SortDropdown extends StatelessWidget {
  const _SortDropdown({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 34,
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: AppColors.circle,
        borderRadius: BorderRadius.circular(999),
      ),
      child: DropdownButton<String>(
        value: value,
        isDense: true,
        underline: const SizedBox.shrink(),
        borderRadius: BorderRadius.circular(12),
        icon: const Icon(LucideIcons.chevronDown, size: 16),
        style: const TextStyle(fontSize: 11.5, color: AppColors.navy900),
        items: [
          DropdownMenuItem(value: '', child: Text(langs('compareSortNone'))),
          DropdownMenuItem(value: 'asc', child: Text(langs('compareSortAsc'))),
          DropdownMenuItem(
            value: 'desc',
            child: Text(langs('compareSortDesc')),
          ),
        ],
        onChanged: onChanged,
      ),
    );
  }
}
