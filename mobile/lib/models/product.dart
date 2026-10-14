// สินค้า 1 ตัวแบบการ์ด (GET /products และ /search)
class Product {
  final String productId;
  final String productName;
  final String? productImage;
  final num productPrice;
  final String? slug;

  // มีโมเดลไหม — ปุ่มเปรียบเทียบใช้ตัดสินว่าต้องถามโมเดลก่อน
  final bool hasModels;

  // รหัสโมเดลทั้งหมด (ว่าง = ไม่มีโมเดล) ใช้บอกว่าเลือกครบทุกโมเดลแล้วหรือยัง
  final List<String> modelIds;

  const Product({
    required this.productId,
    required this.productName,
    required this.productImage,
    required this.productPrice,
    required this.slug,
    this.hasModels = false,
    this.modelIds = const [],
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      productId: json['product_id'],
      productName: json['product_name'],
      productImage: json['product_image'],
      productPrice: (json['product_price'] as num?) ?? 0,
      slug: json['slug'],
      hasModels: json['has_models'] == true,
      modelIds: ((json['model_ids'] as List?) ?? const [])
          .map((e) => e.toString())
          .toList(),
    );
  }
}
