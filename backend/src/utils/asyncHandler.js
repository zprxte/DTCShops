// ห่อ route async ให้ error ไปถึงตัวจัดการ error กลาง
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)
module.exports = asyncHandler