"use client";

import { Building2, Coffee, Hammer, Package, Pill, Printer, ScrollText, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BusinessSector,
  CatalogBusiness,
  CatalogProduct,
  businessSectors,
  getLiveCatalogBusinesses,
  getLiveCatalogProducts
} from "@/lib/catalog";
import { subscribeToBusinesses, subscribeToProducts } from "@/lib/supabase";

const sectorMeta: Record<BusinessSector, { description: string; icon: typeof Coffee }> = {
  "Alimentos y bebidas": {
    description: "Café, comida, snacks y productos listos para poner en ruta.",
    icon: Coffee
  },
  Farmacia: {
    description: "Medicamentos y artículos urgentes con coordinación local.",
    icon: Pill
  },
  Papelería: {
    description: "Copias, impresiones y útiles cuando los necesitas.",
    icon: Printer
  },
  Ferretería: {
    description: "Herramientas, refacciones y soluciones rápidas de casa.",
    icon: Hammer
  },
  Tecnología: {
    description: "Accesorios, soporte y soluciones digitales locales.",
    icon: ShoppingBag
  },
  Servicios: {
    description: "Servicios locales conectados a la red Orbi.",
    icon: Package
  },
  Mandados: {
    description: "Compras, vueltas y gestiones coordinadas por Orbi.",
    icon: ScrollText
  },
  Transporte: {
    description: "Traslados y movilidad local conectada a la red.",
    icon: Package
  },
  Otro: {
    description: "Aliados locales que amplían la red.",
    icon: Building2
  }
};

