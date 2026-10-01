class Category {
  final String categoryId;
  final String categoryName;
  final String? categoryImage;

  const Category({
    required this.categoryId,
    required this.categoryName,
    required this.categoryImage,
  });

  factory Category.fromJson(Map<String, dynamic> json) {
    return Category(
      categoryId: json['category_id'] as String,
      categoryName: json['category_name'] as String,
      categoryImage: json['sample_image'] as String?,
    );
  }
}
