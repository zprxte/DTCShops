// Turns a product_name into a URL-friendly slug, e.g. "Hikvision K2" -> "hikvision-k2".
// No DB schema change / new field involved — this is derived on the fly from
// the existing product_name every time it's needed. Only ASCII letters/digits
// are kept — Thai (or any other non-Latin) text is stripped out entirely
// rather than kept in the URL.
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ⚠️ 2026-09-02: production already had a real, unique, human-readable
// `slug` column filled in for every active item (e.g.
// "hikvision-dash-card-k5") — the URL uses that now instead of the bare
// itm_code, and the backend resolves either one on GET /api/products/:id
// (see products.js), so an old itm_code link keeps working too. Falls back
// to the raw product_id only for the rare product with no slug set (the
// admin form auto-fills one from the name on save, but a very old/odd
// record could still be missing it).
export function productSlug(product: { product_id: string; product_name: string; slug?: string | null }): string {
  return product.slug || product.product_id
}
