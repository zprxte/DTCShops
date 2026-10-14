// สินค้า 1 ตัวจาก GET /products/compare: หัวคอลัมน์ + สเปคร่วม + โมเดลพร้อมค่าที่เขียนทับ
class CompareProduct {
  final String productId;
  final String productName;
  final String? productImage;
  final num productPrice;
  final String? categoryId; // ใช้เลือกหน่วยราคา

  // ชื่อหัวข้อ → ค่าร่วมทุกโมเดล
  final Map<String, String> attributes;

  final List<CompareModel> models;

  const CompareProduct({
    required this.productId,
    required this.productName,
    required this.productImage,
    required this.productPrice,
    required this.categoryId,
    required this.attributes,
    required this.models,
  });

  // สเปคที่แสดงของช่องหนึ่ง = ค่าร่วม แล้วให้ค่าเฉพาะโมเดลเขียนทับ
  Map<String, String> attributesFor(String? modelId) {
    if (modelId == null) return attributes;
    final model = modelById(modelId);
    if (model == null) return attributes;
    return {...attributes, ...model.attributes};
  }

  // หาโมเดลตามรหัส
  CompareModel? modelById(String? modelId) {
    for (final model in models) {
      if (model.modelId == modelId) return model;
    }
    return null;
  }

  factory CompareProduct.fromJson(Map<String, dynamic> json) {
    return CompareProduct(
      productId: json['product_id'].toString(),
      productName: json['product_name']?.toString() ?? '',
      productImage: json['product_image']?.toString(),
      productPrice: (json['product_price'] as num?) ?? 0,
      categoryId: json['category']?['category_id']?.toString(),
      attributes: parseAttributes(json['product_attribute_value']),
      models: ((json['product_model'] as List?) ?? const [])
          .map((row) => CompareModel.fromJson(row as Map<String, dynamic>))
          .toList(),
    );
  }
}

// โมเดล 1 ตัว: ราคาของตัวเอง + สเปคที่เขียนทับ
class CompareModel {
  final String modelId;
  final String modelName;
  final num productPrice;
  final Map<String, String> attributes;

  const CompareModel({
    required this.modelId,
    required this.modelName,
    required this.productPrice,
    required this.attributes,
  });

  factory CompareModel.fromJson(Map<String, dynamic> json) => CompareModel(
    modelId: json['model_id'].toString(),
    modelName: json['model_name']?.toString() ?? '',
    productPrice: (json['product_price'] as num?) ?? 0,
    attributes: parseAttributes(json['product_attribute_value']),
  );
}

// product_attribute_value → map ชื่อหัวข้อ → ค่า
Map<String, String> parseAttributes(Object? raw) {
  final values = (raw as List?) ?? const [];
  final attributes = <String, String>{};
  for (final row in values) {
    final map = row as Map<String, dynamic>;
    final name = map['attribute']?['attribute_name']?.toString();
    final value = map['value']?.toString().trim();
    if (name == null || value == null || value.isEmpty) continue;
    // หัวข้อซ้ำเอาแถวแรกที่มีค่า
    attributes.putIfAbsent(name, () => value);
  }
  return attributes;
}
