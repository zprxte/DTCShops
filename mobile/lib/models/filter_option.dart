// ตัวเลือก 1 อันในตัวกรอง (หมวดหมู่ หรือ แท็ก)
class FilterOption {
  final String value; // category_id หรือชื่อแท็ก
  final String label; // ข้อความที่แสดง
  final int count; // มีสินค้ากี่ชิ้น

  const FilterOption({
    required this.value,
    required this.label,
    required this.count,
  });

  factory FilterOption.fromCategory(Map<String, dynamic> json) => FilterOption(
    value: json['category_id'].toString(),
    label: json['category_name']?.toString() ?? '',
    count: (json['count'] as num?)?.toInt() ?? 0,
  );

  factory FilterOption.fromTag(Map<String, dynamic> json) => FilterOption(
    value: json['tag'].toString(),
    label: json['label']?.toString() ?? json['tag'].toString(),
    count: (json['count'] as num?)?.toInt() ?? 0,
  );
}

// ตัวเลือกทั้งหมดของตัวกรอง (GET /products/filters)
class FilterOptions {
  final List<FilterOption> categories;
  final List<FilterOption> tags;

  const FilterOptions({required this.categories, required this.tags});
}

// ค่าตัวกรอง + การเรียงที่ผู้ใช้เลือกอยู่
class ProductFilters {
  final Set<String> categoryIds;
  final Set<String> tags;
  final String sort; // newest / popular / price_asc / price_desc / name

  const ProductFilters({
    this.categoryIds = const {},
    this.tags = const {},
    this.sort = 'newest',
  });

  int get activeCount => categoryIds.length + tags.length;

  // ค่าเริ่มต้น: ผลค้นหาเรียงตามความตรง · สินค้าทั้งหมดเรียงใหม่สุด
  static ProductFilters initial({required bool isSearch}) =>
      ProductFilters(sort: isSearch ? 'relevance' : 'newest');

  ProductFilters copyWith({
    Set<String>? categoryIds,
    Set<String>? tags,
    String? sort,
  }) => ProductFilters(
    categoryIds: categoryIds ?? this.categoryIds,
    tags: tags ?? this.tags,
    sort: sort ?? this.sort,
  );
}

// ค่าเรียงที่ backend รับ → คีย์ข้อความแปล ('relevance' ใช้ได้เฉพาะตอนค้นหา)
const sortLabels = {
  'relevance': 'sortRelevance',
  'newest': 'sortNewest',
  'popular': 'sortPopular',
  'price_asc': 'sortPriceAsc',
  'price_desc': 'sortPriceDesc',
  'name': 'sortName',
};
