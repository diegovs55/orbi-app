"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { adminFetch } from "@/lib/admin-fetch";
import type { OfferSummary, OfferBusiness } from "@/app/api/admin/intelligence/offer/route";
import type { SearchResponse } from "@/app/api/admin/intelligence/offer/search/route";

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("es-MX", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-center">
      <p className="text-xl font-black tabular-nums text-orbi-text">{value}</p>
      <p className="mt-0.5 text-[11px] text-orbi-muted">{label}</p>
    </div>
  );
}

function BusinessCard({ biz }: { biz: OfferBusiness }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-black text-orbi-text">{biz.name}</p>
          <p className="mt-0.5 text-xs text-orbi-muted">
            {biz.zone || "Zona no definida"} · {biz.category || "Categoría no definida"}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-orbi-cyan/20 bg-orbi-blue/10 px-2.5 py-0.5 text-xs font-bold text-orbi-cyan">
          {biz.productCount} productos
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-orbi-muted">Precio mín.</p>
          <p className="mt-0.5 font-bold tabular-nums text-orbi-text">{fmtPrice(biz.priceMin)}</p>
        </div>
        <div>
          <p className="text-orbi-muted">Precio máx.</p>
          <p className="mt-0.5 font-bold tabular-nums text-orbi-text">{fmtPrice(biz.priceMax)}</p>
        </div>
        <div>
          <p className="text-orbi-muted">Precio prom.</p>
          <p className="mt-0.5 font-bold tabular-nums text-orbi-text">{fmtPrice(biz.priceAvg)}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-orbi-muted">
        Último producto actualizado: {fmtDate(biz.lastProductUpdate)}
      </p>
    </div>
  );
}

export function AdminIntelligenceOffer() {
  const [summary, setSummary] = useState<OfferSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await adminFetch("/api/admin/intelligence/offer");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Error ${res.status}`);
        return;
      }
      const data = (await res.json()) as OfferSummary;
      setSummary(data);
    } catch {
      setError("No fue posible cargar el resumen de oferta.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setSearchResults(null);
      setSearchError("");
      return;
    }
    setIsSearching(true);
    setSearchError("");
    try {
      const res = await adminFetch(
        `/api/admin/intelligence/offer/search?q=${encodeURIComponent(trimmed)}&limit=50`,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSearchError(body.error ?? `Error ${res.status}`);
        setSearchResults(null);
        return;
      }
      const data = (await res.json()) as SearchResponse;
      setSearchResults(data);
    } catch {
      setSearchError("Error al buscar.");
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearchError("");
      return;
    }
    const timer = setTimeout(() => void runSearch(query), 350);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const showSearch = query.trim().length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-orbi-text">Oferta disponible</h3>
            <p className="mt-0.5 text-xs text-orbi-muted">
              Productos activos y disponibles en negocios de la red. Solo lectura.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSummary()}
            disabled={isLoading}
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15 disabled:opacity-60"
          >
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Cargando..." : "Refrescar"}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error ? (
        <p className="rounded-md border border-red-300/15 bg-red-400/10 p-4 text-sm font-semibold text-red-200">
          {error}
        </p>
      ) : null}

      {/* Totals */}
      {!isLoading && summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatPill label="Negocios activos" value={fmt(summary.totals.businesses)} />
          <StatPill label="Productos disponibles" value={fmt(summary.totals.products)} />
          <StatPill label="Zonas" value={fmt(summary.totals.zones)} />
          <StatPill label="Sectores" value={fmt(summary.totals.sectors)} />
        </div>
      ) : null}

      {/* Search */}
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orbi-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por producto, negocio, categoría o zona…"
          className="w-full rounded-md border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-4 text-sm text-orbi-text placeholder-orbi-muted focus:border-orbi-cyan/30 focus:outline-none"
        />
      </div>

      {/* Search results */}
      {showSearch ? (
        <div>
          {isSearching ? (
            <p className="text-sm text-orbi-muted">Buscando…</p>
          ) : searchError ? (
            <p className="text-sm font-semibold text-red-200">{searchError}</p>
          ) : searchResults ? (
            searchResults.results.length === 0 ? (
              <p className="text-sm text-orbi-muted">
                Sin resultados para &ldquo;{searchResults.query}&rdquo;.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-orbi-muted">
                  {searchResults.total} resultado{searchResults.total !== 1 ? "s" : ""} para &ldquo;
                  {searchResults.query}&rdquo;
                </p>
                <div className="overflow-x-auto rounded-md border border-white/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.03]">
                        <th className="px-3 py-2 text-left text-xs font-bold text-orbi-muted">Producto</th>
                        <th className="px-3 py-2 text-left text-xs font-bold text-orbi-muted">Categoría</th>
                        <th className="px-3 py-2 text-right text-xs font-bold text-orbi-muted">Precio</th>
                        <th className="px-3 py-2 text-left text-xs font-bold text-orbi-muted">Negocio</th>
                        <th className="px-3 py-2 text-left text-xs font-bold text-orbi-muted">Zona</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {searchResults.results.map((r) => (
                        <tr key={r.productId} className="hover:bg-white/[0.02]">
                          <td className="px-3 py-2 font-medium text-orbi-text">{r.productName}</td>
                          <td className="px-3 py-2 text-orbi-muted">{r.productCategory.trim() || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-orbi-text">
                            {fmtPrice(r.price)}
                          </td>
                          <td className="px-3 py-2 text-orbi-muted">{r.businessName}</td>
                          <td className="px-3 py-2 text-orbi-muted">{r.businessZone || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {/* Business cards — only shown when no active search */}
      {!showSearch && !isLoading && summary ? (
        summary.businesses.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
            No hay negocios activos en la red.
          </p>
        ) : (
          <div className="space-y-3">
            {summary.businesses.map((biz) => (
              <BusinessCard key={biz.id} biz={biz} />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
