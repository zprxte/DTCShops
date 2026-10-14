import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../config/app_colors.dart';
import '../language/app_language.dart';
import '../stores/compare_store.dart';
import 'compare_screen.dart';
import 'home_screen.dart';
import 'products_screen.dart';

// โครงแอป: แถบเมนูล่าง 3 แท็บ (IndexedStack — สลับแท็บแล้วหน้าเดิมไม่ถูกสร้างใหม่)
class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _index = 0;
  String? _categoryId;
  String? _searchword;
  int _seq = 0;

  // สลับไปแท็บสินค้าพร้อมหมวดหรือคำค้น
  void _openProducts({String? categoryId, String? searchword}) {
    setState(() {
      _categoryId = categoryId;
      _searchword = searchword;
      _seq++;
      _index = 1;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: [
          HomeScreen(
            onSeeAll: () => _openProducts(),
            onCategoryTap: (id) => _openProducts(categoryId: id),
            onSearch: (q) => _openProducts(searchword: q),
          ),
          ProductsScreen(
            initialCategoryId: _categoryId,
            initialSearchword: _searchword,
            requestSeq: _seq,
            onSearch: (q) => _openProducts(searchword: q),
          ),
          CompareScreen(onBrowse: () => _openProducts()),
        ],
      ),
      // พื้นขาว + เส้นขอบบน (ค่าเริ่มต้นของ M3 เป็นเทาอมฟ้า)
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: NavigationBarTheme(
          data: NavigationBarThemeData(
            iconTheme: WidgetStateProperty.resolveWith(
              (states) => IconThemeData(
                color: states.contains(WidgetState.selected)
                    ? AppColors.brand600
                    : AppColors.muted,
              ),
            ),
            labelTextStyle: WidgetStateProperty.resolveWith(
              (states) => TextStyle(
                fontSize: 12,
                color: states.contains(WidgetState.selected)
                    ? AppColors.brand600
                    : AppColors.muted,
              ),
            ),
          ),
          child: NavigationBar(
            backgroundColor: AppColors.white,
            surfaceTintColor: Colors.transparent,
            indicatorColor: Colors.transparent,
            elevation: 0,
            selectedIndex: _index,
            onDestinationSelected: (idx) => setState(() => _index = idx),
            destinations: [
              NavigationDestination(
                icon: const Icon(LucideIcons.house),
                label: langs('navHome'),
              ),
              NavigationDestination(
                icon: const Icon(LucideIcons.layoutGrid),
                label: langs('navProducts'),
              ),
              NavigationDestination(
                icon: _compareBadge(const Icon(LucideIcons.gitCompare)),
                label: langs('navCompare'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ป้ายจำนวนสินค้าในตะกร้าเปรียบเทียบ
  Widget _compareBadge(Widget icon) {
    return ValueListenableBuilder<List<CompareItem>>(
      valueListenable: CompareStore.instance.items,
      builder: (context, items, icon) => Badge(
        isLabelVisible: items.isNotEmpty,
        label: Text('${items.length}'),
        child: icon,
      ),
      child: icon,
    );
  }
}
