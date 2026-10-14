import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';
import '../models/compare_product.dart';
import '../services/api_service.dart';
import '../stores/compare_store.dart';
import '../utils/snap_scroll_physics.dart';
import '../utils/format.dart';
import '../utils/compare_actions.dart';
import '../widgets/compare_filter_sheet.dart';
import '../widgets/product_picker_sheet.dart';
import '../widgets/async_state.dart';
import '../widgets/pill_style.dart';
import '../widgets/remote_image.dart';

// แท็บเปรียบเทียบ: ตารางเทียบสเปค 2 ช่อง (สินค้า + โมเดล) + ตัวกรอง/เรียง + หัวค้าง
class CompareScreen extends StatefulWidget {
  const CompareScreen({super.key, this.onBrowse});

  // กดช่องว่างตอนตะกร้าว่างแล้วไปแท็บสินค้า
  final VoidCallback? onBrowse;

  @override
  State<CompareScreen> createState() => _CompareScreenState();
}

class _CompareScreenState extends State<CompareScreen> {
  final CompareStore _store = CompareStore.instance;

  Future<List<CompareProduct>>? _future;
  String _loadedIds = ''; // ชุดรหัสที่โหลดแล้ว กันยิง API ซ้ำ

  // ตัวกรองของตาราง (ติ๊กคุณสมบัติ + เรียง + สวิตช์ซ่อนแถว)
  CompareFilter _filter = const CompareFilter();

  @override
  void initState() {
    super.initState();
    _store.items.addListener(_reload);
    _reload();
  }

  @override
  void dispose() {
    _store.items.removeListener(_reload);
    super.dispose();
  }

  // โหลดข้อมูลสินค้าในตะกร้า (ชุดเดิมไม่โหลดซ้ำ)
  void _reload() {
    // สินค้าเดียวกันหลายโมเดลโหลดครั้งเดียว
    final ids = <String>{for (final item in _store.items.value) item.productId}
        .toList();
    final key = ids.join(',');
    if (key == _loadedIds) return;
    setState(() {
      _loadedIds = key;
      _future = ids.isEmpty ? null : ApiService().fetchCompare(ids);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        shape: const Border(),
        title: Text(langs('compareTitle')),
        actions: [
          ValueListenableBuilder<List<CompareItem>>(
            valueListenable: _store.items,
            builder: (context, items, _) => items.isEmpty
                ? const SizedBox.shrink()
                : TextButton(
                    onPressed: _store.clear,
                    child: Text(langs('clearAll')),
                  ),
          ),
        ],
      ),
      body: ValueListenableBuilder<List<CompareItem>>(
        valueListenable: _store.items,
        builder: (context, items, _) {
          if (items.isEmpty) return _EmptyState(onBrowse: widget.onBrowse);

          return FutureBuilder<List<CompareProduct>>(
            future: _future,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const LoadingView();
              }
              if (snapshot.hasError) {
                return ErrorView(
                  title: langs('compareLoadError'),
                  error: snapshot.error,
                  onRetry: () {
                    _loadedIds = '';
                    _reload();
                  },
                );
              }

              final products = snapshot.data ?? const <CompareProduct>[];
              if (products.isEmpty) {
                return _EmptyState(onBrowse: widget.onBrowse);
              }

              // 1 คอลัมน์ = 1 ช่องในตะกร้า (สเปคจากสินค้า ทับด้วยค่าเฉพาะโมเดล)
              final columns = <_CompareColumn>[];
              for (final item in items) {
                final product = products
                    .where((p) => p.productId == item.productId)
                    .firstOrNull;
                if (product == null) continue; // สินค้าถูกปิดการขายแล้ว
                columns.add(_CompareColumn(item: item, product: product));
              }
              if (columns.isEmpty) {
                return _EmptyState(onBrowse: widget.onBrowse);
              }

              return _CompareTable(
                columns: columns,
                filter: _filter,
                onFilterChanged: (value) => setState(() => _filter = value),
                onRemove: _store.removeKey,
                onBrowse: widget.onBrowse,
              );
            },
          );
        },
      ),
    );
  }
}