export function AffiliatedBusinesses() {
  const [businesses, setBusinesses] = useState<CatalogBusiness[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    Promise.all([getLiveCatalogBusinesses(), getLiveCatalogProducts()])
      .then(([nextBusinesses, nextProducts]) => {
        if (!isActive) {
          return;
        }

        const activeBusinesses = nextBusinesses
          .filter((business) => business.status === "activo");
        const activeBusinessIds = new Set(activeBusinesses.map((business) => business.id));

        setBusinesses(activeBusinesses);
        setProducts(
          nextProducts.filter(
            (product) =>
              product.available &&
              product.status === "disponible" &&
              activeBusinessIds.has(product.businessId)
          )
        );
        setError("");
      })
      .catch((caughtError: unknown) => {
        if (!isActive) {
          return;
        }

        setBusinesses([]);
        setProducts([]);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No fue posible cargar los sectores de Orbi."
        );
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    return subscribeToBusinesses(() => {
      let isActive = true;

      Promise.all([getLiveCatalogBusinesses(), getLiveCatalogProducts()])
        .then(([nextBusinesses, nextProducts]) => {
          if (!isActive) {
            return;
          }

          const activeBusinesses = nextBusinesses.filter((business) => business.status === "activo");
          const activeBusinessIds = new Set(activeBusinesses.map((business) => business.id));

          setBusinesses(activeBusinesses);
          setProducts(
            nextProducts.filter(
              (product) =>
                product.available &&
                product.status === "disponible" &&
                activeBusinessIds.has(product.businessId)
            )
          );
          setError("");
        })
        .catch(() => {
          if (!isActive) {
            return;
          }

          setBusinesses([]);
          setProducts([]);
          setError("No fue posible cargar los sectores de Orbi.");
        });

      return () => {
        isActive = false;
      };
    });
  }, []);

  useEffect(() => {
    return subscribeToProducts(() => {
      let isActive = true;

      Promise.all([getLiveCatalogBusinesses(), getLiveCatalogProducts()])
        .then(([nextBusinesses, nextProducts]) => {
          if (!isActive) {
            return;
          }

          const activeBusinesses = nextBusinesses.filter((business) => business.status === "activo");
          const activeBusinessIds = new Set(activeBusinesses.map((business) => business.id));

          setBusinesses(activeBusinesses);
          setProducts(
            nextProducts.filter(
              (product) =>
                product.available &&
                product.status === "disponible" &&
                activeBusinessIds.has(product.businessId)
            )
          );
          setError("");
        })
        .catch(() => {
          if (!isActive) {
            return;
          }

          setBusinesses([]);
          setProducts([]);
          setError("No fue posible cargar los sectores de Orbi.");
        });

      return () => {
        isActive = false;
      };
    });
  }, []);

  const sectors = useMemo(() => {
    return businessSectors
      .map((sector) => ({
        sector,
        businesses: businesses.filter((business) => business.category === sector),
        products: products.filter((product) => product.sector === sector)
      }))
      .filter(({ businesses }) => businesses.length);
  }, [businesses, products]);

  if (isLoading) {
    return <StateCard title="Cargando red local..." body="Estamos consultando sectores, negocios y productos activos." />;
  }

  if (error) {
    return <StateCard title="No pudimos cargar negocios." body={error} tone="error" />;
  }

  if (!sectors.length) {
    return (
      <StateCard
        title="Aún no hay negocios afiliados registrados."
        body="Pronto podrás ver aquí los aliados activos de Red Orbi."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {sectors.map(({ sector, businesses, products }) => {
        const Icon = sectorMeta[sector].icon;

        return (
          <article
            key={sector}
            className="group rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:border-orbi-cyan/35"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                  {businesses.length} activos
                </span>
                <h2 className="text-xl font-black tracking-normal text-orbi-text">{sector}</h2>
                <p className="mt-2 text-sm leading-6 text-orbi-muted">
                  {sectorMeta[sector].description}
                </p>
              </div>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan shadow-[0_0_22px_rgba(31,139,255,0.12)]">
                <Icon aria-hidden="true" className="h-6 w-6" />
              </span>
            </div>

            <div className="space-y-3 border-t border-white/10 pt-4">
              {businesses.map((business) => (
                <BusinessRow
                  key={business.id}
                  business={business}
                  products={products.filter((product) => product.businessId === business.id)}
                />
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function BusinessRow({
  business,
  products
}: {
  business: CatalogBusiness;
  products: CatalogProduct[];
}) {
  return (
    <div className="rounded-md border border-orbi-cyan/12 bg-white/[0.04] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black leading-tight text-orbi-text">{business.name}</h3>
          <p className="mt-1 text-xs leading-5 text-orbi-muted">
            {business.category} · {business.zone}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-200">
          {business.status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <InfoBox label="Zona" value={business.zone} />
        <InfoBox label="Rating calculado" value={formatBusinessRating(business.rating)} />
        <InfoBox label="Horario" value={business.availability || "Por confirmar"} />
      </div>

      {products.length ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-orbi-cyan">
            Productos destacados
          </p>
          {products.slice(0, 3).map((product) => (
            <div key={product.id} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-orbi-black/25 px-3 py-2 text-xs">
              <span className="font-semibold text-orbi-text">{product.name}</span>
              <span className="font-black text-orbi-cyan">${product.price}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-white/10 bg-orbi-black/25 px-3 py-2 text-xs font-semibold text-orbi-muted">
          Sin productos todavía
        </p>
      )}
    </div>
  );
}

function formatBusinessRating(rating: number | null) {
  if (rating == null) return "Sin calificaciones";
  const numericRating = Number(rating);
  return Number.isFinite(numericRating) ? `⭐ ${numericRating.toFixed(1)}` : "Sin calificaciones";
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-orbi-black/30 px-3 py-2">
      <p className="font-semibold text-orbi-muted">{label}</p>
      <p className="mt-1 font-black text-orbi-text">{value}</p>
    </div>
  );
}

function StateCard({
  title,
  body,
  tone = "default"
}: {
  title: string;
  body: string;
  tone?: "default" | "error";
}) {
  return (
    <div className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-6 text-center shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] backdrop-blur sm:p-10">
      <div
        className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border shadow-[0_0_24px_rgba(31,139,255,0.14)] ${
          tone === "error"
            ? "border-red-300/20 bg-red-400/10 text-red-200"
            : "border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan"
        }`}
      >
        <Building2 aria-hidden="true" className="h-7 w-7" />
      </div>
      <h2 className="text-2xl font-black tracking-normal text-orbi-text">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-orbi-muted sm:text-base">
        {body}
      </p>
    </div>
  );
}
