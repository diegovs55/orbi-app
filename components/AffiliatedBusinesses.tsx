"use client";

import L from "leaflet";
import { Building2, Loader2, MapPin, Navigation, Search, ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import {
  CatalogBusiness,
  CatalogProduct,
  CatalogTerritorialResult,
  getLiveCatalogBusinesses,
  getLiveCatalogProducts,
  searchCatalog,
} from "@/lib/catalog";
import { haversineKm, getOrdinaryRadiusKm } from "@/lib/discovery";
import { geoGetCurrentPosition, geoIsAvailable } from "@/lib/geo";
import type { OrbitCenter } from "@/lib/orbit";
import { subscribeToBusinesses, subscribeToProducts } from "@/lib/supabase";

// ── Map icons ─────────────────────────────────────────────────────────────────

// Usuario / punto consultado — teardrop azul (mismo que NearbyOrbitsPreview)
const queryIcon = L.divIcon({
  className: "",
  html: `<svg width="20" height="28" viewBox="0 0 20 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 0C4.477 0 0 4.477 0 10c0 6.627 10 18 10 18S20 16.627 20 10C20 4.477 15.523 0 10 0z" fill="#eef7ff" stroke="#1f8bff" stroke-width="1.5"/>
    <circle cx="10" cy="10" r="4" fill="#1f8bff"/>
  </svg>`,
  iconAnchor: [10, 28],
  iconSize: [20, 28],
});

// Negocio — teardrop verde esmeralda.
// El pin representa la ubicación operativa pública declarada por el negocio.
const businessIcon = L.divIcon({
  className: "",
  html: `<svg width="22" height="30" viewBox="0 0 22 30" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11 0C5.477 0 1 4.477 1 10c0 6.627 10 20 10 20S21 16.627 21 10C21 4.477 16.523 0 11 0z" fill="#022c22" stroke="#10b981" stroke-width="1.5"/>
    <circle cx="11" cy="10" r="4" fill="#10b981"/>
  </svg>`,
  iconAnchor: [11, 30],
  iconSize: [22, 30],
});

// ── Map subcomponents ─────────────────────────────────────────────────────────

// Re-centra el mapa cuando el orbitCenter cambia, sin resetear el zoom del usuario.
function MapPanner({ center }: { center: [number, number] }) {
  const map = useMap();
  const prev = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (prev.current && prev.current[0] === center[0] && prev.current[1] === center[1]) return;
    prev.current = center;
    map.panTo(center);
  }, [map, center]);
  return null;
}

