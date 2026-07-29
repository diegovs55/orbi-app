/**
 * GET /api/admin/intelligence/offer
 *
 * Resumen de oferta disponible de la red ORBI.
 * Solo lectura. Solo negocios con status = 'activo'.
 * Toda agregación ocurre en servidor — el cliente no descarga filas crudas.
 *
 * Autenticación: Bearer token de admin (mismo patrón que otros endpoints admin).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin, assertAdminJWT } from "@/lib/supabase-admin";

export type OfferBusiness = {
  id: string;
  name: string;
  zone: string;
  category: string;
  productCount: number;
  priceMin: number | null;
  priceMax: number | null;
  priceAvg: number | null;
  lastProductUpdate: string | null;
  businessUpdatedAt: string;
};

export type OfferSummary = {
  businesses: OfferBusiness[];
  totals: {
    businesses: number;
    products: number;
    zones: number;
    sectors: number;
  };
};

export async function GET(req: NextRequest) {
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

  // Fetch active businesses
  const { data: bizData, error: bizErr } = await admin
    .from("businesses")
    .select("id,name,zone,category,updated_at")
    .eq("status", "activo")
    .order("name", { ascending: true });

  if (bizErr) return NextResponse.json({ error: bizErr.message }, { status: 500 });

  const businesses = (bizData ?? []) as Array<{
    id: string; name: string; zone: string; category: string; updated_at: string;
  }>;

  if (businesses.length === 0) {
    return NextResponse.json({
      businesses: [],
      totals: { businesses: 0, products: 0, zones: 0, sectors: 0 },
    } satisfies OfferSummary);
  }

  const bizIds = businesses.map((b) => b.id);

  // Fetch all products for active businesses in one query
  const { data: prodData, error: prodErr } = await admin
    .from("products")
    .select("id,business_id,price,updated_at")
    .in("business_id", bizIds)
    .eq("status", "disponible")
    .eq("available", true);

  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

  const products = (prodData ?? []) as Array<{
    id: string; business_id: string; price: number; updated_at: string;
  }>;

  // Aggregate per business
  const prodsByBiz = new Map<string, typeof products>();
  for (const p of products) {
    if (!prodsByBiz.has(p.business_id)) prodsByBiz.set(p.business_id, []);
    prodsByBiz.get(p.business_id)!.push(p);
  }

  const result: OfferBusiness[] = businesses.map((b) => {
    const prods = prodsByBiz.get(b.id) ?? [];
    const prices = prods.map((p) => p.price).filter((x) => typeof x === "number" && isFinite(x));
    const lastUpdate = prods.length > 0
      ? prods.reduce((max, p) => p.updated_at > max ? p.updated_at : max, prods[0].updated_at)
      : null;

    return {
      id: b.id,
      name: b.name,
      zone: b.zone ?? "",
      category: b.category ?? "",
      productCount: prods.length,
      priceMin: prices.length > 0 ? Math.min(...prices) : null,
      priceMax: prices.length > 0 ? Math.max(...prices) : null,
      priceAvg: prices.length > 0
        ? Math.round((prices.reduce((s, p) => s + p, 0) / prices.length) * 100) / 100
        : null,
      lastProductUpdate: lastUpdate,
      businessUpdatedAt: b.updated_at,
    };
  });

  const uniqueZones = new Set(businesses.map((b) => (b.zone ?? "").trim()).filter(Boolean));
  const uniqueSectors = new Set(businesses.map((b) => (b.category ?? "").trim()).filter(Boolean));

  return NextResponse.json({
    businesses: result,
    totals: {
      businesses: businesses.length,
      products: products.length,
      zones: uniqueZones.size,
      sectors: uniqueSectors.size,
    },
  } satisfies OfferSummary);
}
