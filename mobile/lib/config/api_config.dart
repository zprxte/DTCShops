// ที่อยู่ backend (ตั้งผ่าน --dart-define=API_ORIGIN) + ต่อ origin ให้ path รูป /uploads/...
class ApiConfig {
  static const origin = String.fromEnvironment(
    'API_ORIGIN',
    defaultValue: 'http://10.0.2.2:4000',
  );
  static const baseUrl = '$origin/api';
  static String imageUrl(String? path) => path == null
      ? ''
      : (path.startsWith('http'))
      ? path
      : '$origin$path';
}
