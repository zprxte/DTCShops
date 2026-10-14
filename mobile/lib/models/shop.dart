// สาขา DTC Shop 1 แห่ง (GET /shops)
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
      // jsonDecode อาจได้ int ถ้าค่าลงตัว จึงแปลงเป็น double
      lat: (json['lat'] as num?)?.toDouble() ?? 0,
      lon: (json['lon'] as num?)?.toDouble() ?? 0,
    );
  }
}