// 1 คอลัมน์ = ช่องในตะกร้า + ข้อมูลสินค้าที่โหลดมา
class _CompareColumn {
  _CompareColumn({required this.item, required this.product});

  final CompareItem item;
  final CompareProduct product;

  String get key => item.key;
  String get name => item.productName;
  String? get modelName => item.modelName;
  String? get modelId => item.modelId;
  String? get image => product.productImage ?? item.productImage;
  num get price => item.productPrice;

  // สเปคของช่อง = ค่าร่วม ทับด้วยค่าเฉพาะโมเดล
  late final Map<String, String> attributes = product.attributesFor(
    item.modelId,
  );
}

// ค่าที่ถือว่า "ไม่มีคุณสมบัตินี้"
const Set<String> _negativeFeatureValues = {
  '',
  '-',
  'ไม่มี',
  'ไม่',
  'no',
  'false',
  '0',
  'x',
  '✗',
};

// คอลัมน์นี้มีคุณสมบัตินี้ไหม
bool _hasFeature(_CompareColumn column, String name) {
  final raw = column.attributes[name];
  if (raw == null) return false;
  return !_negativeFeatureValues.contains(raw.trim().toLowerCase());
}

// เลขตัวแรกของข้อความ (กติกาเดียวกับเว็บ): "2K" = 2000 แต่ไม่โดนรหัสรุ่นอย่าง "2K5"
double? _parseNumber(String raw) {
  final k = RegExp(r'(\d+(?:\.\d+)?)\s*[kK](?!\w)').firstMatch(raw);
  if (k != null) {
    final value = double.tryParse(k.group(1)!);
    if (value != null) return value * 1000;
  }
  final match = RegExp(r'-?\d+(?:\.\d+)?').firstMatch(raw);
  return match == null ? null : double.tryParse(match.group(0)!);
}

// ตัวเลขของค่าหลายรายการ: ตัดเป็นท่อนแล้วเอาเลขตัวแรกของแต่ละท่อน ("กล้องหน้า 2K, กล้องหลัง 1080P" → [2000, 1080])
List<double> _parseAllNumbers(String? raw) {
  if (raw == null) return const [];
  final numbers = <double>[];
  for (final segment in raw.split(RegExp(r',|/|และ|\n'))) {
    final parsed = _parseNumber(segment);
    if (parsed != null) numbers.add(parsed);
  }
  return numbers;
}

// ตาราง: นับความตรง เรียงคอลัมน์ ป้ายแนะนำ กรองแถว
class _CompareTable extends StatelessWidget {
  const _CompareTable({
    required this.columns,
    required this.filter,
    required this.onFilterChanged,
    required this.onRemove,
    this.onBrowse,
  });

  final List<_CompareColumn> columns;
  final CompareFilter filter;
  final ValueChanged<CompareFilter> onFilterChanged;
  final ValueChanged<String> onRemove;
  final VoidCallback? onBrowse;

  // ยังไม่เต็ม = ต่อช่องว่าง 1 ช่องท้ายตาราง
  bool get _hasAddSlot => columns.length < CompareStore.maxItems;
  int get _slotCount => columns.length + (_hasAddSlot ? 1 : 0);

  // หัวข้อสเปคของทุกคอลัมน์ คงลำดับที่เจอครั้งแรก
  List<String> get _attributeNames {
    final names = <String>[];
    for (final column in columns) {
      for (final name in column.attributes.keys) {
        if (!names.contains(name)) names.add(name);
      }
    }
    return names;
  }

  // ทุกคอลัมน์ค่าเท่ากันไหม
  bool _isSame(String attribute) {
    final values = columns
        .map((c) => c.attributes[attribute] ?? 'ไม่มี')
        .toSet();
    return values.length == 1;
  }

