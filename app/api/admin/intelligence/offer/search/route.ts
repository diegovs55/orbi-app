/**
 * GET /api/admin/intelligence/offer/search?q=&limit=&offset=
 *
 * Búsqueda paginada server-side sobre productos de negocios activos.
 * Busca por nombre de producto, nombre de negocio, categoría o zona.
 * Solo lectura. Toda agregación en servidor.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin, assertAdminJWT } from "@/lib/supabase-admin";

export type SearchResultItem = {
  productId: string;
  productName: string;
  productCategory: string;
  price: number;
  status: string;
  businessId: string;
  businessName: string;
  businessZone: string;
  businessCategory: string;
};

export type SearchResponse = {
  results: SearchResultItem[];
  total: number;
  query: string;
};

export async function GET(req: NextRequest) {
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10), 1), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

  if (!q) {
    return NextResponse.json({ results: [], total: 0, query: "" } satisfies SearchResponse);
  }

  // Fetch active businesses first (small table, 2 rows currently)
  const { data: bizData, error: bizErr } = await admin
    .from("businesses")
    .select("id,name,zone,category")
    .eq("status", "activo");

  if (bizErr) return NextResponse.json({ error: bizErr.message }, { status: 500 });

  const businesses = (bizData ?? []) as Array<{
    id: string; name: string; zone: string; category: string;
  }>;

  if (businesses.length === 0) {
    return NextResponse.json({ results: [], total: 0, query: q } satisfies SearchResponse);
  }

  const term = `%${q}%`;
  const bizIds = businesses.map((b) => b.id);

  // Search products of active businesses — ILIKE on name and category
  // Business-level filters (name, zone) applied in-memory after join since
  // Supabase REST doesn't support cross-table ILIKE in a single query.
  const { data: prodData, error: prodErr } = await admin
    .from("products")
    .select("id,name,category,price,status,business_id")
    .in("business_id", bizIds)
    .or(`name.ilike.${term},category.ilike.${term}`);

  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

  const prods = (prodData ?? []) as Array<{
    id: string; name: string; category: string; price: number; status: string; business_id: string;
  }>;

  const bizById = new Map(businesses.map((b) => [b.id, b]));
  const ql = q.toLowerCase();

  // Collect matching products: already matched by product name/category ILIKE,
  // OR match because their business name/zone matches the query
  const matched: SearchResultItem[] = [];

  // First pass: products matched by name or category (already from query)
  const prodMatchIds = new Set(prods.map((p) => p.id));
  for (const p of prods) {
    const biz = bizById.get(p.business_id);
    if (!biz) continue;
    matched.push({
      productId: p.id,
      productName: p.name,
      productCategory: p.category ?? "",
      price: p.price,
      status: p.status,
      businessId: biz.id,
      businessName: biz.name,
      businessZone: biz.zone ?? "",
      businessCategory: biz.category ?? "",
    });
  }

  // Second pass: products not yet matched whose business matches name or zone
  const bizMatches = businesses.filter(
    (b) =>
      b.name.toLowerCase().includes(ql) ||
      (b.zone ?? "").toLowerCase().includes(ql) ||
      (b.category ?? "").toLowerCase().includes(ql),
  );

  if (bizMatches.length > 0) {
    const bizMatchIds = new Set(bizMatches.map((b) => b.id));

    // Fetch all products of those businesses not already in results
    const { data: extraProds, error: extraErr } = await admin
      .from("products")
      .select("id,name,category,price,status,business_id")
      .in("business_id", Array.from(bizMatchIds));

    if (!extraErr && extraProds) {
      for (const p of extraProds as typeof prods) {
        if (prodMatchIds.has(p.id)) continue; // already included
        const biz = bizById.get(p.business_id);
        if (!biz) continue;
        matched.push({
          productId: p.id,
          productName: p.name,
          productCategory: p.category ?? "",
          price: p.price,
          status: p.status,
          businessId: biz.id,
          businessName: biz.name,
          businessZone: biz.zone ?? "",
          businessCategory: biz.category ?? "",
        });
      }
    }
  }

  const total = matched.length;
  const page = matched
    .sort((a, b) => a.businessName.localeCompare(b.businessName) || a.productName.localeCompare(b.productName))
    .slice(offset, offset + limit);

  return NextResponse.json({ results: page, total, query: q } satisfies SearchResponse);
}
