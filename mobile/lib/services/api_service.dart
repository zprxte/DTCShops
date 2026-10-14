// เรียก backend API ทุกเส้นที่แอปใช้ แล้วแปลงเป็น model
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import '../models/category.dart';
import '../models/compare_product.dart';
import '../models/filter_option.dart';
import '../models/product_detail.dart';
import '../models/product.dart';
import '../models/shop.dart';

// สินค้า 1 หน้า + จำนวนทั้งหมด
class ProductPage {
  final List<Product> products;
  final int page;
  final int totalPages;
  final int total; // จำนวนรายการทั้งหมด (ทุกหน้ารวมกัน)
  const ProductPage({
    required this.products,
    required this.page,
    required this.totalPages,
    this.total = 0,
  });
}

// คำแนะนำ 1 รายการ (autocomplete / คุณหมายถึง…?) มี productId ให้กดเข้าหน้าสินค้าได้
class SearchSuggestion {
  final String productId;
  final String productName;
  final String? slug;

  const SearchSuggestion({
    required this.productId,
    required this.productName,
    required this.slug,
  });

  factory SearchSuggestion.fromJson(Map<String, dynamic> json) =>
      SearchSuggestion(
        productId: json['product_id'].toString(),
        productName: json['product_name']?.toString() ?? '',
        slug: json['slug']?.toString(),
      );
}

// ผลค้นหา + คำที่ระบบใช้ค้นจริง + คำแนะนำ
class SearchResult {
  final List<Product> products;
  final int page;
  final int totalPages;
  final int total;

  // คำที่ใช้ค้นจริงเมื่อกู้แป้นให้ (null = คำที่พิมพ์)
  final String? searchedAs;

  // มีค่าเฉพาะตอนค้นไม่เจอ
  final List<SearchSuggestion> suggestions;

  const SearchResult({
    required this.products,
    required this.page,
    required this.totalPages,
    required this.total,
    required this.searchedAs,
    required this.suggestions,
  });
}

class CategoryPage {
  final List<Category> categories;
  final int page;
  final int totalPages;
  const CategoryPage({
    required this.categories,
    required this.page,
    required this.totalPages,
  });
}

class ShopPage {
  final List<Shop> shops;
  final int page;
  final int totalPages;
  const ShopPage({
    required this.shops,
    required this.page,
    required this.totalPages,
  });
}

class ApiService {
  // GET แล้วคืน JSON (เช็ค status ที่เดียว)
  Future<dynamic> _getJson(String path) async {
    final response = await http.get(Uri.parse('${ApiConfig.baseUrl}$path'));
    if (response.statusCode != 200) {
      throw Exception('HTTP ${response.statusCode} จาก $path');
    }
    // ต้อง decode UTF-8 เอง — response.body ใช้ latin1 เมื่อไม่ระบุ charset ไทยจะเพี้ยน
    return jsonDecode(utf8.decode(response.bodyBytes));
  }