  // หัวข้อที่เรียงได้ = เป็นตัวเลขอย่างน้อย 2 คอลัมน์
  Set<String> _computableNames(List<String> names) {
    return names.where((name) {
      final numeric = columns
          .where(
            (column) => _parseAllNumbers(column.attributes[name]).isNotEmpty,
          )
          .length;
      return numeric >= 2;
    }).toSet();
  }

  // เทียบคอลัมน์ตามหัวข้อที่เรียง: ไม่มีค่าไปท้าย · เลขมากสุดตัดสิน · เท่ากันดูจำนวนค่า
  int _compareBySortField(
    String field,
    bool ascending,
    _CompareColumn a,
    _CompareColumn b,
  ) {
    final sign = ascending ? 1 : -1;
    if (field == compareSortPrice) {
      // ราคา 0 = ติดต่อสอบถาม ไปท้ายทั้งสองทิศ
      final priceA = a.price == 0 ? null : a.price;
      final priceB = b.price == 0 ? null : b.price;
      if (priceA == null && priceB == null) return 0;
      if (priceA == null) return 1;
      if (priceB == null) return -1;
      return (priceA - priceB).sign.toInt() * sign;
    }
    final numbersA = _parseAllNumbers(a.attributes[field]);
    final numbersB = _parseAllNumbers(b.attributes[field]);
    if (numbersA.isEmpty && numbersB.isEmpty) return 0;
    if (numbersA.isEmpty) return 1;
    if (numbersB.isEmpty) return -1;
    final maxA = numbersA.reduce((x, y) => x > y ? x : y);
    final maxB = numbersB.reduce((x, y) => x > y ? x : y);
    if (maxA != maxB) return (maxA - maxB).sign.toInt() * sign;
    return (numbersA.length - numbersB.length).sign * sign;
  }

