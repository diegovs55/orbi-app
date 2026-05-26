"use client";

import { Building2, Coffee, Gift, Pill, Printer, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  AffiliateBusiness,
  BusinessCategory,
  businessCategories,
  getBusinesses
} from "@/lib/businesses";

const categoryMeta: Record<
  BusinessCategory,
  {
    description: string;
    icon: typeof Coffee;
  }
> = {
  "Café y comida": {
    description: "Pide desayuno, café o snacks sin salir de casa.",
    icon: Coffee
  },
  Farmacia: {
    description: "Medicamentos y artículos urgentes entregados rápido.",
    icon: Pill
  },
  Papelería: {
    description: "Copias, impresiones y útiles cuando los necesitas.",
    icon: Printer
  },
  Regalos: {
    description: "Flores, detalles y sorpresas en ruta.",
    icon: Gift
  },
  Mandados: {
    description: "Compras, pagos y vueltas coordinadas por Orbi.",
    icon: ShoppingBag
  }
};

export function AffiliatedBusinesses() {
  const [businesses, setBusinesses] = useState<AffiliateBusiness[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    getBusinesses()
      .then((nextBusinesses) => {
        if (!isActive) {
          return;
        }

        setBusinesses(nextBusinesses);
        setError("");
      })
      .catch((caughtError: unknown) => {
        if (!isActive) {
          return;
        }

        setBusinesses([]);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No fue posible cargar los negocios afiliados."
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

  const businessesByCategory = useMemo(() => {
    return businessCategories
      .map((category) => ({
        category,
        businesses: businesses.filter((business) => business.category === category)
      }))
      .filter(({ businesses }) => businesses.length > 0);
  }, [businesses]);

  if (isLoading) {
    return <StateCard title="Cargando negocios afiliados..." body="Estamos consultando la red activa de Orbi." />;
  }

  if (error) {
    return <StateCard title="No pudimos cargar los negocios." body={error} tone="error" />;
  }

  if (!businesses.length) {
    return (
      <StateCard
        title="Aún no hay negocios afiliados registrados."
        body="Pronto podrás ver aquí los aliados activos de Red Orbi."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {businessesByCategory.map(({ category, businesses }) => {
        const Icon = categoryMeta[category].icon;
        const availableCount = businesses.filter(
          (business) => business.status === "Disponible"
        ).length;

        return (
          <article
            key={category}
            className="group rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:border-orbi-cyan/35 hover:shadow-[0_24px_70px_rgba(0,0,0,0.34),0_0_38px_rgba(31,139,255,0.16)]"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                  {availableCount} disponibles
                </span>
                <h2 className="text-xl font-black tracking-normal text-orbi-text">{category}</h2>
                <p className="mt-2 text-sm leading-6 text-orbi-muted">
                  {categoryMeta[category].description}
                </p>
              </div>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan shadow-[0_0_22px_rgba(31,139,255,0.12)] transition group-hover:bg-orbi-blue/22">
                <Icon aria-hidden="true" className="h-6 w-6" />
              </span>
            </div>

            <div className="space-y-3 border-t border-white/10 pt-4">
              {businesses.map((business) => (
                <BusinessRow key={business.id} business={business} />
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function BusinessRow({ business }: { business: AffiliateBusiness }) {
  const isAvailable = business.status === "Disponible";

  return (
    <div className="rounded-md border border-orbi-cyan/12 bg-white/[0.04] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black leading-tight text-orbi-text">{business.name}</h3>
          <p className="mt-1 text-xs leading-5 text-orbi-muted">{business.description}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
            isAvailable
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
              : "border-white/10 bg-white/5 text-orbi-muted"
          }`}
        >
          {business.status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-white/10 bg-orbi-black/30 px-3 py-2">
          <p className="font-semibold text-orbi-muted">Tiempo</p>
          <p className="mt-1 font-black text-orbi-text">{business.estimatedTime}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-orbi-black/30 px-3 py-2">
          <p className="font-semibold text-orbi-muted">Rating</p>
          <p className="mt-1 font-black text-orbi-text">⭐ {business.rating}</p>
        </div>
      </div>
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
