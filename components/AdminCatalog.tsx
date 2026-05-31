"use client";

import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Edit3, LocateFixed, MapPin, PackagePlus, Plus, RotateCcw, Search, Store, Trash2, X } from "lucide-react";
import {
  BusinessSector,
  CatalogBusiness,
  CatalogProduct,
  CatalogProductStatus,
  ProductCategory,
  businessSectors,
  createCatalogBusiness,
  createCatalogProduct,
  deleteCatalogBusiness,
  deleteCatalogProduct,
  getCatalogBusinessesWithOptions,
  getCatalogProductsWithOptions,
  normalizeTimeToHHmm,
  productCategories,
  updateCatalogBusiness,
  updateCatalogProduct
} from "@/lib/catalog";
import { subscribeToBusinesses, subscribeToProducts } from "@/lib/supabase";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";
const zumpahuacanCenter = { lat: 18.8349, lng: -99.5818 };
const timeOptions = buildTimeOptions();

const LocationPickerMap = dynamic(
  () => import("@/components/LocationPickerMap").then((mod) => mod.LocationPickerMap),
  {
    loading: () => (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-orbi-black text-sm font-semibold text-orbi-muted">
        Cargando mapa...
      </div>
    ),
    ssr: false
  }
);

export function AdminCatalog() {
  const isUnlocked = useSyncExternalStore(subscribeToAdminSession, readAdminSession, () => false);
  const [businesses, setBusinesses] = useState<CatalogBusiness[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [businessError, setBusinessError] = useState("");
  const [productError, setProductError] = useState("");
  const [isSavingBusiness, setIsSavingBusiness] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [businessSearch, setBusinessSearch] = useState("");
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [businessLocationSearch, setBusinessLocationSearch] = useState("");
  const [businessLocationMessage, setBusinessLocationMessage] = useState("");
  const [businessLocation, setBusinessLocation] = useState<BusinessLocationState>({
    lat: null,
    lng: null,
    zone: "",
    baseText: ""
  });
  const [businessMapPoint, setBusinessMapPoint] = useState(zumpahuacanCenter);
  const [isBusinessMapOpen, setIsBusinessMapOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<CatalogBusiness | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [businessCategory, setBusinessCategory] = useState<BusinessSector>("Alimentos y bebidas");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessStatus, setBusinessStatus] = useState<"activo" | "inactivo">("activo");
  const [businessStart, setBusinessStart] = useState("");
  const [businessEnd, setBusinessEnd] = useState("");
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productAvailability, setProductAvailability] = useState("");
  const [productSearchTags, setProductSearchTags] = useState("");
  const [productAvailable, setProductAvailable] = useState(true);
  const [productStatus, setProductStatus] = useState<CatalogProductStatus>("disponible");
  const [productAvailabilityInherited, setProductAvailabilityInherited] = useState(true);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function refreshCatalog() {
      const [businessResult, productResult] = await Promise.allSettled([
        getCatalogBusinessesWithOptions({ includeDemo: false }),
        getCatalogProductsWithOptions({ includeUnavailable: true, includeDemo: false })
      ]);

      if (!isActive) {
        return;
      }

      if (businessResult.status === "fulfilled") {
        setBusinesses(businessResult.value);
      }

      if (productResult.status === "fulfilled") {
        setProducts(productResult.value);
      }
    }

    void refreshCatalog();

    const unsubscribeBusinesses = subscribeToBusinesses(() => {
      void refreshCatalog();
    });
    const unsubscribeProducts = subscribeToProducts(() => {
      void refreshCatalog();
    });

    return () => {
      isActive = false;
      unsubscribeBusinesses();
      unsubscribeProducts();
    };
  }, []);

  const activeBusinesses = useMemo(
    () => businesses.filter((business) => business.status === "activo"),
    [businesses]
  );
  const selectableBusinesses = useMemo(() => {
    if (editingProduct?.businessId && !activeBusinesses.some((business) => business.id === editingProduct.businessId)) {
      const currentBusiness = businesses.find((business) => business.id === editingProduct.businessId);
      return currentBusiness ? [currentBusiness, ...activeBusinesses] : activeBusinesses;
    }

    return activeBusinesses;
  }, [activeBusinesses, businesses, editingProduct]);
  const filteredBusinesses = useMemo(() => {
    const query = normalizeSearch(businessSearch);

    return selectableBusinesses.filter((business) =>
      normalizeSearch(`${business.name} ${business.category} ${business.zone}`).includes(query)
    );
  }, [businessSearch, selectableBusinesses]);
  const selectedBusiness = useMemo(
    () => businesses.find((business) => business.id === selectedBusinessId) ?? null,
    [businesses, selectedBusinessId]
  );
  const inheritedAvailability = selectedBusiness?.availability ?? "";

  async function handleSaveBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = businessName.trim();
    const availabilityStart = normalizeTimeToHHmm(businessStart);
    const availabilityEnd = normalizeTimeToHHmm(businessEnd);

    if (!name || !businessLocation.zone || !businessLocation.baseText || businessLocation.lat === null || businessLocation.lng === null) {
      setBusinessError("Completa nombre y registra la ubicación del negocio con mapa, búsqueda o ubicación actual.");
      return;
    }

    if (!availabilityStart || !availabilityEnd || availabilityStart >= availabilityEnd) {
      setBusinessError("Captura un horario operativo válido en formato 24h.");
      return;
    }

    setIsSavingBusiness(true);
    setBusinessError("");

    try {
      const input = {
        name,
        category: businessCategory,
        zone: businessLocation.zone,
        baseText: businessLocation.baseText,
        phone: businessPhone.trim(),
        lat: businessLocation.lat,
        lng: businessLocation.lng,
        status: businessStatus,
        availability: `${availabilityStart} - ${availabilityEnd}`,
        availabilityStart,
        availabilityEnd,
        estimatedTime: editingBusiness?.estimatedTime ?? "Dinámico",
        rating: editingBusiness?.rating ?? null
      };
      const business = editingBusiness
        ? await updateCatalogBusiness({ ...input, id: editingBusiness.id })
        : await createCatalogBusiness(input);

      setBusinesses((currentBusinesses) => upsertById(currentBusinesses, business));
      setProducts((currentProducts) =>
        currentProducts.map((product) =>
          product.businessId === business.id
            ? {
                ...product,
                businessName: business.name,
                businessZone: business.zone,
                businessBaseText: business.baseText,
                businessLat: business.lat,
                businessLng: business.lng,
                sector: business.category
              }
            : product
        )
      );
      resetBusinessForm();
      setSaveMessage(editingBusiness ? "Negocio actualizado." : "Negocio guardado.");
    } catch (caughtError) {
      setBusinessError(
        caughtError instanceof Error ? caughtError.message : "No fue posible guardar el negocio."
      );
    } finally {
      setIsSavingBusiness(false);
    }
  }

  function handleEditBusiness(business: CatalogBusiness) {
    setEditingBusiness(business);
    setBusinessName(business.name);
    setBusinessCategory(business.category);
    setBusinessPhone(business.phone);
    setBusinessStatus(business.status);
    setBusinessStart(business.availabilityStart);
    setBusinessEnd(business.availabilityEnd);
    setBusinessLocation({
      lat: business.lat,
      lng: business.lng,
      zone: business.zone,
      baseText: business.baseText
    });
    setBusinessLocationSearch(business.baseText || business.zone);
    setBusinessLocationMessage("Editando negocio existente.");
    setBusinessMapPoint(
      business.lat !== null && business.lng !== null
        ? { lat: business.lat, lng: business.lng }
        : zumpahuacanCenter
    );
  }

  function resetBusinessForm() {
    setEditingBusiness(null);
    setBusinessName("");
    setBusinessCategory("Alimentos y bebidas");
    setBusinessPhone("");
    setBusinessStatus("activo");
    setBusinessStart("");
    setBusinessEnd("");
    setBusinessLocationSearch("");
    setBusinessLocationMessage("");
    setBusinessLocation({ lat: null, lng: null, zone: "", baseText: "" });
  }

  async function handleSearchBusinessLocation() {
    const query = businessLocationSearch.trim();

    if (!query) {
      setBusinessLocationMessage("Escribe una referencia para buscar la ubicación del negocio.");
      return;
    }

    setBusinessLocationMessage("Buscando ubicación...");

    try {
      const point = await geocodeBusinessLocation(query);
      await applyBusinessLocation(point);
      setBusinessMapPoint(point);
    } catch {
      setBusinessLocationMessage("No pudimos encontrar esa ubicación. Prueba con una referencia más específica.");
    }
  }

  function handleUseCurrentBusinessLocation() {
    if (!navigator.geolocation) {
      setBusinessLocationMessage("Tu navegador no permite obtener ubicación actual.");
      return;
    }

    setBusinessLocationMessage("Solicitando ubicación actual...");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setBusinessMapPoint(point);
        await applyBusinessLocation(point);
      },
      () => {
        setBusinessLocationMessage("No pudimos obtener tu ubicación actual.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleConfirmBusinessMapPoint() {
    await applyBusinessLocation(businessMapPoint);
    setIsBusinessMapOpen(false);
  }

  async function applyBusinessLocation(point: { lat: number; lng: number }) {
    try {
      const location = await reverseGeocodeBusinessPoint(point);
      setBusinessLocation(location);
      setBusinessLocationSearch(location.baseText);
      setBusinessLocationMessage(`Ubicación registrada: ${location.zone}`);
    } catch {
      const fallback = {
        lat: point.lat,
        lng: point.lng,
        zone: "Zona calculada por ubicación",
        baseText: `Punto marcado en mapa (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`
      };
      setBusinessLocation(fallback);
      setBusinessLocationSearch(fallback.baseText);
      setBusinessLocationMessage("Ubicación registrada con coordenadas. No pudimos leer una zona exacta.");
    }
  }

  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const business = selectedBusiness;
    const name = productName.trim();
    const category = productCategory.trim();
    const price = parseOptionalNumber(productPrice);
    const customAvailability = normalizeAvailabilityRange(productAvailability);

    if (!business) {
      setProductError("Selecciona un negocio registrado para vincular el producto.");
      return;
    }

    if (!name || !category || price === null || price < 0) {
      setProductError("Completa nombre del producto, categoría del producto y precio de venta.");
      return;
    }

    if (!productAvailabilityInherited && !customAvailability) {
      setProductError("Captura un horario personalizado válido en formato 24h.");
      return;
    }

    setIsSavingProduct(true);
    setProductError("");

    try {
      const input = {
        businessId: business.id,
        businessName: business.name,
        businessZone: business.zone,
        businessBaseText: business.baseText,
        businessLat: business.lat,
        businessLng: business.lng,
        sector: business.category,
        name,
        description: productDescription.trim(),
        category: category as ProductCategory,
        price,
        available: productStatus === "disponible",
        status: productStatus,
        availability: productAvailabilityInherited ? inheritedAvailability : customAvailability,
        availabilityInherited: productAvailabilityInherited,
        searchTags: productSearchTags.trim()
      };
      const product = editingProduct
        ? await updateCatalogProduct({ ...input, id: editingProduct.id })
        : await createCatalogProduct(input);

      setProducts((currentProducts) => upsertById(currentProducts, product));
      resetProductForm();
      setSaveMessage(editingProduct ? "Producto actualizado." : "Producto guardado.");
    } catch (caughtError) {
      setProductError(
        caughtError instanceof Error ? caughtError.message : "No fue posible guardar el producto."
      );
    } finally {
      setIsSavingProduct(false);
    }
  }

  function handleEditProduct(product: CatalogProduct) {
    setEditingProduct(product);
    setSelectedBusinessId(product.businessId);
    setBusinessSearch(product.businessName);
    setProductName(product.name);
    setProductDescription(product.description);
    setProductCategory(product.category);
    setProductPrice(String(product.price));
    setProductAvailability(product.availability);
    setProductSearchTags(product.searchTags);
    setProductAvailable(product.available);
    setProductStatus(product.status);
    setProductAvailabilityInherited(product.availabilityInherited);
  }

  function resetProductForm() {
    setEditingProduct(null);
    setBusinessSearch("");
    setSelectedBusinessId("");
    setProductName("");
    setProductDescription("");
    setProductCategory("");
    setProductPrice("");
    setProductAvailability("");
    setProductSearchTags("");
    setProductAvailable(true);
    setProductStatus("disponible");
    setProductAvailabilityInherited(true);
  }

  async function handleDeleteBusiness(business: CatalogBusiness) {
    await deleteCatalogBusiness(business.id);
    setBusinesses((currentBusinesses) => currentBusinesses.filter((item) => item.id !== business.id));
    setProducts((currentProducts) => currentProducts.filter((item) => item.businessId !== business.id));
    setSaveMessage("Negocio eliminado de activos y conservado para historial.");
  }

  async function handleDeleteProduct(product: CatalogProduct) {
    await deleteCatalogProduct(product.id);
    setProducts((currentProducts) => currentProducts.filter((item) => item.id !== product.id));
    setSaveMessage("Producto eliminado de activos y conservado para historial.");
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
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-black text-orbi-text">
              {editingBusiness ? "Editar negocio" : "Alta de negocio"}
            </h3>
            {editingBusiness ? (
              <button
                type="button"
                onClick={resetBusinessForm}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-orbi-muted"
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Nuevo
              </button>
            ) : null}
          </div>
          <AdminInput
            label="Nombre del negocio"
            placeholder="Regina Café"
            value={businessName}
            onChange={setBusinessName}
          />
          <label className="block text-sm font-semibold text-orbi-text">
            Categoría de negocio
            <select
              value={businessCategory}
              onChange={(event) => setBusinessCategory(event.target.value as BusinessSector)}
              className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none"
            >
              {businessSectors.map((sector) => (
                <option key={sector} value={sector}>{sector}</option>
              ))}
            </select>
          </label>
          <AdminInput
            label="Teléfono"
            placeholder="5255..."
            value={businessPhone}
            onChange={setBusinessPhone}
            required={false}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TimeInput label="Horario operativo inicio" value={businessStart} onChange={setBusinessStart} />
            <TimeInput label="Horario operativo fin" value={businessEnd} onChange={setBusinessEnd} />
          </div>
          <label className="block text-sm font-semibold text-orbi-text">
            Estado
            <select
              value={businessStatus}
              onChange={(event) => setBusinessStatus(event.target.value as "activo" | "inactivo")}
              className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none"
            >
              <option value="activo">activo</option>
              <option value="inactivo">inactivo</option>
            </select>
          </label>
          <BusinessLocationCapture
            location={businessLocation}
            message={businessLocationMessage}
            searchValue={businessLocationSearch}
            onSearchValueChange={setBusinessLocationSearch}
            onSearch={handleSearchBusinessLocation}
            onUseCurrentLocation={handleUseCurrentBusinessLocation}
            onOpenMap={() => {
              setBusinessMapPoint(
                businessLocation.lat !== null && businessLocation.lng !== null
                  ? { lat: businessLocation.lat, lng: businessLocation.lng }
                  : zumpahuacanCenter
              );
              setIsBusinessMapOpen(true);
            }}
          />
          {businessError ? <ErrorText>{businessError}</ErrorText> : null}
          <button type="submit" disabled={isSavingBusiness} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow">
            <Plus aria-hidden="true" className="h-5 w-5" />
            {isSavingBusiness ? "Guardando..." : editingBusiness ? "Guardar cambios" : "Guardar negocio"}
          </button>
        </form>

        <form onSubmit={handleSaveProduct} className="grid gap-4 rounded-md border border-orbi-cyan/15 bg-orbi-panel/72 p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-black text-orbi-text">
              {editingProduct ? "Editar producto o servicio" : "Alta de producto o servicio"}
            </h3>
            {editingProduct ? (
              <button
                type="button"
                onClick={resetProductForm}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-orbi-muted"
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Nuevo
              </button>
            ) : null}
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-orbi-text">
              Negocio
              <input
                value={businessSearch}
                onChange={(event) => setBusinessSearch(event.target.value)}
                placeholder="Buscar negocio registrado..."
                className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
              />
            </label>
            {!selectableBusinesses.length ? (
              <p className="rounded-md border border-yellow-300/15 bg-yellow-300/10 p-3 text-sm font-semibold text-yellow-100">
                Primero registra un negocio para vincular productos.
              </p>
            ) : (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-white/10 bg-orbi-black/25 p-2">
                {filteredBusinesses.map((business) => (
                  <button
                    key={business.id}
                    type="button"
                    onClick={() => {
                      setSelectedBusinessId(business.id);
                      setBusinessSearch(business.name);
                      if (!editingProduct || productAvailabilityInherited) {
                        setProductAvailability(business.availability);
                        setProductAvailabilityInherited(true);
                      }
                      if (!editingProduct) {
                        setProductCategory(suggestProductCategoryFromBusiness(business.category));
                      }
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left transition ${
                      selectedBusinessId === business.id
                        ? "border-orbi-cyan/45 bg-orbi-blue/20"
                        : "border-white/10 bg-white/[0.04] hover:border-orbi-cyan/30"
                    }`}
                  >
                    <p className="text-sm font-black text-orbi-text">{business.name}</p>
                    <p className="mt-1 text-xs text-orbi-muted">{business.category} · {business.zone}</p>
                  </button>
                ))}
              </div>
            )}
            {selectedBusiness ? <BusinessSummary business={selectedBusiness} /> : null}
          </div>
          <AdminInput label="Nombre del producto" placeholder="Frappe moka" value={productName} onChange={setProductName} />
          <AdminInput label="Descripción" placeholder="Bebida fría preparada al momento" value={productDescription} onChange={setProductDescription} required={false} />
          <label className="block text-sm font-semibold text-orbi-text">
            Categoría producto
            <select
              value={productCategory}
              onChange={(event) => setProductCategory(event.target.value)}
              className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none"
              required
            >
              <option value="">Selecciona categoría</option>
              {productCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
          <AdminInput label="Precio venta" placeholder="65" value={productPrice} onChange={setProductPrice} />
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-orbi-text">
              <input
                type="checkbox"
                checked={productAvailabilityInherited}
                onChange={(event) => {
                  setProductAvailabilityInherited(event.target.checked);
                  if (event.target.checked) {
                    setProductAvailability(inheritedAvailability);
                  }
                }}
                className="h-4 w-4 accent-orbi-blue"
              />
              Heredado del negocio
            </label>
            <AdminInput
              label={productAvailabilityInherited ? "Horario heredado" : "Horario personalizado"}
              placeholder="08:00 - 20:00"
              value={productAvailabilityInherited ? inheritedAvailability : productAvailability}
              onChange={(value) => {
                setProductAvailabilityInherited(false);
                setProductAvailability(value);
              }}
              required={!productAvailabilityInherited}
            />
          </div>
          <AdminInput label="Etiquetas búsqueda" placeholder="frappe café moka bebida" value={productSearchTags} onChange={setProductSearchTags} required={false} />
          <label className="block text-sm font-semibold text-orbi-text">
            Estado de producto
            <select
              value={productStatus}
              onChange={(event) => {
                const status = event.target.value as CatalogProductStatus;
                setProductStatus(status);
                setProductAvailable(status === "disponible");
              }}
              className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none"
            >
              <option value="disponible">Producto disponible</option>
              <option value="agotado">Agotado temporalmente</option>
              <option value="pausado">Pausado</option>
            </select>
          </label>
          {productError ? <ErrorText>{productError}</ErrorText> : null}
          <button type="submit" disabled={isSavingProduct} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow">
            <Plus aria-hidden="true" className="h-5 w-5" />
            {isSavingProduct ? "Guardando..." : editingProduct ? "Guardar cambios" : "Guardar producto"}
          </button>
        </form>
      </div>

      {isBusinessMapOpen ? (
        <BusinessMapDialog
          point={businessMapPoint}
          onPointChange={setBusinessMapPoint}
          onConfirm={handleConfirmBusinessMapPoint}
          onClose={() => setIsBusinessMapOpen(false)}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {saveMessage ? (
          <p className="rounded-md border border-emerald-300/15 bg-emerald-400/10 p-3 text-sm font-semibold text-emerald-100 lg:col-span-2">
            {saveMessage}
          </p>
        ) : null}
        <CatalogList
          title="Negocios activos"
          items={businesses.map((business) => ({
            id: business.id,
            title: business.name,
            meta: `${business.category} · ${business.zone}`,
            detail: `${business.status} · ${business.availability || "Sin horario"} · ${business.baseText || "Sin ubicación registrada"} · ${business.rating}`,
            onEdit: () => handleEditBusiness(business),
            onDelete: () => handleDeleteBusiness(business)
          }))}
        />
        <CatalogList
          title="Productos y servicios"
          items={products.map((product) => ({
            id: product.id,
            title: product.name,
            meta: `${product.businessName} · ${product.sector}`,
            detail: `$${product.price} · ${product.category} · ${formatProductStatus(product.status)} · ${product.availabilityInherited ? "Heredado del negocio" : "Horario personalizado"}`,
            onEdit: () => handleEditProduct(product),
            onDelete: () => handleDeleteProduct(product)
          }))}
        />
      </div>
    </section>
  );
}

type BusinessLocationState = {
  lat: number | null;
  lng: number | null;
  zone: string;
  baseText: string;
};

function BusinessLocationCapture({
  location,
  message,
  searchValue,
  onSearchValueChange,
  onSearch,
  onUseCurrentLocation,
  onOpenMap
}: {
  location: BusinessLocationState;
  message: string;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  onSearch: () => void;
  onUseCurrentLocation: () => void;
  onOpenMap: () => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4 sm:col-span-2">
      <div>
        <p className="text-sm font-black text-orbi-text">Ubicación operativa del negocio</p>
        <p className="mt-1 text-xs leading-5 text-orbi-muted">
          La zona se calcula automáticamente desde la ubicación registrada.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="block text-sm font-semibold text-orbi-text">
          Buscar ubicación
          <input
            value={searchValue}
            onChange={(event) => onSearchValueChange(event.target.value)}
            placeholder="Buscar negocio, calle o referencia..."
            className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
          />
        </label>
        <button
          type="button"
          onClick={onSearch}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 px-4 py-3 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/25"
        >
          <Search aria-hidden="true" className="h-4 w-4" />
          Buscar
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onOpenMap}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-orbi-text transition hover:border-orbi-cyan/35 hover:bg-white/10"
        >
          <MapPin aria-hidden="true" className="h-4 w-4" />
          Elegir en mapa
        </button>
        <button
          type="button"
          onClick={onUseCurrentLocation}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-orbi-text transition hover:border-orbi-cyan/35 hover:bg-white/10"
        >
          <LocateFixed aria-hidden="true" className="h-4 w-4" />
          Usar ubicación actual
        </button>
      </div>

      <div className="rounded-md border border-white/10 bg-orbi-black/25 p-3 text-sm">
        <p className="font-bold text-orbi-text">Zona calculada</p>
        <p className="mt-1 text-orbi-muted">{location.zone || "Sin zona calculada todavía"}</p>
        <p className="mt-3 font-bold text-orbi-text">Ubicación registrada</p>
        <p className="mt-1 text-orbi-muted">{location.baseText || "Elige un punto para registrar el origen del negocio"}</p>
        {location.lat !== null && location.lng !== null ? (
          <p className="mt-2 text-xs font-semibold text-orbi-cyan">
            Coordenadas internas: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
          </p>
        ) : null}
      </div>

      {message ? (
        <p className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/10 p-3 text-xs font-semibold text-orbi-cyan">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function BusinessMapDialog({
  point,
  onPointChange,
  onConfirm,
  onClose
}: {
  point: { lat: number; lng: number };
  onPointChange: (point: { lat: number; lng: number }) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-orbi-black/75 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <section className="max-h-[92vh] w-full overflow-hidden rounded-md border border-orbi-cyan/20 bg-orbi-panel shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_45px_rgba(31,139,255,0.16)] sm:max-w-3xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
              Negocio afiliado
            </p>
            <h3 className="mt-1 text-lg font-black text-orbi-text">Elegir ubicación en mapa</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-orbi-text"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="h-[55vh] min-h-[320px]">
          <LocationPickerMap point={point} onPointChange={onPointChange} />
        </div>
        <div className="grid gap-2 border-t border-white/10 p-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-orbi-text"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white shadow-glow"
          >
            Confirmar ubicación
          </button>
        </div>
      </section>
    </div>
  );
}

function CatalogList({
  title,
  items
}: {
  title: string;
  items: Array<{ id: string; title: string; meta: string; detail: string; onEdit: () => void; onDelete: () => void }>;
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-orbi-text">{item.title}</p>
                <p className="mt-1 text-xs font-semibold text-orbi-cyan">{item.meta}</p>
                <p className="mt-1 text-xs text-orbi-muted">{item.detail}</p>
              </div>
              <button
                type="button"
                onClick={item.onEdit}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-orbi-cyan/15 bg-orbi-blue/10 px-3 text-xs font-bold text-orbi-cyan"
              >
                <Edit3 aria-hidden="true" className="h-3.5 w-3.5" />
                Editar
              </button>
              <button
                type="button"
                onClick={item.onDelete}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-red-300/15 bg-red-400/10 px-3 text-xs font-bold text-red-200"
              >
                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                Eliminar
              </button>
            </div>
          </article>
        ))}
        {!items.length ? (
          <p className="rounded-md border border-white/10 bg-orbi-black/25 p-3 text-sm text-orbi-muted">
            Aún no hay registros guardados.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function BusinessSummary({ business }: { business: CatalogBusiness }) {
  return (
    <article className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-orbi-cyan">
        Negocio seleccionado
      </p>
      <p className="mt-2 font-black text-orbi-text">{business.name}</p>
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
        <SummaryMini label="Categoría" value={business.category} />
        <SummaryMini label="Zona" value={business.zone} />
        <SummaryMini label="Ubicación registrada" value={business.baseText || `${business.lat}, ${business.lng}`} />
        <SummaryMini label="Estado" value={business.status} />
      </div>
    </article>
  );
}

function SummaryMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-orbi-black/25 px-3 py-2">
      <p className="font-semibold text-orbi-muted">{label}</p>
      <p className="mt-1 font-black text-orbi-text">{value}</p>
    </div>
  );
}

function AdminInput({
  label,
  placeholder,
  value,
  onChange,
  required = true
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </label>
  );
}

function TimeInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(normalizeTimeToHHmm(event.target.value))}
        className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
        required
      >
        <option value="">Selecciona hora</option>
        {timeOptions.map((time) => (
          <option key={time} value={time}>
            {time}
          </option>
        ))}
      </select>
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

function parseOptionalNumber(value: unknown) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAvailabilityRange(value: string) {
  const [rawStart, rawEnd] = value.split("-").map((part) => part.trim());
  const start = normalizeTimeToHHmm(rawStart);
  const end = normalizeTimeToHHmm(rawEnd);
  return start && end && start < end ? `${start} - ${end}` : "";
}

function buildTimeOptions() {
  const options: string[] = [];

  for (let hour = 6; hour <= 23; hour += 1) {
    options.push(`${String(hour).padStart(2, "0")}:00`);

    if (hour !== 23) {
      options.push(`${String(hour).padStart(2, "0")}:30`);
    }
  }

  return options;
}

function suggestProductCategoryFromBusiness(category: BusinessSector): ProductCategory {
  const mapping: Partial<Record<BusinessSector, ProductCategory>> = {
    "Alimentos y bebidas": "Comida",
    Farmacia: "Medicamento",
    Papelería: "Papelería",
    Servicios: "Servicio",
    Mandados: "Mandado",
    Transporte: "Traslado"
  };

  return mapping[category] ?? "Otro";
}

function formatProductStatus(status: CatalogProductStatus) {
  if (status === "agotado") return "Agotado temporalmente";
  if (status === "pausado") return "Pausado";
  return "Producto disponible";
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const exists = items.some((item) => item.id === nextItem.id);

  if (!exists) {
    return [nextItem, ...items];
  }

  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}

async function geocodeBusinessLocation(query: string) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
      buildLocalLocationQuery(query)
    )}`
  );

  if (!response.ok) {
    throw new Error("No fue posible consultar la ubicación.");
  }

  const results = (await response.json()) as Array<{ lat?: string; lon?: string }>;
  const result = results[0];
  const lat = Number(result?.lat);
  const lng = Number(result?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("La ubicación no devolvió coordenadas válidas.");
  }

  return { lat, lng };
}

async function reverseGeocodeBusinessPoint(point: { lat: number; lng: number }) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
      point.lat
    )}&lon=${encodeURIComponent(point.lng)}`
  );

  if (!response.ok) {
    throw new Error("No fue posible leer la zona.");
  }

  const result = (await response.json()) as {
    display_name?: string;
    address?: {
      neighbourhood?: string;
      suburb?: string;
      village?: string;
      town?: string;
      city?: string;
      municipality?: string;
      county?: string;
      state?: string;
    };
  };
  const address = result.address ?? {};
  const zone =
    address.neighbourhood ||
    address.suburb ||
    address.village ||
    address.town ||
    address.city ||
    address.municipality ||
    address.county ||
    address.state ||
    "Zona calculada por ubicación";
  const baseText = result.display_name?.trim() || `Punto marcado (${point.lat}, ${point.lng})`;

  return {
    lat: point.lat,
    lng: point.lng,
    zone,
    baseText
  };
}

function buildLocalLocationQuery(rawQuery: string) {
  const query = rawQuery.trim();
  const hasStateOrCountry = /estado de m[eé]xico|m[eé]xico/i.test(query);
  const isShortReference = query.split(/\s+/).filter(Boolean).length <= 3;

  if (hasStateOrCountry || !isShortReference) {
    return query;
  }

  return `${query}, Zumpahuacán, Estado de México, México`;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
