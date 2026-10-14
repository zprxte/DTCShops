import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';
import '../services/api_service.dart';
import '../models/filter_option.dart';
import 'product_detail_screen.dart';
import '../widgets/async_state.dart';
import '../widgets/filter_sheet.dart';
import '../widgets/language_button.dart';
import '../widgets/pagination_bar.dart';
import '../widgets/search_bar_button.dart';
import '../widgets/product_card.dart';

// แท็บสินค้า: กริด 2 คอลัมน์ + ตัวกรอง/เรียง + แบ่งหน้า · ส่ง searchword มา = หน้าผลค้นหา
class ProductsScreen extends StatefulWidget {
  const ProductsScreen({
    super.key,
    this.initialCategoryId,
    this.initialSearchword,
    this.requestSeq = 0,
    this.onSearch,
  });
  final String? initialCategoryId;
  final String? initialSearchword;
  final int requestSeq;
  final void Function(String query)? onSearch;

  @override
  State<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen> {
  late Future<ProductPage> _future;

  int _page = 1;

  // เปลี่ยนหน้าแล้วพากลับขึ้นบนสุด
  final ScrollController _gridController = ScrollController();

  @override
  void initState() {
    super.initState();
    _searchword = widget.initialSearchword;
    _filters = _filtersForRequest();
    _future = _fetch();
    ApiService()
        .fetchFilters()
        .then((options) {
          if (mounted) setState(() => _options = options);
        })
        .catchError((Object _) {}); // โหลดตัวกรองพังก็ยังดูสินค้าได้
  }

  // ตัวกรองเริ่มต้นจากคำสั่งล่าสุดของ MainScreen (หมวดที่กดมาเป็นชิปที่เอาออกได้)
  ProductFilters _filtersForRequest() {
    final categoryId = widget.initialCategoryId;
    return ProductFilters.initial(isSearch: _isSearch)
        .copyWith(categoryIds: categoryId == null ? null : {categoryId});
  }

  // อยู่ใน IndexedStack ไม่ถูกสร้างใหม่ — คำสั่งใหม่มาทางนี้แทน initState
  @override
  void didUpdateWidget(ProductsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // ดูตัวนับ เพราะกดหมวดเดิมซ้ำค่าไม่เปลี่ยน
    if (widget.requestSeq == oldWidget.requestSeq) return;
    setState(() {
      _searchword = widget.initialSearchword;
      _searchedAs = null;
      _suggestions = [];
      _filters = _filtersForRequest();
      _page = 1;
      _future = _fetch();
    });
    if (_gridController.hasClients) _gridController.jumpTo(0);
  }

  @override
  void dispose() {
    _gridController.dispose();
    super.dispose();
  }

  // คำที่ใช้ค้นจริงเมื่อกู้แป้นให้ (null = คำที่พิมพ์)
  String? _searchedAs;

  // คุณหมายถึง…? (เฉพาะตอนค้นไม่เจอ)
  List<SearchSuggestion> _suggestions = [];

  late ProductFilters _filters;
  FilterOptions? _options;
  int _total = 0;

  // เปิดแผ่นตัวกรองแล้วโหลดใหม่จากหน้า 1
  Future<void> _openFilters() async {
    final options = _options;
    if (options == null) return;
    final result = await showFilterSheet(
      context,
      options: options,
      current: _filters,
      isSearch: _isSearch,
    );
    if (result == null || !mounted) return;
    setState(() {
      _filters = result;
      _page = 1;
      _future = _fetch();
    });
    if (_gridController.hasClients) _gridController.jumpTo(0);
  }

  // เอาตัวกรองออกหนึ่งอัน (กดกากบาทบนชิป)
  void _removeFilter({String? categoryId, String? tag}) {
    setState(() {
      _filters = _filters.copyWith(
        categoryIds: categoryId == null
            ? null
            : ({..._filters.categoryIds}..remove(categoryId)),
        tags: tag == null ? null : ({..._filters.tags}..remove(tag)),
      );
      _page = 1;
      _future = _fetch();
    });
  }

  // คำค้นที่แสดงผลอยู่ (null = สินค้าทั้งหมด) เป็น state เพราะล้างจากชิปได้
  String? _searchword;

  // ออกจากโหมดผลค้นหา (ตัวกรองที่ติ๊กไว้ยังอยู่)
  void _clearSearch() {
    setState(() {
      _searchword = null;
      _searchedAs = null;
      _suggestions = [];
      // 'relevance' ใช้ได้เฉพาะตอนมีคำค้น ต้องเปลี่ยนการเรียงด้วย
      if (_filters.sort == 'relevance') {
        _filters = _filters.copyWith(sort: 'newest');
      }
      _page = 1;
      _future = _fetch();
    });
    if (_gridController.hasClients) _gridController.jumpTo(0);
  }

  bool get _isSearch => (_searchword ?? '').trim().isNotEmpty;

  // โหลด: มีคำค้น = /search · ไม่มี = /products
  Future<ProductPage> _fetch() {
    final future = _isSearch
        ? ApiService()
              .searchProducts(
                _searchword!.trim(),
                page: _page,
                categoryIds: _filters.categoryIds,
                tags: _filters.tags,
                sort: _filters.sort,
              )
              .then((result) {
                if (mounted) {
                  setState(() {
                    _searchedAs = result.searchedAs;
                    _suggestions = result.suggestions;
                  });
                }
                return ProductPage(
                  products: result.products,
                  page: result.page,
                  totalPages: result.totalPages,
                  total: result.total,
                );
              })
        : ApiService().fetchProducts(
            page: _page,
            categoryIds: _filters.categoryIds,
            tags: _filters.tags,
            sort: _filters.sort,
          );
    // จำนวนรายการเก็บใน State เพราะแถบตัวกรองวาดก่อน body
    future
        .then((result) {
          if (mounted) {
            setState(() {
              _total = result.total;
            });
          }
        })
        .catchError((Object _) {});
    return future;
  }

  void _goToPage(int page) {
    setState(() {
      _page = page;
      _future = _fetch();
    });
    if (_gridController.hasClients) _gridController.jumpTo(0);
  }

  // หัวรายการ: ปุ่มตัวกรอง/เรียง + จำนวนรายการ → ชิปของที่เลือก
  Widget _filterHeader() {
    final hasChips =
        _isSearch ||
        _filters.categoryIds.isNotEmpty ||
        _filters.tags.isNotEmpty;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: const BoxDecoration(
        color: AppColors.white,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // ป้ายเรียงยาวย่อด้วย … แทนล้นขอบ
              Expanded(
                child: Row(
                  children: [
                    Flexible(
                      child: OutlinedButton.icon(
                        onPressed: _options == null ? null : _openFilters,
                        icon: const Icon(
                          LucideIcons.slidersHorizontal,
                          size: 16,
                        ),
                        label: Text(
                          _filters.activeCount > 0
                              ? langs('filtersWithCount', {
                                  'count': _filters.activeCount,
                                })
                              : langs('filters'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        style: OutlinedButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          foregroundColor: AppColors.navy900,
                          side: const BorderSide(color: AppColors.button),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: OutlinedButton(
                        onPressed: _options == null ? null : _openFilters,
                        style: OutlinedButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          foregroundColor: AppColors.navy900,
                          side: const BorderSide(color: AppColors.button),
                        ),
                        child: Text(
                          langs('sortPrefix', {
                            'label': langs(sortLabels[_filters.sort] ?? ''),
                          }),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                _isSearch
                    ? langs('foundItems', {'count': _total})
                    : langs('totalItems', {'count': _total}),
                maxLines: 1,
                style: const TextStyle(fontSize: 12, color: AppColors.muted),
              ),
            ],
          ),
          if (hasChips) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                // ชิปคำค้นมาก่อนเสมอ (เป็นทางออกจากโหมดค้นหา)
                if (_isSearch)
                  Chip(
                    label: Text(
                      langs('searchChip', {'word': _searchword!.trim()}),
                    ),
                    onDeleted: _clearSearch,
                  ),
                ..._filters.categoryIds.map(
                  (id) => Chip(
                    label: Text(_categoryLabel(id)),
                    onDeleted: () => _removeFilter(categoryId: id),
                  ),
                ),
                ..._filters.tags.map(
                  (tag) => Chip(
                    label: Text(tag),
                    onDeleted: () => _removeFilter(tag: tag),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  String _categoryLabel(String id) {
    final options = _options?.categories ?? const <FilterOption>[];
    for (final option in options) {
      if (option.value == id) return option.label;
    }
    return id;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        shape: const Border(),
        title: Text(langs('productsTitle'), overflow: TextOverflow.ellipsis),
        actions: [LanguageButton()],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: SearchBarButton(
              query: _isSearch ? _searchword!.trim() : null,
              onSearch: widget.onSearch,
            ),
          ),
        ),
      ),
      body: FutureBuilder<ProductPage>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          }
          if (snapshot.hasError) {
            return ErrorView(error: snapshot.error);
          }

          final result = snapshot.data!;
          final products = result.products;

          return ScrollConfiguration(
            behavior: ScrollConfiguration.of(context)
                .copyWith(overscroll: false),
            // หัว ตาราง และแถบเลขหน้าอยู่ในตัวเลื่อนเดียวกัน
            child: CustomScrollView(
              controller: _gridController,
              slivers: [
                SliverToBoxAdapter(child: _filterHeader()),
                if (_searchedAs != null)
                  SliverToBoxAdapter(
                    child: Container(
                      width: double.infinity,
                      color: AppColors.brand50,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 10,
                      ),
                      child: Text(
                        langs('searchedAs', {'word': _searchedAs ?? ''}),
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.brand700,
                        ),
                      ),
                    ),
                  ),
                if (products.isEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.all(48),
                      child: Column(
                        children: [
                          const Icon(
                            LucideIcons.searchX,
                            size: 44,
                            color: AppColors.muted,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            langs('noProducts'),
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: AppColors.navy900,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                // ค้นไม่เจอ → เสนอชื่อใกล้เคียง
                if (products.isEmpty && _suggestions.isNotEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            langs('didYouMean'),
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.muted,
                            ),
                          ),
                          const SizedBox(height: 4),
                          ..._suggestions.map(
                            (s) => Card(
                              margin: const EdgeInsets.only(top: 8),
                              child: ListTile(
                                title: Text(s.productName),
                                trailing: const Icon(LucideIcons.chevronRight),
                                onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => ProductDetailScreen(
                                      productId: s.productId,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                SliverPadding(
                  padding: const EdgeInsets.all(12),
                  sliver: SliverGrid.builder(
                    itemCount: products.length,
                    gridDelegate:
                        const SliverGridDelegateWithMaxCrossAxisExtent(
                          maxCrossAxisExtent: 250,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          mainAxisExtent: 300,
                        ),
                    itemBuilder: (context, index) => ProductCard(
                      product: products[index],
                      query: _isSearch ? _searchword : null,
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: SafeArea(
                    top: false,
                    child: PaginationBar(
                      page: result.page,
                      totalPages: result.totalPages,
                      onChanged: _goToPage,
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