  @override
  Widget build(BuildContext context) {
    final names = _attributeNames;
    final computable = _computableNames(names);
    final sameNames = names.where(_isSame).toSet();

    // นับเฉพาะหัวข้อที่ยังมีอยู่ในตาราง
    final features = filter.features.where(names.contains).toSet();
    final sortField =
        filter.sortField == compareSortPrice ||
            computable.contains(filter.sortField)
        ? filter.sortField
        : compareSortNone;
    final effective = filter.copyWith(features: features, sortField: sortField);

    final matchByKey = <String, int>{};
    if (features.isNotEmpty) {
      for (final column in columns) {
        matchByKey[column.key] = features
            .where((name) => _hasFeature(column, name))
            .length;
      }
    }

    // เรียง: ตรงคุณสมบัติที่ติ๊กมากก่อน แล้วตามหัวข้อที่เรียง · เท่ากันคงลำดับเดิม
    final ordered = [
      for (var i = 0; i < columns.length; i++) (index: i, column: columns[i]),
    ];
    ordered.sort((a, b) {
      if (matchByKey.isNotEmpty) {
        final diff =
            (matchByKey[b.column.key] ?? 0) - (matchByKey[a.column.key] ?? 0);
        if (diff != 0) return diff;
      }
      if (sortField != compareSortNone) {
        final diff = _compareBySortField(
          sortField,
          effective.sortAscending,
          a.column,
          b.column,
        );
        if (diff != 0) return diff;
      }
      return a.index - b.index;
    });
    final sorted = [for (final entry in ordered) entry.column];

    // ป้าย "แนะนำ" เฉพาะเมื่อคอลัมน์แรกชนะคอลัมน์ถัดไปจริง
    var highlightIndex = -1;
    if (sorted.length >= 2) {
      final first = sorted[0];
      final second = sorted[1];
      final matchFirst = matchByKey[first.key] ?? 0;
      final matchSecond = matchByKey[second.key] ?? 0;
      if (matchByKey.isNotEmpty && matchFirst > matchSecond) {
        highlightIndex = 0;
      } else if (sortField != compareSortNone &&
          _compareBySortField(
                sortField,
                effective.sortAscending,
                first,
                second,
              ) <
              0) {
        highlightIndex = 0;
      }
    }

    var rows = names;
    if (effective.onlySelected && features.isNotEmpty) {
      rows = rows.where(features.contains).toList();
    }
    if (effective.onlyDifferences) {
      rows = rows.where((name) => !sameNames.contains(name)).toList();
    }

    // เปิดแผ่นตัวกรองแล้วเก็บค่าใหม่ลง store
    Future<void> openFilter() async {
      final next = await showCompareFilterSheet(
        context,
        attributeNames: names,
        computableNames: computable,
        sameNames: sameNames,
        current: effective,
      );
      if (next != null) onFilterChanged(next);
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        // จอกว้างพอให้กางครบทุกคอลัมน์
        final fitAll = constraints.maxWidth / _slotCount >= 180;
        final columnWidth = fitAll
            ? constraints.maxWidth / _slotCount
            : constraints.maxWidth / 2;
        final tableWidth = columnWidth * _slotCount;

        final headerRow = Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ...sorted.indexed.map(
              (entry) => SizedBox(
                width: columnWidth,
                child: _ColumnHeader(
                  column: entry.$2,
                  recommended: entry.$1 == highlightIndex,
                  matchCount: matchByKey[entry.$2.key],
                  featureCount: features.length,
                  onRemove: () => onRemove(entry.$2.key),
                  onBrowse: onBrowse,
                ),
              ),
            ),
            if (_hasAddSlot)
              SizedBox(
                width: columnWidth,
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: AspectRatio(
                    aspectRatio: 1,
                    child: _AddSlot(
                      onTap: () => showProductPickerSheet(
                        context,
                        onBrowseAll: onBrowse,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );

        final cloneRow = Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ...sorted.map(
              (column) => SizedBox(
                width: columnWidth,
                child: _CloneHeaderCell(
                  column: column,
                  onRemove: () => onRemove(column.key),
                  onBrowse: onBrowse,
                ),
              ),
            ),
            // ช่องว่างไม่มีอะไรให้ค้าง แต่ต้องกันที่ให้ตรงคอลัมน์
            if (_hasAddSlot) SizedBox(width: columnWidth),
          ],
        );

        final bodyRows = <Widget>[
          if (rows.isEmpty)
            Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                names.isEmpty
                    ? langs('compareNoSpecs')
                    : effective.onlySelected
                    ? langs('compareNoFilteredRows')
                    : langs('compareAllSame'),
                style: const TextStyle(color: AppColors.muted),
              ),
            ),
          ...rows.map(
            (name) => _AttributeRow(
              name: name,
              columns: sorted,
              columnWidth: columnWidth,
              isSame: sameNames.contains(name),
              hasAddSlot: _hasAddSlot,
            ),
          ),
          const SizedBox(height: 24),
        ];

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _FilterBar(
              filter: effective,
              onOpen: openFilter,
              onClear: () => onFilterChanged(const CompareFilter()),
            ),
            const Divider(height: 1),
            Expanded(
              child: _StickyTable(
                columnWidth: columnWidth,
                tableWidth: tableWidth,
                header: headerRow,
                clone: cloneRow,
                body: bodyRows,
              ),
            ),
          ],
        );
      },
    );
  }
}

// ตารางที่หัวค้างตอนเลื่อนดูสเปค
class _StickyTable extends StatefulWidget {
  const _StickyTable({
    required this.columnWidth,
    required this.tableWidth,
    required this.header,
    required this.clone,
    required this.body,
  });

  final double columnWidth;
  final double tableWidth;

  // หัวตารางจริง (การ์ดเต็มใบ)
  final Widget header;

  // หัวจำลองแบบย่อ โผล่เมื่อหัวจริงพ้นจอ
  final Widget clone;

