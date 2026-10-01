-- =====================================================================
-- 002 — index สำหรับความเร็ว (ไม่บังคับ แต่แนะนำ)
-- =====================================================================
-- ตัวกรอง/เรียงหน้ารายการสินค้า, หา slug ของหน้าสินค้า, และนับยอดเข้าชม
-- (sort=popular / แดชบอร์ด) — ไม่เปลี่ยนข้อมูล รันซ้ำได้
-- ตารางใหญ่บน production ให้เปลี่ยนเป็น CREATE INDEX CONCURRENTLY แล้วรันนอก transaction
-- =====================================================================
CREATE INDEX IF NOT EXISTS tbl_item_itm_flag_ist_dt_idx ON public.tbl_item (itm_flag, ist_dt);
CREATE INDEX IF NOT EXISTS tbl_item_itm_flag_itm_price_idx ON public.tbl_item (itm_flag, itm_price);
CREATE INDEX IF NOT EXISTS tbl_item_itm_sku_idx ON public.tbl_item (itm_sku);
CREATE INDEX IF NOT EXISTS tbl_item_slug_idx ON public.tbl_item (slug);
CREATE INDEX IF NOT EXISTS idx_tbl_item_type_code ON public.tbl_item (itm_type_code);
CREATE INDEX IF NOT EXISTS idx_tbl_logs_type_created ON public.tbl_logs (type, created_at);
