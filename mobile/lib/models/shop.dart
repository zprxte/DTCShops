class Shop {
  final String shopId;
  final String shopName;
  final String? address;
  final String? tel;
  final String? image;
  final double lat;
  final double lon;

  const Shop({
    required this.shopId,
    required this.shopName,
    required this.address,
    required this.tel,
    required this.image,
    required this.lat,
    required this.lon,
  });

  factory Shop.fromJson(Map<String, dynamic> json) {
    return Shop(
      shopId: json['shop_id'] as String,
      shopName: json['shop_name'] as String,
      address: json['address'] as String?,
      tel: json['tel'] as String?,
      image: json['image'] as String?,
      // lat/lon ส่งมาเป็นตัวเลขทศนิยม แต่ jsonDecode อาจได้ int ถ้าค่าลงตัวพอดี
      lat: (json['lat'] as num?)?.toDouble() ?? 0,
      lon: (json['lon'] as num?)?.toDouble() ?? 0,
    );
  }
}