  final List<Widget> body;

  @override
  State<_StickyTable> createState() => _StickyTableState();
}

class _StickyTableState extends State<_StickyTable> {
  final ScrollController _vertical = ScrollController();
  final ScrollController _bodyH = ScrollController();
  final ScrollController _cloneH = ScrollController();
  final GlobalKey _headerKey = GlobalKey();

  double _headerHeight = 0;
  bool _showClone = false;

  @override
  void initState() {
    super.initState();
    _vertical.addListener(_updateCloneVisibility);
    _bodyH.addListener(_syncClone);
  }

  @override
  void didUpdateWidget(_StickyTable oldWidget) {
    super.didUpdateWidget(oldWidget);
    // เพิ่ม/เปลี่ยนสินค้าแล้วความสูงหัวเปลี่ยน ต้องวัดใหม่
    _scheduleMeasure();
  }

  @override
  void dispose() {
    _vertical.dispose();
    _bodyH.dispose();
    _cloneH.dispose();
    super.dispose();
  }

  // วัดความสูงหัวจริงหลังวาดเสร็จ
  void _scheduleMeasure() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final box = _headerKey.currentContext?.findRenderObject() as RenderBox?;
      final height = box?.size.height ?? 0;
      if (height != _headerHeight) {
        _headerHeight = height;
        _updateCloneVisibility();
      }
      _syncClone();
    });
  }

  // หัวจริงพ้นจอ = โชว์หัวจำลอง (เทียบค่าก่อน setState ไม่ให้วาดทุกพิกเซล)
  void _updateCloneVisibility() {
    if (_headerHeight <= 0 || !_vertical.hasClients) return;
    final show = _vertical.offset >= _headerHeight;
    if (show == _showClone) return;
    setState(() => _showClone = show);
    // หัวจำลองเพิ่งสร้าง — ดันตัวเลื่อนแนวนอนให้ตรงตารางจริง
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncClone());
  }

  // ให้หัวจำลองเลื่อนแนวนอนตามตารางจริง
  void _syncClone() {
    if (!_cloneH.hasClients || !_bodyH.hasClients) return;
    final target = _bodyH.offset.clamp(0.0, _cloneH.position.maxScrollExtent);
    if ((_cloneH.offset - target).abs() > 0.5) _cloneH.jumpTo(target);
  }

  @override
  Widget build(BuildContext context) {
    _scheduleMeasure();

    return Stack(
      // ตัวเลื่อนต้องสูงเต็มพื้นที่ ไม่งั้นพื้นที่ว่างใต้สเปคสั้นๆ ลากไม่ติด
      fit: StackFit.expand,
      children: [
        SingleChildScrollView(
          controller: _vertical,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            controller: _bodyH,
            physics: SnapScrollPhysics(itemExtent: widget.columnWidth),
            child: SizedBox(
              width: widget.tableWidth,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  KeyedSubtree(key: _headerKey, child: widget.header),
                  ...widget.body,
                ],
              ),
            ),
          ),
        ),
        if (_showClone)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Material(
              elevation: 2,
              color: AppColors.surface,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                controller: _cloneH,
                // ปัดที่หัวจำลองไม่ได้ (สองตัวเลื่อนจะแย่งกัน jumpTo)
                physics: const NeverScrollableScrollPhysics(),
                child: SizedBox(width: widget.tableWidth, child: widget.clone),
              ),
            ),
          ),
      ],
    );
  }
}

// 1 คอลัมน์ของหัวค้าง: รูปเล็ก + ชื่อ + ✕ / ปุ่มเปลี่ยนสินค้า | เลือกโมเดล
class _CloneHeaderCell extends StatelessWidget {
  const _CloneHeaderCell({
    required this.column,
    required this.onRemove,
    this.onBrowse,
  });

