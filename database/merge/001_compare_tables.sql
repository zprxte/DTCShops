-- =====================================================================
-- 001 — ตารางสเปคสำหรับระบบค้นหา/เปรียบเทียบ (จำเป็น)
-- =====================================================================
-- ระบบนี้เก็บสเปคแบบ EAV: หัวข้อ (tbl_attribute) + ค่าของแต่ละสินค้า (tbl_attribute_value)
-- ค่าที่ model_code ว่าง = ใช้ร่วมทุกโมเดล · ไม่ว่าง = ค่าเฉพาะโมเดลนั้น (ทับค่าร่วม)
--
-- dump ของระบบจริงที่ได้มา (database/dtcshops_db.sql) **ไม่มี** สองตารางนี้
-- ถ้า DB จริงมีอยู่แล้ว สคริปต์นี้จะข้ามการสร้างตาราง แล้วเพิ่มเฉพาะส่วนที่ขาด
-- (คอลัมน์ model_code / index / foreign key) — รันซ้ำได้ ไม่ลบหรือแก้ข้อมูลเดิม
--
-- ต้องมีก่อน: tbl_item (PK itm_code), tbl_item_model (PK itm_model_code)
-- ทดสอบแล้วกับโครงสร้างจาก dtcshops_db.sql บน PostgreSQL 18 (28 ก.ย. 2026)
-- รัน: psql -v ON_ERROR_STOP=1 -d <db> -f 001_compare_tables.sql
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.tbl_attribute (
    attribute_code serial PRIMARY KEY,
    attribute_name character varying(100) NOT NULL,
    flag character varying(2) DEFAULT '1',
    ist_dt timestamp without time zone,
    mdf_dt timestamp without time zone,
    rm_dt timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.tbl_attribute_value (
    id serial PRIMARY KEY,
    itm_code character varying(50) NOT NULL,
    attribute_code integer NOT NULL,
    value character varying(255) NOT NULL,
    flag character varying(2) DEFAULT '1',
    ist_dt timestamp without time zone,
    mdf_dt timestamp without time zone,
    rm_dt timestamp without time zone
);

-- สเปคเฉพาะโมเดล — คอลัมน์ที่ระบบนี้เพิ่มเอง
ALTER TABLE public.tbl_attribute_value
    ADD COLUMN IF NOT EXISTS model_code character varying(50);

CREATE INDEX IF NOT EXISTS idx_tbl_attribute_value_itm_code ON public.tbl_attribute_value (itm_code);
CREATE INDEX IF NOT EXISTS idx_tbl_attribute_value_model_code ON public.tbl_attribute_value (model_code);

-- foreign key (ADD CONSTRAINT ไม่มี IF NOT EXISTS จึงเช็กชื่อก่อน)
-- ลบสินค้าที่ยังมีสเปคไม่ได้ (RESTRICT) — ระบบลบสินค้าแบบ soft (itm_flag = '0') อยู่แล้ว
-- ลบโมเดล = ลบสเปคเฉพาะโมเดลนั้นตามไปด้วย (CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tbl_attribute_value_attribute_code_fkey') THEN
    ALTER TABLE public.tbl_attribute_value ADD CONSTRAINT tbl_attribute_value_attribute_code_fkey
      FOREIGN KEY (attribute_code) REFERENCES public.tbl_attribute(attribute_code) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tbl_attribute_value_itm_code_fkey') THEN
    ALTER TABLE public.tbl_attribute_value ADD CONSTRAINT tbl_attribute_value_itm_code_fkey
      FOREIGN KEY (itm_code) REFERENCES public.tbl_item(itm_code) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tbl_attribute_value_model_code_fkey') THEN
    ALTER TABLE public.tbl_attribute_value ADD CONSTRAINT tbl_attribute_value_model_code_fkey
      FOREIGN KEY (model_code) REFERENCES public.tbl_item_model(itm_model_code) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
