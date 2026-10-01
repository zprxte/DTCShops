set -e

NETWORK="product-compare-app_default"
DB_CONTAINER="product_compare_db"
DUMP_DIR="$(cd "$(dirname "$0")" && pwd)"

# tbl_item_feature/tbl_item_model_products (2026-09-02) และ tbl_item_type_feature (2026-09-09)
# ถูกตัดออกจากลิสต์นี้แล้ว —
# restore มารอบแรกแล้วพบว่าว่างเปล่าทั้งหมด (0 แถว) และไม่มี route/model ไหนอ้างอิงเลย
# จึง DROP TABLE ทิ้งไปตามคำขอผู้ใช้ — รันสคริปต์นี้ซ้ำจะไม่สร้างสามตัวนี้กลับมาอีก
TABLES="tbl_articles tbl_bnn_slide tbl_item_config tbl_item_option tbl_logs tbl_model tbl_order tbl_order_item tbl_page tbl_promotion tbl_promotion_item tbl_refunds tbl_shop tbl_users"

TFLAGS=""
for t in $TABLES; do TFLAGS="$TFLAGS -t $t"; done

docker run --rm --network "$NETWORK" \
  -v "$DUMP_DIR:/data" \
  -e PGPASSWORD=postgres123 \
  postgres:17 pg_restore -h "$DB_CONTAINER" -U postgres -d product_compare \
    --no-owner --no-privileges $TFLAGS /data/dtcshops_db.sql

# ดัมป์เก็บ path รูปเป็นของเซิร์ฟเวอร์เว็บต้นแบบ (ทั้งแบบ URL เต็มและ path สั้น
# "YYYY-MM/ไฟล์") ซึ่งทำให้เบราว์เซอร์ไปดึงรูปจากเซิร์ฟเวอร์เขาโดยตรง — เน็ตหลุดหรือ
# เขาลบไฟล์เมื่อไหร่รูปก็หาย จึงต้อง localize ทันทีหลัง restore ทุกครั้ง
# (ตารางที่ได้รับผลกระทบในลิสต์ข้างบน: tbl_shop, tbl_bnn_slide)
echo ""
echo "Localizing image paths..."
node "$DUMP_DIR/localize-images.js"

echo "Done. Verify with: docker exec $DB_CONTAINER psql -U postgres -d product_compare -c '\\dt'"