  final _CompareColumn column;
  final VoidCallback onRemove;
  final VoidCallback? onBrowse;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: const BoxDecoration(
        border: Border(right: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SizedBox(
                width: 26,
                height: 26,
                child: RemoteImage(path: column.image, iconSize: 16),
              ),
              const SizedBox(width: 6),
              // ชื่อบรรทัดเดียว หัวค้างต้องเตี้ยไม่บังสเปค
              Expanded(
                child: Text(
                  column.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.navy900,
                  ),
                ),
              ),
              InkWell(
                onTap: onRemove,
                customBorder: const CircleBorder(),
                child: const SizedBox(
                  width: 24,
                  height: 24,
                  child: Icon(LucideIcons.x, size: 15),
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          Row(
            children: [
              Expanded(
                child: _HeaderButton(
                  icon: LucideIcons.arrowLeftRight,
                  label: langs('swapProduct'),
                  onTap: () => showProductPickerSheet(
                    context,
                    onBrowseAll: onBrowse,
                    replaceKey: column.key,
                  ),
                ),
              ),
              if (column.product.models.isNotEmpty) ...[
                const SizedBox(width: 6),
                Expanded(child: _ModelDropdown(column: column)),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

// แถบเหนือตาราง: ปุ่มตัวกรอง (มีตัวเลข) + ล้างการกรอง
class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.filter,
    required this.onOpen,
    required this.onClear,
  });

  final CompareFilter filter;
  final VoidCallback onOpen;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AppColors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Row(
              children: [
                OutlinedButton.icon(
                  onPressed: onOpen,
                  icon: const Icon(LucideIcons.slidersHorizontal, size: 18),
                  label: Text(
                    filter.badgeCount > 0
                        ? '${langs('compareFilterButton')} · ${filter.badgeCount}'
                        : langs('compareFilterButton'),
                    style: const TextStyle(fontSize: 13),
                  ),
                  style: pillButtonStyle(
                    foreground: filter.isActive
                        ? AppColors.brand700
                        : AppColors.navy900,
                    background: filter.isActive
                        ? AppColors.brand50
                        : AppColors.white,
                    borderColor: filter.isActive
                        ? AppColors.brand300
                        : AppColors.border,
                  ),
                ),
                const Spacer(),
                if (filter.isActive)
                  TextButton.icon(
                    onPressed: onClear,
                    icon: const Icon(LucideIcons.x, size: 16),
                    label: Text(
                      langs('compareFilterClear'),
                      style: const TextStyle(fontSize: 13),
                    ),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.muted,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

// หัวคอลัมน์การ์ด: รูป ชื่อ โมเดล ราคา ปุ่มเปลี่ยนสินค้า | เลือกโมเดล
class _ColumnHeader extends StatelessWidget {
  const _ColumnHeader({
    required this.column,
    required this.onRemove,
    required this.recommended,
    required this.matchCount,
    required this.featureCount,
    this.onBrowse,
  });

  final _CompareColumn column;
  final VoidCallback onRemove;

  // คอลัมน์ที่ชนะ — ติดป้าย "แนะนำ"
  final bool recommended;

  // จำนวนคุณสมบัติที่ตรง (null = ยังไม่ติ๊ก)
  final int? matchCount;
  final int featureCount;

  final VoidCallback? onBrowse;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              AspectRatio(
                aspectRatio: 1,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: RemoteImage(path: column.image),
                ),
              ),
              if (recommended)
                Positioned(
                  left: 4,
                  bottom: 4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.brand700,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      langs('compareRecommended'),
                      style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.white,
                      ),
                    ),
                  ),
                ),
              Positioned(
                top: 0,
                right: 0,
                child: Material(
                  color: AppColors.white,
                  shape: const CircleBorder(),
                  elevation: 2,
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: onRemove,
                    child: const SizedBox(
                      width: 32,
                      height: 32,
                      child: Icon(LucideIcons.x, size: 18),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            column.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 13,
              height: 1.35,
              fontWeight: FontWeight.w600,
              color: AppColors.navy900,
            ),
          ),
          // ชื่อโมเดลใต้ชื่อสินค้า ไม่งั้นสองโมเดลของสินค้าเดียวกันแยกไม่ออก
          if (column.modelName != null) ...[
            const SizedBox(height: 2),
            Text(
              column.modelName!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, color: AppColors.muted),
            ),
          ],
          const SizedBox(height: 4),
          Text.rich(
            TextSpan(
              text: formatPrice(column.price),
              children: [
                if (column.price != 0)
                  TextSpan(
                    text: ' ${priceUnitLabel(column.product.categoryId)}',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w400,
                      color: AppColors.muted,
                    ),
                  ),
              ],
            ),
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.brand700,
            ),
          ),
          if (matchCount != null) ...[
            const SizedBox(height: 4),
            Text(
              '${langs('compareMatchLabel')} $matchCount/$featureCount',
              style: const TextStyle(fontSize: 11.5, color: AppColors.muted),
            ),
          ],
          const SizedBox(height: 8),
          // สองปุ่มแทนที่ช่องเดิมในตำแหน่งเดิม (ไม่ใช่ลบแล้วเพิ่มใหม่)
          Row(
            children: [
              Expanded(
                child: _HeaderButton(
                  icon: LucideIcons.arrowLeftRight,
                  label: langs('swapProduct'),
                  onTap: () => showProductPickerSheet(
                    context,
                    onBrowseAll: onBrowse,
                    replaceKey: column.key,
                  ),
                ),
              ),
              // มีโมเดลก็โชว์ช่องเลือกเสมอ แม้มีโมเดลเดียว
              if (column.product.models.isNotEmpty) ...[
                const SizedBox(width: 6),
                Expanded(child: _ModelDropdown(column: column)),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

// dropdown เลือกโมเดลบนหัวคอลัมน์
class _ModelDropdown extends StatelessWidget {
  const _ModelDropdown({required this.column});

  final _CompareColumn column;

  // เปลี่ยนโมเดลของช่องนี้
  void _select(BuildContext context, String modelId) {
    final model = column.product.modelById(modelId);
    if (model == null) return;
    // โมเดลที่อีกช่องถืออยู่ = สลับกัน
    addCompareItem(
      CompareItem(
        productId: column.product.productId,
        productName: column.product.productName,
        productImage: column.product.productImage,
        productPrice: model.productPrice,
        modelId: model.modelId,
        modelName: model.modelName,
      ),
      replaceKey: column.key,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 34,
      // ต้องกำหนด alignment ไม่งั้นข้อความลอยบน
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: AppColors.circle,
        borderRadius: BorderRadius.circular(999),
      ),
      child: DropdownButton<String>(
        value: column.modelId,
        isExpanded: true, // ไม่ใส่แล้วชื่อโมเดลยาวล้นเม็ดยา
        isDense: true,
        underline: const SizedBox.shrink(),
        borderRadius: BorderRadius.circular(12),
        icon: const Icon(LucideIcons.chevronDown, size: 16),
        style: const TextStyle(fontSize: 11.5, color: AppColors.navy900),
        selectedItemBuilder: (context) => column.product.models
            .map(
              (model) => Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  model.modelName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.navy900,
                  ),
                ),
              ),
            )
            .toList(),
        items: column.product.models
            .map(
              (model) => DropdownMenuItem<String>(
                value: model.modelId,
                child: Text(
                  '${model.modelName} · ${formatPrice(model.productPrice)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13),
                ),
              ),
            )
            .toList(),
        onChanged: (modelId) {
          if (modelId != null) _select(context, modelId);
        },
      ),
    );
  }
}

// ปุ่มเม็ดยาเล็กบนหัวคอลัมน์
class _HeaderButton extends StatelessWidget {
  const _HeaderButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 15),
      label: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 11.5),
      ),
      style: pillButtonStyle(
        foreground: AppColors.navy900,
        background: AppColors.circle,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        fillWidth: true,
      ).copyWith(iconAlignment: IconAlignment.start),
    );
  }
}