  // ข้อมูลเต็มของสินค้าในตะกร้าเปรียบเทียบ (ใช้ /products/compare เพราะ /:id นับยอดเข้าชม)
  Future<List<CompareProduct>> fetchCompare(List<String> productIds) async {
    if (productIds.isEmpty) return [];
    final ids = productIds.map(Uri.encodeComponent).join(',');
    final json = await _getJson('/products/compare?ids=$ids');
    final list = (json['products'] as List?) ?? const [];
    return list
        .map((row) => CompareProduct.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  // ค้นหาสินค้า — backend จัดการพิมพ์ผิด/ผิดแป้นให้หมด
  Future<SearchResult> searchProducts(
    String searchword, {
    int page = 1,
    int limit = 10,
    Set<String> categoryIds = const {},
    Set<String> tags = const {},
    String? sort,
  }) async {
    final q = Uri.encodeComponent(searchword);
    final query = StringBuffer('?searchword=$q&page=$page&limit=$limit');
    if (categoryIds.isNotEmpty) {
      final ids = categoryIds.map(Uri.encodeComponent).join(',');
      query.write('&category_ids=$ids');
    }
    if (tags.isNotEmpty) {
      final list = tags.map(Uri.encodeComponent).join(',');
      query.write('&tags=$list');
    }
    if (sort != null) query.write('&sort=$sort');
    final body = await _getJson('/search$query') as Map<String, dynamic>;
    return SearchResult(
      products: ((body['products'] as List?) ?? [])
          .map((item) => Product.fromJson(item as Map<String, dynamic>))
          .toList(),
      page: (body['page'] as num?)?.toInt() ?? 1,
      totalPages: (body['total_pages'] as num?)?.toInt() ?? 1,
      total: (body['total'] as num?)?.toInt() ?? 0,
      searchedAs: body['searched_as']?.toString(),
      suggestions: ((body['suggestions'] as List?) ?? [])
          .map((e) => SearchSuggestion.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  // คำแนะนำระหว่างพิมพ์ (≥ 2 ตัวอักษร)
  Future<List<SearchSuggestion>> fetchAutocomplete(String searchword) async {
    if (searchword.trim().length < 2) return [];
    final q = Uri.encodeComponent(searchword.trim());
    final body = await _getJson(
      '/search/autocomplete?searchword=$q',
    ) as Map<String, dynamic>;
    return ((body['suggestions'] as List?) ?? [])
        .map((e) => SearchSuggestion.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ตัวเลือกตัวกรองที่มีจริงใน DB
  Future<FilterOptions> fetchFilters() async {
    final json = await _getJson('/products/filters') as Map<String, dynamic>;
    return FilterOptions(
      categories: ((json['categories'] as List?) ?? [])
          .map((e) => FilterOption.fromCategory(e as Map<String, dynamic>))
          .toList(),
      tags: ((json['tags'] as List?) ?? [])
          .map((e) => FilterOption.fromTag(e as Map<String, dynamic>))
          .toList(),
    );
  }

  // รายการสินค้า + ตัวกรอง + เรียง + แบ่งหน้า
  Future<ProductPage> fetchProducts({
    int page = 1,
    int limit = 10,
    String? categoryId,
    Set<String> categoryIds = const {},
    Set<String> tags = const {},
    String? sort,
  }) async {
    final query = StringBuffer('?page=$page&limit=$limit');
    if (categoryId != null) query.write('&category_id=$categoryId');
    if (categoryIds.isNotEmpty) {
      final ids = categoryIds.map(Uri.encodeComponent).join(',');
      query.write('&category_ids=$ids');
    }
    if (tags.isNotEmpty) {
      final list = tags.map(Uri.encodeComponent).join(',');
      query.write('&tags=$list');
    }
    if (sort != null) query.write('&sort=$sort');

    final body = await _getJson('/products$query') as Map<String, dynamic>;
    final data = body['products'] as List<dynamic>;
    return ProductPage(
      products: data
          .map((item) => Product.fromJson(item as Map<String, dynamic>))
          .toList(),
      page: body['page'] as int,
      totalPages: body['total_pages'] as int,
      total: (body['total'] as num?)?.toInt() ?? 0,
    );
  }

  // ข้อมูลเต็มของสินค้า 1 ตัว (นับยอดเข้าชม — เรียกเฉพาะตอนเปิดหน้ารายละเอียด)
  Future<ProductDetail> fetchProductDetail(String productId) async {
    final json = await _getJson(
      '/products/${Uri.encodeComponent(productId)}',
    ) as Map<String, dynamic>;
    return ProductDetail.fromJson(json);
  }

  // หมวดหมู่ทั้งหมด
  Future<List<Category>> fetchCategories() async {
    final data = await _getJson('/categories') as List<dynamic>;
    return data
        .map((item) => Category.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  // สาขาทั้งหมด
  Future<List<Shop>> fetchShops() async {
    final data = await _getJson('/shops') as List<dynamic>;
    return data
        .map((item) => Shop.fromJson(item as Map<String, dynamic>))
        .toList();
  }
}