// Captura clics en el mapa para actualizar el punto consultado.
function ClickCatcher({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── Data helper ───────────────────────────────────────────────────────────────

async function fetchCatalog() {
  const [bs, ps] = await Promise.all([getLiveCatalogBusinesses(), getLiveCatalogProducts()]);
  const active = bs.filter((b) => b.status === "activo");
  const activeIds = new Set(active.map((b) => b.id));
  return {
    businesses: active,
    products: ps.filter(
      (p) => p.available && p.status === "disponible" && activeIds.has(p.businessId),
    ),
  };
}

// ── Text normalization ────────────────────────────────────────────────────────

// Normaliza texto para búsqueda: sin tildes, minúsculas, sin espacios extremos.
function normalizeBusinessSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Centro de respaldo cuando el GPS no está disponible y el usuario aún no eligió zona.
const FALLBACK_CENTER: [number, number] = [18.8349, -99.5818];

// ── Main component ────────────────────────────────────────────────────────────

export function AffiliatedBusinesses({ onOpenRequest }: { onOpenRequest?: () => void } = {}) {
  // Datos del catálogo
  const [businesses, setBusinesses] = useState<CatalogBusiness[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  // Estado de descubrimiento
  const [showMap, setShowMap] = useState(false);
  const [orbitCenter, setOrbitCenter] = useState<OrbitCenter | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Búsqueda textual — vacío = comportamiento BUSINESS-DISCOVERY-01 exacto
  const [textQuery, setTextQuery] = useState("");

  // Presentación progresiva de productos — límite visual, no altera productResults
  const [visibleProductCount, setVisibleProductCount] = useState(10);

  // Modal de detalle
  const [selectedBusiness, setSelectedBusiness] = useState<CatalogBusiness | null>(null);

  // Contexto de producto: se fija cuando el modal se abre desde un ProductResultRow.
  // Null cuando se abre desde un pin, tarjeta de negocio o "Ver detalles".
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // ── Carga inicial ───────────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true;
    fetchCatalog()
      .then(({ businesses: bs, products: ps }) => {
        if (!alive) return;
        setBusinesses(bs);
        setProducts(ps);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setDataError(e instanceof Error ? e.message : "No fue posible cargar los negocios.");
      })
      .finally(() => { if (alive) setDataLoading(false); });
    return () => { alive = false; };
  }, []);

  // ── Realtime — actualiza datos cuando cambian negocios o productos ───────────

  useEffect(() => {
    const reload = () => {
      void fetchCatalog().then(({ businesses: bs, products: ps }) => {
        setBusinesses(bs);
        setProducts(ps);
      });
    };
    const unsubB = subscribeToBusinesses(reload);
    const unsubP = subscribeToProducts(reload);
    return () => { unsubB(); unsubP(); };
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  // Actualiza el punto consultado desde clic en mapa o drag del marcador.
  const handlePick = useCallback((lat: number, lng: number) => {
    setOrbitCenter({ lat, lng, label: "Zona seleccionada", source: "manual" });
  }, []);

  // Solicita GPS y abre el mapa. En fallo, abre el mapa para elección manual.
  const handleGeolocate = useCallback(() => {
    if (!geoIsAvailable()) {
      setGeoError("Este dispositivo no soporta geolocalización. Elige una zona en el mapa.");
      setShowMap(true);
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    geoGetCurrentPosition(
      ({ coords }) => {
        setOrbitCenter({ lat: coords.latitude, lng: coords.longitude, label: "Mi ubicación", source: "gps_suggested" });
        setShowMap(true);
        setGeoLoading(false);
      },
      () => {
        setGeoLoading(false);
        setGeoError("No fue posible obtener tu ubicación. Elige una zona en el mapa.");
        setShowMap(true);
      },
      { timeout: 8000, enableHighAccuracy: true },
    );
  }, []);

  // Vuelve al estado inicial sin mapa. Limpia también la búsqueda textual y el contexto de producto.
  const handleClose = useCallback(() => {
    setShowMap(false);
    setOrbitCenter(null);
    setSelectedBusiness(null);
    setSelectedProductId(null);
    setGeoError(null);
    setTextQuery("");
    setVisibleProductCount(10);
  }, []);

  // ── Filtro territorial en memoria ────────────────────────────────────────────

  // Negocios territorialmente alcanzables según haversine + radio ordinario por sector.
  // Negocios sin lat/lng válidos se excluyen silenciosamente.
  const nearbyBusinesses = useMemo<CatalogBusiness[]>(() => {
    if (!orbitCenter) return [];
    return businesses.filter((b) => {
      if (b.lat == null || b.lng == null) return false;
      if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return false;
      const dist = haversineKm(b.lat, b.lng, orbitCenter.lat, orbitCenter.lng);
      return dist <= getOrdinaryRadiusKm(b.category);
    });
  }, [businesses, orbitCenter]);

  // ── Derivados de búsqueda ────────────────────────────────────────────────────

  const normalizedQuery = normalizeBusinessSearch(textQuery);

  // Negocios: filtro textual SOBRE nearbyBusinesses (nunca sobre el catálogo global).
  const filteredBusinesses = useMemo<CatalogBusiness[]>(() => {
    if (!normalizedQuery) return nearbyBusinesses;
    return nearbyBusinesses.filter((b) =>
      normalizeBusinessSearch(`${b.name} ${b.category} ${b.zone}`).includes(normalizedQuery),
    );
  }, [nearbyBusinesses, normalizedQuery]);

  // Productos: searchCatalog garantiza territorialidad idéntica a /pedir.
  // Solo se consumen ordinaryResults — expandedCandidates ignorados en esta fase.
  const productResults = useMemo<CatalogTerritorialResult[]>(() => {
    if (!normalizedQuery || !orbitCenter) return [];
    return searchCatalog(products, textQuery, orbitCenter).ordinaryResults;
  }, [products, textQuery, orbitCenter, normalizedQuery]);

  // Pins activos: con query vacío → todos nearbyBusinesses; con query → solo relacionados.
  const activePinIds = useMemo<Set<string> | null>(() => {
    if (!normalizedQuery) return null; // null = mostrar todos
    return new Set([
      ...filteredBusinesses.map((b) => b.id),
      ...productResults.map((r) => r.businessId),
    ]);
  }, [normalizedQuery, filteredBusinesses, productResults]);

  // Reset de presentación progresiva cuando cambia el contexto de búsqueda.
  useEffect(() => {
    setVisibleProductCount(10);
  }, [textQuery, orbitCenter]);

  // Slice visual — no altera productResults ni scoring ni territorialidad.
  const visibleProductResults = productResults.slice(0, visibleProductCount);

  // ── Estado inicial: sin mapa ─────────────────────────────────────────────────

  if (!showMap) {
    return (
      <div className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)] backdrop-blur">
        <p className="mt-2 text-sm text-orbi-muted">
          Productos y servicios cerca de ti
        </p>
        {dataLoading && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-orbi-muted">
            <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
            Cargando red local…
          </p>
        )}
        {dataError && <p className="mt-2 text-xs text-red-300">{dataError}</p>}
        {geoError && <p className="mt-2 text-xs text-red-300">{geoError}</p>}
        <div className="mt-4">
          <button
            type="button"
            onClick={handleGeolocate}
            disabled={geoLoading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white transition hover:bg-[#0f7af0] disabled:opacity-60"
          >
            {geoLoading ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin aria-hidden="true" className="h-4 w-4" />
            )}
            Explorar negocios
          </button>
        </div>
      </div>
    );
  }

  // ── Estado con mapa ──────────────────────────────────────────────────────────

  const mapCenter: [number, number] = orbitCenter
    ? [orbitCenter.lat, orbitCenter.lng]
    : FALLBACK_CENTER;

  const hasQuery = normalizedQuery.length > 0;
  const hasResults = filteredBusinesses.length > 0 || productResults.length > 0;

  return (
    <div className="overflow-hidden rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)] backdrop-blur">
      {/* Cabecera del mapa */}
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
            Negocios afiliados
          </p>
          {!orbitCenter && !geoLoading && (
            <p className="mt-1 text-xs text-orbi-muted">Toca el mapa para consultar una zona.</p>
          )}
          {geoLoading && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-orbi-muted">
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
              Obteniendo ubicación…
            </p>
          )}
          {!geoLoading && orbitCenter && (
            <p className="mt-1 text-sm font-semibold text-orbi-text">
              {nearbyBusinesses.length === 0
                ? "Sin negocios en esta zona"
                : nearbyBusinesses.length === 1
                  ? "1 negocio disponible"
                  : `${nearbyBusinesses.length} negocios disponibles`}
            </p>
          )}
          {geoError && <p className="mt-1 text-xs text-red-300">{geoError}</p>}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={handleGeolocate}
            disabled={geoLoading}
            aria-label="Usar mi ubicación"
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-orbi-muted transition hover:bg-white/10 disabled:opacity-60"
          >
            <Navigation aria-hidden="true" className="h-3.5 w-3.5" />
            Mi ubicación
          </button>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar exploración"
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-orbi-muted transition hover:bg-white/10"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
            Cerrar
          </button>
        </div>
      </div>

      {/* Mapa con pins */}
      <div className="relative h-64 w-full">
        <MapContainer
          center={mapCenter}
          zoom={13}
          className="h-full w-full"
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapPanner center={mapCenter} />
          <ClickCatcher onPick={handlePick} />

          {/* Punto consultado — arrastrable para cambiar zona */}
          {orbitCenter && (
            <Marker
              draggable
              eventHandlers={{
                dragend(e) {
                  const { lat, lng } = (e.target as L.Marker).getLatLng();
                  handlePick(lat, lng);
                },
              }}
              position={[orbitCenter.lat, orbitCenter.lng]}
              icon={queryIcon}
            />
          )}

          {/* Pins de negocios — todos cuando query vacío, solo relacionados cuando activo */}
          {nearbyBusinesses
            .filter((b) => !activePinIds || activePinIds.has(b.id))
            .map((b) => (
              <Marker
                key={b.id}
                position={[b.lat as number, b.lng as number]}
                icon={businessIcon}
                eventHandlers={{
                  click() {
                    setSelectedProductId(null);
                    setSelectedBusiness(b);
                  },
                }}
              />
            ))}
        </MapContainer>

        {/* Pista cuando aún no hay orbitCenter */}
        {!orbitCenter && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="rounded-md border border-orbi-cyan/25 bg-orbi-black/80 px-3 py-1.5 text-xs font-bold text-orbi-cyan backdrop-blur">
              Toca para elegir tu zona
            </span>
          </div>
        )}
      </div>

      {/* Barra de búsqueda — solo cuando hay orbitCenter */}
      {orbitCenter && (
        <div className="border-t border-white/[0.07] px-4 py-3">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-orbi-muted"
            />
            <input
              type="search"
              value={textQuery}
              onChange={(e) => setTextQuery(e.target.value)}
              placeholder="Negocio, categoría o producto..."
              className="w-full rounded-md border border-white/10 bg-white/[0.04] py-2 pl-8 pr-3 text-sm text-orbi-text placeholder:text-orbi-muted outline-none transition focus:border-orbi-cyan/40 focus:bg-white/[0.06]"
            />
          </div>
        </div>
      )}

      {/* Resultados */}
      {orbitCenter && (
        <div className="border-t border-white/[0.07] p-4">
          {!hasQuery ? (
            // ── Sin búsqueda: comportamiento idéntico a BUSINESS-DISCOVERY-01 ──
            nearbyBusinesses.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-sm font-semibold text-orbi-muted">
                  No hay negocios afiliados disponibles en esta zona.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {nearbyBusinesses.map((b) => (
                  <BusinessCompactRow
                    key={b.id}
                    business={b}
                    onDetails={() => { setSelectedProductId(null); setSelectedBusiness(b); }}
                  />
                ))}
              </div>
            )
          ) : hasResults ? (
            // ── Con búsqueda: secciones NEGOCIOS + PRODUCTOS ─────────────────
            <div className="space-y-4">
              {filteredBusinesses.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-orbi-cyan">
                    Negocios
                  </p>
                  <div className="space-y-2">
                    {filteredBusinesses.map((b) => (
                      <BusinessCompactRow
                        key={b.id}
                        business={b}
                        onDetails={() => { setSelectedProductId(null); setSelectedBusiness(b); }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {productResults.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-orbi-cyan">
                    Productos
                  </p>
                  <div className="space-y-2">
                    {visibleProductResults.map((r) => (
                      <ProductResultRow
                        key={r.id}
                        result={r}
                        onViewBusiness={() => {
                          setSelectedProductId(r.id);
                          setSelectedBusiness(businesses.find((b) => b.id === r.businessId) ?? null);
                        }}
                      />
                    ))}
                  </div>
                  {productResults.length > visibleProductCount && (
                    <button
                      type="button"
                      onClick={() => setVisibleProductCount((n) => n + 10)}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.04] py-2 text-xs font-bold text-orbi-muted transition hover:bg-white/10"
                    >
                      Mostrar 10 más
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            // ── Sin resultados ────────────────────────────────────────────────
            <div className="py-4 text-center">
              <p className="text-sm font-semibold text-orbi-muted">
                No encontramos &ldquo;{textQuery}&rdquo; en los negocios disponibles de esta zona.
              </p>
              {onOpenRequest && (
                <button
                  type="button"
                  onClick={onOpenRequest}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-orbi-cyan transition hover:underline"
                >
                  Solicitar alta como negocio →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de detalle */}
      {selectedBusiness && (
        <BusinessDetailModal
          business={selectedBusiness}
          products={products.filter(
            (p) =>
              p.businessId === selectedBusiness.id &&
              p.available &&
              p.status === "disponible",
          )}
          productId={selectedProductId ?? undefined}
          orbitCenter={orbitCenter}
          onClose={() => { setSelectedBusiness(null); setSelectedProductId(null); }}
        />
      )}
    </div>
  );
}

// ── Resultado compacto de negocio ─────────────────────────────────────────────

function BusinessCompactRow({
  business,
  onDetails,
}: {
  business: CatalogBusiness;
  onDetails: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-orbi-cyan/12 bg-white/[0.03] px-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300">
        <Building2 aria-hidden="true" className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-orbi-text">{business.name}</p>
        <p className="truncate text-xs text-orbi-muted">
          {business.category} · {business.zone}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-bold text-emerald-200 sm:inline">
          {business.status}
        </span>
        <button
          type="button"
          onClick={onDetails}
          className="inline-flex min-h-8 items-center justify-center rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-2.5 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
        >
          Ver detalles
        </button>
      </div>
    </div>
  );
}

// ── Resultado compacto de producto ────────────────────────────────────────────

function ProductResultRow({
  result,
  onViewBusiness,
}: {
  result: CatalogTerritorialResult;
  onViewBusiness: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-orbi-cyan/12 bg-white/[0.03] px-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] text-orbi-cyan">
        <ShoppingBag aria-hidden="true" className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-orbi-text">{result.name}</p>
        <p className="truncate text-xs text-orbi-muted">{result.businessName}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-black text-orbi-cyan text-xs">${result.price}</span>
        <button
          type="button"
          onClick={onViewBusiness}
          className="inline-flex min-h-8 items-center justify-center rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-2.5 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
        >
          Ver negocio
        </button>
      </div>
    </div>
  );
}

// ── Modal de detalle ──────────────────────────────────────────────────────────

function BusinessDetailModal({
  business,
  products,
  productId,
  orbitCenter,
  onClose,
}: {
  business: CatalogBusiness;
  products: CatalogProduct[];
  productId?: string;
  orbitCenter?: OrbitCenter | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[1200] flex items-end bg-orbi-black/75 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <section className="max-h-[92vh] w-full overflow-y-auto rounded-md border border-orbi-cyan/20 bg-orbi-panel p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_45px_rgba(31,139,255,0.16)] sm:max-w-lg sm:p-6">
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
              Información del negocio
            </p>
            <h2 className="mt-1 text-xl font-black text-orbi-text">{business.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-orbi-text transition hover:bg-white/10"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {/* Datos del negocio */}
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <InfoBox label="Categoría" value={business.category} />
          <InfoBox label="Estado" value={business.status} />
          <InfoBox label="Zona" value={business.zone} />
          <InfoBox label="Horario" value={business.availability || "Por confirmar"} />
          <InfoBox
            label="Rating"
            value={formatBusinessRating(business.rating)}
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* Productos destacados — misma lógica que BusinessRow original */}
        {products.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-orbi-cyan">
              Productos destacados
            </p>
            <div className="mt-2 space-y-2">
              {products.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-orbi-black/25 px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-orbi-text">{p.name}</span>
                  <span className="font-black text-orbi-cyan">${p.price}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-md border border-white/10 bg-orbi-black/25 px-3 py-2 text-xs font-semibold text-orbi-muted">
            Sin productos todavía
          </p>
        )}

        {/* Cierre / CTA */}
        {productId ? (
          <Link
            href={`/pedir?productId=${encodeURIComponent(productId)}${orbitCenter ? `&lat=${orbitCenter.lat}&lng=${orbitCenter.lng}&src=${encodeURIComponent(orbitCenter.source)}` : ""}`}
            className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white transition hover:bg-[#0f7af0]"
          >
            Agregar al pedido →
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-orbi-muted transition hover:bg-white/10"
          >
            Cerrar
          </button>
        )}
      </section>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function InfoBox({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-white/10 bg-orbi-black/30 px-3 py-2 ${className}`}>
      <p className="font-semibold text-orbi-muted">{label}</p>
      <p className="mt-1 font-black text-orbi-text">{value}</p>
    </div>
  );
}

function formatBusinessRating(rating: number | null): string {
  if (rating == null) return "Sin calificaciones";
  const n = Number(rating);
  return Number.isFinite(n) ? `⭐ ${n.toFixed(1)}` : "Sin calificaciones";
}