// แถวสเปค 1 หัวข้อ: แถบชื่อหัวข้อ (ป้ายเหมือน/ต่าง) + ค่าของแต่ละคอลัมน์
class _AttributeRow extends StatelessWidget {
  const _AttributeRow({
    required this.name,
    required this.columns,
    required this.columnWidth,
    required this.isSame,
    required this.hasAddSlot,
  });

  final String name;
  final List<_CompareColumn> columns;
  final double columnWidth;
  final bool isSame;

  // มีช่องว่างต่อท้ายไหม (เว้นเซลล์ให้ตรง)
  final bool hasAddSlot;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // แถบชื่อหัวข้อเทาเข้มกว่าพื้นหน้าหนึ่งระดับ ไม่งั้นกลืน
        Container(
          width: double.infinity,
          color: AppColors.circle,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  name,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy900,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: isSame ? AppColors.white : AppColors.brand50,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  isSame ? langs('compareSame') : langs('compareDifferent'),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: isSame ? AppColors.muted : AppColors.brand700,
                  ),
                ),
              ),
            ],
          ),
        ),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ...columns.map((column) {
                return Container(
                  width: columnWidth,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  decoration: const BoxDecoration(
                    border: Border(
                      right: BorderSide(color: AppColors.border),
                      bottom: BorderSide(color: AppColors.border),
                    ),
                  ),
                  child: Text(
                    column.attributes[name] ?? 'ไม่มี',
                    style: const TextStyle(
                      fontSize: 13,
                      height: 1.4,
                      color: AppColors.navy900,
                    ),
                  ),
                );
              }),
              if (hasAddSlot)
                Container(
                  width: columnWidth,
                  decoration: const BoxDecoration(
                    color: AppColors.surface,
                    border: Border(bottom: BorderSide(color: AppColors.border)),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

// ตะกร้าว่าง: แสดงช่องว่างกรอบประเท่าจำนวนที่เพิ่มได้ กดแล้วไปแท็บสินค้า
class _EmptyState extends StatelessWidget {
  const _EmptyState({this.onBrowse});

  final VoidCallback? onBrowse;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 24),
      children: [
        Text(
          langs('compareEmptyTitle'),
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.navy900,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          langs('compareEmptyBody', {'max': CompareStore.maxItems}),
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 13,
            height: 1.5,
            color: AppColors.muted,
          ),
        ),
        const SizedBox(height: 20),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 0.95,
          children: List.generate(
            CompareStore.maxItems,
            (_) => _AddSlot(
              onTap: () =>
                  showProductPickerSheet(context, onBrowseAll: onBrowse),
            ),
          ),
        ),
      ],
    );
  }
}

// ช่องว่าง 1 ช่อง (กรอบประ + เครื่องหมายบวก)
class _AddSlot extends StatelessWidget {
  const _AddSlot({this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return DottedBorderBox(
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(LucideIcons.plus, size: 26, color: AppColors.muted),
          const SizedBox(height: 6),
          Text(
            langs('addProduct'),
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.muted,
            ),
          ),
        ],
      ),
    );
  }
}

// กรอบเส้นประ (Flutter ไม่มีในตัว วาดด้วย CustomPaint)
class DottedBorderBox extends StatelessWidget {
  const DottedBorderBox({super.key, required this.child, this.onTap});

  final Widget child;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DashedBorderPainter(),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Center(child: child),
        ),
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.border
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    final rect = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(12),
    );

    const dash = 6.0;
    const gap = 4.0;
    final path = Path()..addRRect(rect);
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        canvas.drawPath(metric.extractPath(distance, distance + dash), paint);
        distance += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) => false;
}
