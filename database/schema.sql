-- =====================================================================
-- Product Search & Comparison System — Database Schema
-- =====================================================================
-- ⚠️ 2026-09-01: SCHEMA REPLACED WHOLESALE — this project now runs on a
-- read-only subset of the REAL dtcshops.com production database (restored
-- from a pg_dump the user provided from a sibling project's DB container,
-- `compare-product-dtc-db`) instead of the custom-built Product/Category/
-- Attribute schema this file used to define. See CLAUDE.md's Database
-- Schema section for the full decision trail.
--
-- Scope of this swap (per explicit user confirmation):
--   - Public side (search + compare table) reads this real data directly.
--   - Admin side is a UI-only mockup — forms exist but never write here.
--   - Only NON-sensitive product-catalog tables were imported: tbl_item,
--     tbl_item_type, tbl_item_model, tbl_attribute, tbl_attribute_value.
--     tbl_users / tbl_order / tbl_order_item / tbl_refunds / tbl_logs
--     (real customer PII, password hashes, order history) were NEVER
--     brought into this project — left behind in the source DB entirely.
--   - This project's own analytics tables (Search_log, Compare_log,
--     Product_view_log, Compare_item) are dropped outright — no admin
--     backend left to write them, and the user asked to cut them rather
--     than keep porting them to reference itm_code.
--   - Table/column names below are kept EXACTLY as in the real production
--     DB (snake_case, itm_ prefixes) — not renamed to match this
--     project's old PascalCase convention — so this stays a straight,
--     auditable mirror of the source.
--
-- ⚠️ 2026-09-04: the standalone "Admin" table above (custom-made for this
-- project, not part of dtcshops.com's real schema) was dropped. Admin login
-- (bcrypt + JWT) now authenticates directly against tbl_users instead — the
-- real dtcshops.com accounts table, restored from the production dump (see
-- CLAUDE.md's real-production-schema-copy note; it only ever held 2 rows,
-- both admin accounts, no customer PII). One row's password was reset to
-- the project's known dev credential for local testing — see auth.js.
-- =====================================================================

-- ===== Product catalog (mirrors dtcshops.com production, read-only) =====

CREATE TABLE tbl_item_type (
    itm_type_code      VARCHAR(50) PRIMARY KEY,
    itm_type_desc      VARCHAR(100),
    itm_type_flag      VARCHAR(2) DEFAULT '1',
    itm_type_end_point VARCHAR(200),
    itm_type_tooltip   VARCHAR(200),
    itm_type_seo       VARCHAR(255),
    ist_dt             TIMESTAMPTZ,
    mdf_dt             TIMESTAMPTZ,
    rm_dt              TIMESTAMPTZ,
    thumbnail          VARCHAR(250),
    itm_type_slug      VARCHAR(250),
    slug               VARCHAR(100),
    canonical_url      VARCHAR(255)
);

CREATE TABLE tbl_item (
    itm_code             VARCHAR(50) PRIMARY KEY,
    itm_no               VARCHAR,
    itm_desc             VARCHAR NOT NULL,
    itm_flag             VARCHAR NOT NULL DEFAULT '1',   -- '1' = published/active, '0' = draft/hidden
    itm_shopee_end_point VARCHAR,
    itm_lazada_end_point VARCHAR,
    itm_tiktok_end_point VARCHAR,
    itm_line_end_point   VARCHAR,
    itm_tooltip          VARCHAR,
    itm_information      TEXT,
    itm_seo              VARCHAR,
    itm_lowest_price     REAL NOT NULL,
    itm_highest_price    REAL NOT NULL,
    itm_price            REAL NOT NULL DEFAULT 0,
    itm_image_master     VARCHAR,   -- relative storage path, e.g. "2024-12/xxx.png" — no public base URL known yet, frontend shows a placeholder
    itm_image_sub1       VARCHAR,
    itm_image_sub2       VARCHAR,
    itm_image_sub3       VARCHAR,
    itm_image_sub4       VARCHAR,
    itm_image_sub5       VARCHAR,
    itm_image_sub6       VARCHAR,
    itm_image_sub7       VARCHAR,
    itm_image_sub8       VARCHAR,
    itm_image_sub9       VARCHAR,
    itm_video_master     VARCHAR,
    ist_dt                 TIMESTAMP,
    mdf_dt                 TIMESTAMP,
    rm_dt                  TIMESTAMP,
    pb_dt                  TIMESTAMP,
    exp_dt                 TIMESTAMP,
    itm_model_code       VARCHAR(500),   -- comma-separated list of tbl_item_model.itm_model_code — NOT a normalized join (tbl_item_model_products exists in the source but is empty; the real relation lives here as CSV, so the backend parses this directly instead of importing that junction table)
    itm_tags             VARCHAR(255),
    itm_type_code        VARCHAR(50) REFERENCES tbl_item_type(itm_type_code) ON UPDATE CASCADE ON DELETE SET NULL,
    slug                 VARCHAR(100),
    itm_option_code      VARCHAR(500),
    itm_sku               VARCHAR(50),
    itm_guarantee         VARCHAR(250),
    itm_shipping          VARCHAR(250),
    itm_sold              INTEGER DEFAULT 0,
    itm_qty               INTEGER DEFAULT 0,
    view                   INTEGER NOT NULL DEFAULT 0,
    canonical_url          VARCHAR(255),
    seo_title              VARCHAR,
    seo_desc               VARCHAR
);

CREATE TABLE tbl_item_model (
    id                     SERIAL,
    itm_model_code         VARCHAR(50) PRIMARY KEY,
    itm_model_desc         VARCHAR(100),
    itm_model_flag         VARCHAR(2) DEFAULT '1',
    itm_model_addon_price  REAL DEFAULT 0,
    ist_dt                 TIMESTAMP,
    mdf_dt                 TIMESTAMP,
    rm_dt                  TIMESTAMP,
    qty                    INTEGER NOT NULL DEFAULT 0
);

-- ตัวเลือกสินค้า / อุปกรณ์เสริม (accessory add-on) — ผูกกับสินค้าผ่าน
-- tbl_item.itm_option_code (คอมม่าคั่น) ใช้ร่วมกันได้หลายสินค้า
-- หมายเหตุ: ของจริงจาก dtcshops.com ไม่มี PRIMARY KEY บนตารางนี้ — เพิ่มเองเมื่อ
-- 2026-09-09 บนสำเนานี้ (itm_option_code ไม่ซ้ำกันอยู่แล้วทั้ง 13 แถว) เพราะ Prisma
-- ต้องมีคีย์ระบุแถวถึงจะ map model ให้ได้
-- (ตารางที่ restore มาจาก dump ไม่มี sequence/default ของ id ติดมาด้วย ต้องสร้างเอง
--  ด้วย CREATE SEQUENCE + ALTER COLUMN id SET DEFAULT — ทำไปแล้วบน DB ตัวนี้
--  2026-09-09; ไฟล์นี้ใช้ SERIAL อยู่แล้วจึงไม่มีปัญหาเวลาสร้าง DB ใหม่จากศูนย์)
CREATE TABLE tbl_item_option (
    id                      SERIAL,
    itm_option_code         VARCHAR(50) PRIMARY KEY,
    itm_option_desc         VARCHAR(100),
    itm_option_flag         VARCHAR(2) DEFAULT '1',
    itm_option_addon_price  REAL DEFAULT 0,
    ist_dt                  TIMESTAMP,
    mdf_dt                  TIMESTAMP,
    rm_dt                   TIMESTAMP,
    qty                     INTEGER DEFAULT 0
);

CREATE TABLE tbl_attribute (
    attribute_code  SERIAL PRIMARY KEY,
    attribute_name  VARCHAR(100) NOT NULL,
    flag            VARCHAR(2) DEFAULT '1',
    ist_dt          TIMESTAMP,
    mdf_dt          TIMESTAMP,
    rm_dt           TIMESTAMP
);

CREATE TABLE tbl_attribute_value (
    id              SERIAL PRIMARY KEY,
    itm_code        VARCHAR(50) NOT NULL REFERENCES tbl_item(itm_code) ON UPDATE CASCADE ON DELETE RESTRICT,
    attribute_code  INTEGER NOT NULL REFERENCES tbl_attribute(attribute_code) ON UPDATE CASCADE ON DELETE RESTRICT,
    value           VARCHAR(255) NOT NULL,
    flag            VARCHAR(2) DEFAULT '1',
    ist_dt          TIMESTAMP,
    mdf_dt          TIMESTAMP,
    rm_dt           TIMESTAMP
);

CREATE INDEX idx_tbl_item_type_code ON tbl_item(itm_type_code);
-- Index ตามรูปแบบ query ที่ใช้จริง (Week 15 — database query optimization):
-- (itm_flag, ist_dt) = รายการสินค้าค่าเริ่มต้น, (itm_flag, itm_price) = เรียงตามราคา,
-- slug = เปิดหน้าสินค้าจาก URL, itm_sku = เช็ค SKU ซ้ำตอนบันทึกสินค้า
CREATE INDEX tbl_item_itm_flag_ist_dt_idx    ON tbl_item(itm_flag, ist_dt);
CREATE INDEX tbl_item_itm_flag_itm_price_idx ON tbl_item(itm_flag, itm_price);
CREATE INDEX tbl_item_slug_idx               ON tbl_item(slug);
CREATE INDEX tbl_item_itm_sku_idx            ON tbl_item(itm_sku);
CREATE INDEX idx_tbl_attribute_value_itm_code ON tbl_attribute_value(itm_code);

-- Added 2026-09-02 — the site footer's real CMS table, restored from the
-- same dtcshops.com production dump as the tables above (verified via
-- pg_restore -l on database/dtcshops_db.sql; needs a pg_restore >= 17 to
-- read this dump's archive format, this project's own db container ships
-- an older one). `type` picks the row's shape: text/link/image/head/
-- social/social-footer. `sub_type` further tags social rows by platform.
-- `sequence` orders rows within their own type; `flag`='1' = active. See
-- backend/src/routes/footer.js for how it's assembled into one response.
CREATE TABLE tbl_footer (
    id         SERIAL PRIMARY KEY,
    title      VARCHAR(255),
    type       VARCHAR(25) DEFAULT '"text"',
    url        VARCHAR(255),
    image      VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP,
    head_title VARCHAR(255),
    name       VARCHAR(255),
    sequence   INTEGER,
    flag       VARCHAR(2) DEFAULT '1' NOT NULL,
    sub_type   VARCHAR(50)
);

INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (1, '63 ซอยสุขุมวิท 68 ถนนสุขุมวิท แขวงบางนาเหนือ เขตบางนา กรุงเทพฯ 10260', 'text', '', NULL, '2025-03-03 15:47:53', '2025-03-03 15:47:53', NULL, '', 'ที่อยู่', 2, '1', NULL);
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (3, '02-744-7667', 'head', '', NULL, '2025-03-03 15:51:18', '2025-03-03 15:51:18', NULL, 'fax', 'แฟกซ์', 4, '1', NULL);
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (10, 'บริษัท ดี.ที.ซี. เอ็นเตอร์ไพรส์ จำกัด (มหาชน)', 'text', '', NULL, '2025-03-03 15:27:30', '2025-03-03 15:47:13', NULL, '', 'ชื่อบริษัท', 1, '1', NULL);
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (11, 'หน้าแรก', 'link', 'https://dtcshops.com/', NULL, '2025-03-04 11:30:15', '2025-03-04 11:30:15', NULL, '', 'หน้าแรก', 1, '1', NULL);
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (12, 'สินค้าทั้งหมด', 'link', 'https://dtcshops.com/products', NULL, '2025-03-04 11:30:33', '2025-03-04 11:30:33', NULL, '', 'สินค้าทั้งหมด', 2, '1', NULL);
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (13, 'บทความ', 'link', 'https://dtcshops.com/article', NULL, '2025-03-04 11:30:58', '2025-03-04 11:30:58', NULL, '', 'บทความ', 3, '1', NULL);
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (5, 'ได้รับการรับรองระบบ มาตรฐาน ISO9001:2015', 'image', '', '/uploads/products/2025-03/1741071562905-48710555.png', '2025-03-03 16:01:54', '2025-03-04 14:59:22', NULL, '', 'ISO9001:2015', 1, '1', NULL);
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (19, 'icon', 'social-footer', 'https://www.facebook.com/DTCGPSIoT/', '/uploads/products/2025-04/1744278315488-833329369.png', '2025-04-10 17:45:15', '2025-04-10 17:45:15', NULL, '', 'Facebook Icon Footer', 1, '1', 'facebook');
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (6, 'ได้รับการรับรองระบบ มาตรฐาน IATF16949:2016', 'image', '', '/uploads/products/2025-03/1741071600295-667771049.png', '2025-03-03 16:03:41', '2025-03-04 15:00:00', NULL, '', 'IATF16949:2016', 2, '1', NULL);
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (7, 'ได้รับการรับรองมาตรฐานระบบคุณภาพ ISO/IEC 29110-4-2 : 2021', 'image', '', '/uploads/products/2025-03/1741071615275-341796477.png', '2025-03-03 16:04:47', '2025-03-04 15:00:15', NULL, '', 'ISO/IEC 29110-4-2 : 2021', 3, '1', NULL);
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (20, 'icon', 'social-footer', 'https://lin.ee/jvZrF4N', '/uploads/products/2025-04/1744278356767-724688504.png', '2025-04-10 17:45:56', '2025-04-10 17:45:56', NULL, '', 'Line Icon Footer', 2, '1', 'line');
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (8, 'ได้รับการรับรองมาตรฐานระบบคุณภาพ ISO/IEC 27001 : 2022', 'image', '', '/uploads/products/2025-03/1741071630898-557897806.png', '2025-03-03 16:05:12', '2025-03-04 15:00:30', NULL, '', 'ISO/IEC 27001 : 2022', 4, '1', NULL);
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (9, 'ได้รับการรับรองมาตรฐานระบบคุณภาพ ISO/IEC 27701 : 2019', 'image', '', '/uploads/products/2025-03/1741071649113-64424568.png', '2025-03-03 16:05:39', '2025-03-04 15:00:49', NULL, '', 'ISO/IEC 27701 : 2019', 5, '1', NULL);
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (21, 'icon', 'social-footer', 'https://www.youtube.com/channel/UCVep-OhGvkXx4HyX_N3v00Q', '/uploads/products/2025-04/1744278507205-528181237.png', '2025-04-10 17:48:27', '2025-04-10 17:48:27', NULL, '', 'Youtube Icon Footer', 3, '1', 'youtube');
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (2, '1176 (24 ชั่วโมง)', 'head', '', NULL, '2025-03-03 15:50:45', '2025-04-10 10:38:47', NULL, 'tel', 'โทร', 3, '1', NULL);
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (4, '<a href="mailto:info@dtc.co.th" target="blank">info@dtc.co.th</a>', 'head', '', NULL, '2025-03-03 15:51:43', '2025-04-10 10:40:00', NULL, 'email', 'อีเมล', 5, '1', NULL);
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (17, '1176', 'social', 'facetime://1176', '/uploads/products/2025-04/1744278029466-581019251.png', '2025-04-10 17:40:29', '2025-04-10 18:01:17', NULL, '', 'Call Center', 3, '1', 'phone');
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (18, 'into@dtc.co.th', 'social', 'mailto:info@dtc.co.th', '/uploads/products/2025-04/1744278066519-644796790.png', '2025-04-10 17:41:06', '2025-04-10 18:01:48', NULL, '', 'E-Mail', 4, '1', 'email');
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (14, '1176 (24 ชั่วโมง) แฟกซ์ : 02-744-7667 Email : info@dtc.co.th', 'text', '', NULL, '2025-04-10 10:34:22', '2026-06-11 11:31:11', NULL, '', 'ข้อมูลติดต่อ Footer', 6, '1', '');
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (15, '@dtcgps_iot', 'social', 'https://page.line.me/?accountId=dtcgps_iot', '/uploads/products/2025-04/1744276404518-464397827.png', '2025-04-10 10:45:27', '2025-04-10 17:33:07', NULL, '', 'Line', 1, '1', 'line');
INSERT INTO tbl_footer (id, title, type, url, image, created_at, updated_at, deleted_at, head_title, name, sequence, flag, sub_type) VALUES (16, 'DTCGPSIot', 'social', 'https://www.messenger.com/t/412960925426416/?messaging_source=source%3Apages%3Amessage_shortlink&source_id=1441792&recurring_notification=0', '/uploads/products/2025-04/1744277979064-525396591.png', '2025-04-10 17:39:39', '2025-04-10 17:39:39', NULL, '', 'Facebook', 2, '1', 'facebook');
SELECT setval('tbl_footer_id_seq', 21, true);

-- Added 2026-09-03 — admin sections mirroring the reference back-office's
-- own sidebar 1:1 (see database/schema.prisma's matching comment). Real
-- rows come from database/restore-full-dump.sh, not seeded here (same
-- pattern as tbl_item etc.) — these tables originally had NO primary key
-- or unique constraint at all in the restored dump; added here since every
-- admin CRUD route needs a reliable target for UPDATE/DELETE.

CREATE TABLE tbl_articles (
    id            SERIAL PRIMARY KEY,
    code          VARCHAR(25) UNIQUE NOT NULL,
    title         VARCHAR(250),
    sub_title     VARCHAR(250),
    description   TEXT,
    tags          VARCHAR(250),
    seo_title     VARCHAR(250),
    seo_desc      VARCHAR(500),
    thumbnail     VARCHAR(250),
    flag          VARCHAR(2) DEFAULT '1',
    publish_date  TIMESTAMP,
    end_date      TIMESTAMP,
    created_at    TIMESTAMP,
    updated_at    TIMESTAMP,
    deleted_at    TIMESTAMP,
    view          INTEGER DEFAULT 0,
    slug          VARCHAR(250) NOT NULL,
    canonical_url VARCHAR(255)
);

CREATE TABLE tbl_shop (
    id            SERIAL PRIMARY KEY,
    shop_id       VARCHAR(50) UNIQUE NOT NULL,
    shop_name     VARCHAR(100),
    address       VARCHAR(255),
    road          VARCHAR(250),
    province      VARCHAR(100),
    district      VARCHAR(100),
    sub_district  VARCHAR(100),
    postcode      VARCHAR(5),
    lat           VARCHAR(50),
    lon           VARCHAR(50),
    tel           VARCHAR(50),
    thumbnail     VARCHAR(250),
    slug          VARCHAR(250),
    canonical_url VARCHAR(255),
    flag          VARCHAR(1) DEFAULT '1',
    ist_dt        TIMESTAMP,
    mdf_dt        TIMESTAMP,
    rm_dt         TIMESTAMP
);

CREATE TABLE tbl_bnn_slide (
    bnn_slide_code        VARCHAR(50) PRIMARY KEY,
    bnn_slide_index       INTEGER DEFAULT 1,
    bnn_slide_desc        VARCHAR(100),
    bnn_slide_information VARCHAR(200),
    bnn_slide_flag        VARCHAR(2) DEFAULT '1',
    bnn_slide_end_point   VARCHAR(200),
    bnn_slide_tooltip     VARCHAR(200),
    bnn_image_master      VARCHAR(200),
    bnn_slide_seo         VARCHAR(255),
    ist_dt                TIMESTAMP,
    mdf_dt                TIMESTAMP,
    rm_dt                 TIMESTAMP,
    pb_dt                 TIMESTAMP,
    exp_dt                TIMESTAMP
);

CREATE TABLE tbl_promotion (
    id             SERIAL PRIMARY KEY,
    p_code         VARCHAR(50) UNIQUE NOT NULL,
    p_name         VARCHAR(250),
    p_slug         VARCHAR(250),
    p_desc         TEXT,
    thumbnail      VARCHAR(250),
    thumbnail_rtg  VARCHAR(100),
    p_flag         CHAR(1) DEFAULT '1',
    publish_date   TIMESTAMP,
    end_date       TIMESTAMP,
    ist_dt         TIMESTAMP,
    mdf_dt         TIMESTAMP,
    rm_dt          TIMESTAMP,
    discount_mode  VARCHAR(50) DEFAULT 'price',
    discount_value INTEGER DEFAULT 0,
    sort_by        VARCHAR(25) DEFAULT '1',
    url_end_point  VARCHAR(250),
    canonical_url  VARCHAR(255)
);

CREATE TABLE tbl_page (
    page_code      VARCHAR(50) PRIMARY KEY,
    page_desc      VARCHAR(100),
    page_flag      VARCHAR(2) DEFAULT '1',
    page_title     VARCHAR(255),
    page_meta_desc VARCHAR(255),
    ist_dt         TIMESTAMPTZ,
    mdf_dt         TIMESTAMPTZ,
    rm_dt          TIMESTAMPTZ,
    page_header1   VARCHAR(255),
    view           INTEGER DEFAULT 0,
    banner_master  VARCHAR(250),
    flag_header    VARCHAR(2) DEFAULT '1',
    canonical_url  VARCHAR(255)
);

-- ===== Activity log =====
-- 2026-09-08: tbl_logs IS in this project's DB after all — the header note
-- above (written 2026-09-01, when only the catalog tables were imported)
-- is out of date: the full production dump was restored on 2026-09-02, and
-- tbl_logs came with it (39,395 real rows through 2026-08-03). It powers the
-- admin dashboard's view stats, and the public site now appends to it too.
--
-- The three ALTERs below are LOCAL-COPY-ONLY additions — production ships
-- this table with no primary key and no id default, so inserting a row was
-- impossible without picking an id by hand.
CREATE TABLE tbl_logs (
    id         SERIAL PRIMARY KEY,             -- production: plain INTEGER, no PK, no default
    user_id    VARCHAR(25),
    message    VARCHAR(250),
    created_at TIMESTAMP DEFAULT now(),        -- production: no default
    type       VARCHAR(50),                    -- view | login | logout | insert | update | delete
    page       VARCHAR(100)                    -- free-form bucket: 'pge-XXXXXXX' | 'product-single' | 'article-single' | 'all'
);

CREATE INDEX idx_tbl_logs_type_created ON tbl_logs (type, created_at);
