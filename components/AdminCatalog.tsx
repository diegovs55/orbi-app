"use client";

import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { PackagePlus, Plus, Store } from "lucide-react";
import {
  BusinessSector,
  CatalogBusiness,
  CatalogProduct,
  businessSectors,
  createCatalogBusiness,
  createCatalogProduct,
  getCatalogBusinesses,
  getCatalogProducts
} from "@/lib/catalog";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

export function AdminCatalog() {
  const isUnlocked = useSyncExternalStore(subscribeToAdminSession, readAdminSession, () => false);
  const [businesses, setBusinesses] = useState<CatalogBusiness[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [businessError, setBusinessError] = useState("");
  const [productError, setProductError] = useState("");
  const [isSavingBusiness, setIsSavingBusiness] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  useEffect(() => {
    let isActive = true;

    Promise.allSettled([getCatalogBusinesses(), getCatalogProducts()]).then(([businessResult, productResult]) => {
      if (!isActive) {
        return;
      }

      if (businessResult.status === "fulfilled") {
        setBusinesses(businessResult.value);
      }

      if (productResult.status === "fulfilled") {
        setProducts(productResult.value);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  const activeBusinesses = useMemo(
    () => businesses.filter((business) => business.status === "activo"),
    [businesses]
  );

  async function handleSaveBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const category = String(data.get("category")) as BusinessSector;
    const zone = String(data.get("zone") ?? "").trim();
    const baseText = String(data.get("baseText") ?? "").trim();
    const lat = parseOptionalNumber(data.get("lat"));
    const lng = parseOptionalNumber(data.get("lng"));

    if (!name || !zone || !baseText || lat === null || lng === null) {
      setBusinessError("Completa nombre, zona, dirección/base y coordenadas del negocio.");
      return;
    }

    setIsSavingBusiness(true);
    setBusinessError("");

    try {
      const business = await createCatalogBusiness({
        name,
        category,
        zone,
        baseText,
        phone: String(data.get("phone") ?? "").trim(),
        lat,
        lng,
        status: String(data.get("status") ?? "activo") as "activo" | "inactivo",
        estimatedTime: String(data.get("estimatedTime") ?? "15-25 min").trim() || "15-25 min",
        rating: String(data.get("rating") ?? "4.8").trim() || "4.8"
      });
      setBusinesses((currentBusinesses) => [business, ...currentBusinesses]);
      form.reset();
    } catch (caughtError) {
      setBusinessError(
        caughtError instanceof Error ? caughtError.message : "No fue posible guardar el negocio."
      );
    } finally {
      setIsSavingBusiness(false);
    }
  }

  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const businessId = String(data.get("businessId") ?? "");
    const business = businesses.find((item) => item.id === businessId);
    const name = String(data.get("name") ?? "").trim();

    if (!business || !name) {
      setProductError("Selecciona un negocio y escribe el producto o servicio.");
      return;
    }

    setIsSavingProduct(true);
    setProductError("");

    try {
      const product = await createCatalogProduct({
        businessId: business.id,
        businessName: business.name,
        businessZone: business.zone,
        businessBaseText: business.baseText,
        businessLat: business.lat,
        businessLng: business.lng,
        sector: business.category,
        name,
        description: String(data.get("description") ?? "").trim(),
        category: String(data.get("category") ?? "").trim() || business.category,
        price: parseOptionalNumber(data.get("price")) ?? 0,
        available: data.get("available") === "on",
        availability: String(data.get("availability") ?? "").trim(),
        searchTags: String(data.get("searchTags") ?? "").trim()
      });
      setProducts((currentProducts) => [product, ...currentProducts]);
      form.reset();
    } catch (caughtError) {
      setProductError(
        caughtError instanceof Error ? caughtError.message : "No fue posible guardar el producto."
      );
    } finally {
      setIsSavingProduct(false);
    }
  }

  if (!isUnlocked) {
    return null;
  }

  return (
    <section className="space-y-5">
      <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
            <PackagePlus aria-hidden="true" className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-black text-orbi-text">Catálogo de negocios y productos</h2>
            <p className="mt-1 text-xs text-orbi-muted">
              Inventario operativo para búsqueda, misiones y trazabilidad futura en Supabase.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={handleSaveBusiness} className="grid gap-4 rounded-md border border-orbi-cyan/15 bg-orbi-panel/72 p-5 shadow-soft">
          <h3 className="text-base font-black text-orbi-text">Alta de negocio</h3>
          <AdminInput label="Nombre del negocio" name="name" placeholder="Regina Café" />
          <label className="block text-sm font-semibold text-orbi-text">
            Categoría de negocio
            <select name="category" className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none">
              {businessSectors.map((sector) => (
                <option key={sector} value={sector}>{sector}</option>
              ))}
            </select>
          </label>
          <AdminInput label="Zona" name="zone" placeholder="Centro" />
          <AdminInput label="Dirección/base" name="baseText" placeholder="Ubicación registrada del negocio" />
          <AdminInput label="Teléfono" name="phone" placeholder="5255..." required={false} />
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminInput label="Ubicación lat" name="lat" placeholder="18.8349" required={false} />
            <AdminInput label="Ubicación lng" name="lng" placeholder="-99.5818" required={false} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <AdminInput label="Tiempo estimado" name="estimatedTime" placeholder="15-25 min" required={false} />
            <AdminInput label="Rating" name="rating" placeholder="4.8" required={false} />
            <label className="block text-sm font-semibold text-orbi-text">
              Estado
              <select name="status" className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none">
                <option value="activo">activo</option>
                <option value="inactivo">inactivo</option>
              </select>
            </label>
          </div>
          {businessError ? <ErrorText>{businessError}</ErrorText> : null}
          <button type="submit" disabled={isSavingBusiness} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow">
            <Plus aria-hidden="true" className="h-5 w-5" />
            {isSavingBusiness ? "Guardando..." : "Guardar negocio de catálogo"}
          </button>
        </form>

        <form onSubmit={handleSaveProduct} className="grid gap-4 rounded-md border border-orbi-cyan/15 bg-orbi-panel/72 p-5 shadow-soft">
          <h3 className="text-base font-black text-orbi-text">Alta de producto o servicio</h3>
          <label className="block text-sm font-semibold text-orbi-text">
            Negocio
            <select name="businessId" className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none">
              <option value="">Selecciona negocio</option>
              {activeBusinesses.map((business) => (
                <option key={business.id} value={business.id}>{business.name}</option>
              ))}
            </select>
          </label>
          <AdminInput label="Nombre del producto" name="name" placeholder="Frappe moka" />
          <AdminInput label="Descripción" name="description" placeholder="Bebida fría preparada al momento" required={false} />
          <AdminInput label="Categoría producto" name="category" placeholder="Bebidas frías" required={false} />
          <AdminInput label="Precio venta" name="price" placeholder="65" required={false} />
          <AdminInput label="Horario disponible" name="availability" placeholder="08:00 - 20:00" required={false} />
          <AdminInput label="Etiquetas búsqueda" name="searchTags" placeholder="frappe café moka bebida" required={false} />
          <label className="flex items-center gap-2 text-sm font-semibold text-orbi-text">
            <input type="checkbox" name="available" defaultChecked className="h-4 w-4 accent-orbi-blue" />
            Disponible
          </label>
          {productError ? <ErrorText>{productError}</ErrorText> : null}
          <button type="submit" disabled={isSavingProduct} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow">
            <Plus aria-hidden="true" className="h-5 w-5" />
            {isSavingProduct ? "Guardando..." : "Guardar producto"}
          </button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CatalogList title="Negocios activos" items={businesses.map((business) => ({
          id: business.id,
          title: business.name,
          meta: `${business.category} · ${business.zone}`,
          detail: `${business.estimatedTime} · ⭐ ${business.rating} · ${business.status}`
        }))} />
        <CatalogList title="Productos y servicios" items={products.map((product) => ({
          id: product.id,
          title: product.name,
          meta: `${product.businessName} · ${product.sector}`,
          detail: `$${product.price} · ${product.category} · ${product.available ? "Disponible" : "No disponible"}`
        }))} />
      </div>
    </section>
  );
}

function CatalogList({
  title,
  items
}: {
  title: string;
  items: Array<{ id: string; title: string; meta: string; detail: string }>;
}) {
  return (
    <section className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
      <div className="mb-4 flex items-center gap-2 text-orbi-cyan">
        <Store aria-hidden="true" className="h-4 w-4" />
        <h3 className="text-sm font-black text-orbi-text">{title}</h3>
      </div>
      <div className="space-y-2">
        {items.slice(0, 8).map((item) => (
          <article key={item.id} className="rounded-md border border-white/10 bg-orbi-black/25 p-3">
            <p className="font-bold text-orbi-text">{item.title}</p>
            <p className="mt-1 text-xs font-semibold text-orbi-cyan">{item.meta}</p>
            <p className="mt-1 text-xs text-orbi-muted">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminInput({
  label,
  name,
  placeholder,
  required = true
}: {
  label: string;
  name: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
        name={name}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

function ErrorText({ children }: { children: string }) {
  return (
    <p className="rounded-md border border-red-300/15 bg-red-400/10 p-3 text-sm font-semibold text-red-200">
      {children}
    </p>
  );
}

function parseOptionalNumber(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function readAdminSession() {
  return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
}

function subscribeToAdminSession(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("orbi-admin-session-change", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("orbi-admin-session-change", callback);
  };
}
