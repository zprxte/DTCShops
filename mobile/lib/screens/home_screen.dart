import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';
import '../services/api_service.dart';
import '../models/category.dart';
import '../models/shop.dart';
import '../widgets/product_rail.dart';
import '../widgets/language_button.dart';
import '../widgets/search_bar_button.dart';
import '../widgets/async_state.dart';
import '../widgets/remote_image.dart';
import '../utils/launch.dart';

// แท็บหน้าแรก: ช่องค้นหา → หมวดหมู่ → สินค้าแนะนำ (ยอดนิยม) → รายการสาขา
class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    this.onSeeAll,
    this.onCategoryTap,
    this.onSearch,
  });
  final VoidCallback? onSeeAll;
  final void Function(String categoryId)? onCategoryTap;
  final void Function(String query)? onSearch;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<List<dynamic>> _future;
  @override
  void initState() {
    super.initState();
    _future = _fetchData();
  }

  // โหลดหมวดหมู่ สินค้าแนะนำ และสาขาพร้อมกัน
  Future<List<dynamic>> _fetchData() async {
    return await Future.wait([
      ApiService().fetchCategories(),
      // ต้องเป็น 'popular' — ค่าที่ backend ไม่รู้จักจะตกไปเป็น newest เงียบๆ
      ApiService().fetchProducts(sort: 'popular'),
      ApiService().fetchShops(),
    ]);
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: Container(
                width: 6,
                decoration: BoxDecoration(
                  color: AppColors.brand500,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Text(
              title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: AppColors.brand600,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(langs('appTitle')),
        actions: [LanguageButton()],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: SearchBarButton(onSearch: widget.onSearch),
          ),
        ),
      ),
      body: FutureBuilder(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const LoadingView();
          } else if (snapshot.hasError) {
            return ErrorView(error: snapshot.error);
          } else if (!snapshot.hasData || snapshot.data!.isEmpty) {
            return Center(child: Text(langs('noData')));
          } else {
            final categories = snapshot.data![0] as List<Category>;
            final products = (snapshot.data![1] as ProductPage).products;
            final shops = snapshot.data![2] as List<Shop>;
            return ListView(
              padding: const EdgeInsets.symmetric(vertical: 16),
              children: [
                _sectionTitle(langs('categoriesTitle')),
                const SizedBox(height: 16),
                GridView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: categories.length,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    mainAxisExtent: 130,
                  ),
                  itemBuilder: (context, index) {
                    final category = categories[index];
                    return InkWell(
                      borderRadius: BorderRadius.all(Radius.circular(12)),
                      onTap: () =>
                          widget.onCategoryTap?.call(category.categoryId),
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppColors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              width: 64,
                              height: 64,
                              decoration: BoxDecoration(
                                color: AppColors.white,
                                shape: BoxShape.circle,
                                border: Border.all(color: AppColors.border),
                              ),
                              // หมวดที่ไม่มีรูปใช้ไอคอนสีแบรนด์ ไม่ให้ดูเหมือนรูปเสีย
                              child: category.categoryImage == null
                                  ? Icon(
                                      LucideIcons.layoutGrid,
                                      size: 40,
                                      color: AppColors.brand600,
                                    )
                                  : RemoteImage(path: category.categoryImage),
                            ),
                            const SizedBox(height: 8),
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                              ),
                              child: Text(
                                category.categoryName,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.normal,
                                  color: AppColors.navy900,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(child: _sectionTitle(langs('featuredTitle'))),
                    Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: TextButton(
                        onPressed: widget.onSeeAll,
                        child: Text(langs('seeAllProducts')),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                ProductRail(products: products),
                const SizedBox(height: 20),
                _sectionTitle(langs('shopsTitle')),
                const SizedBox(height: 12),
                _ShopList(shops: shops),
              ],
            );
          }
        },
      ),
    );
  }
}

// รายการสาขา DTC Shop (ไม่ทำแผนที่ — ตัดสินใจ 28 ก.ย. 2026)
class _ShopList extends StatelessWidget {
  const _ShopList({required this.shops});

  final List<Shop> shops;

  @override
  Widget build(BuildContext context) {
    if (shops.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Text(
          langs('noShops'),
          style: const TextStyle(fontSize: 13, color: AppColors.muted),
        ),
      );
    }

    return Column(
      children: shops
          .map(
            (shop) => Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  border: Border.all(color: AppColors.border),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      LucideIcons.store,
                      size: 20,
                      color: AppColors.brand600,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            shop.shopName,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: AppColors.navy900,
                            ),
                          ),
                          if ((shop.address ?? '').isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              shop.address!,
                              style: const TextStyle(
                                fontSize: 12,
                                height: 1.4,
                                color: AppColors.muted,
                              ),
                            ),
                          ],
                          if ((shop.tel ?? '').isNotEmpty) ...[
                            const SizedBox(height: 4),
                            InkWell(
                              onTap: () => openExternalLink(
                                context,
                                'tel:${shop.tel!.replaceAll(RegExp(r'[^0-9+]'), '')}',
                                label: langs('phoneApp'),
                              ),
                              child: Text(
                                langs('phonePrefix', {'tel': shop.tel!}),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.brand700,
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}
