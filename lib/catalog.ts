import { supabase } from "@/lib/supabase";

const CATALOG_BUSINESSES_KEY = "orbi_catalog_businesses";
const CATALOG_PRODUCTS_KEY = "orbi_catalog_products";
const businessSelectWithLocation =
  "id,name,nombre_negocio,category,categoria_negocio,zone,zona,base_text,direccion,phone,telefono,lat,lng,location_lat,location_lng,ubicacion_lat,ubicacion_lng,status,estado,estimated_time,rating,is_active,deleted_at,availability,horario_disponible,horario_operativo_inicio,horario_operativo_fin";
const businessSelectFallback =
  "id,name,nombre_negocio,category,categoria_negocio,zone,zona,base_text,direccion,phone,telefono,lat,lng,ubicacion_lat,ubicacion_lng,status,estado,estimated_time,rating,is_active,deleted_at";

export const businessSectors = [
  "Alimentos y bebidas",
  "Farmacia",
  "Papelería",
  "Ferretería",
  "Tecnología",
  "Servicios",
  "Mandados",
  "Transporte",
  "Otro"
] as const;

export const productCategories = [
  "Bebida fría",
  "Bebida caliente",
  "Comida",
  "Snack",
  "Postre",
  "Medicamento",
  "Papelería",
  "Trámite",
  "Mandado",
  "Traslado",
  "Servicio",
  "Otro"
] as const;

const productColumns = new Set([
  "id",
  "business_id",
  "negocio_id",
  "name",
  "nombre_producto",
  "description",
  "descripcion",
  "category",
  "categoria_producto",
  "price",
  "precio_venta",
  "available",
  "disponible",
  "is_available",
  "status",
  "estado",
  "availability_status",
  "availability",
  "horario_disponible",
  "availability_inherited",
  "search_tags",
  "etiquetas_busqueda",
  "deleted_at",
  "created_at",
  "updated_at"
]);

export type BusinessSector = (typeof businessSectors)[number];
export type ProductCategory = (typeof productCategories)[number];
export type CatalogBusinessStatus = "activo" | "inactivo";
export type CatalogProductStatus = "disponible" | "agotado" | "pausado";

export type CatalogBusiness = {
  id: string;
  name: string;
  category: BusinessSector;
  zone: string;
  baseText: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  status: CatalogBusinessStatus;
  estimatedTime: string;
  rating: string;
  availability: string;
  availabilityStart: string;
  availabilityEnd: string;
};

export type CatalogProduct = {
  id: string;
  businessId: string;
  businessName: string;
  businessZone: string;
  businessBaseText: string;
  businessLat: number | null;
  businessLng: number | null;
  sector: BusinessSector;
  name: string;
  description: string;
  category: ProductCategory;
  price: number;
  available: boolean;
  status: CatalogProductStatus;
  availability: string;
  availabilityInherited: boolean;
  searchTags: string;
};

export type CatalogSearchResult = CatalogProduct & {
  serviceType: "Compra local";
};

type BusinessRow = {
  id: string;
  name?: string | null;
  nombre_negocio?: string | null;
  category?: string | null;
  categoria_negocio?: string | null;
  zone?: string | null;
  zona?: string | null;
  base_text?: string | null;
  direccion?: string | null;
  phone?: string | null;
  telefono?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  location_lat?: number | string | null;
  location_lng?: number | string | null;
  ubicacion_lat?: number | string | null;
  ubicacion_lng?: number | string | null;
  status?: string | null;
  estado?: string | null;
  estimated_time?: string | null;
  rating?: string | number | null;
  availability?: string | null;
  horario_disponible?: string | null;
  horario_operativo_inicio?: string | null;
  horario_operativo_fin?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
};

type ProductRow = {
  id: string;
  business_id?: string | null;
  negocio_id?: string | null;
  name?: string | null;
  nombre_producto?: string | null;
  description?: string | null;
  descripcion?: string | null;
  category?: string | null;
  categoria_producto?: string | null;
  price?: number | string | null;
  precio_venta?: number | string | null;
  available?: boolean | null;
  disponible?: boolean | null;
  is_available?: boolean | null;
  status?: string | null;
  estado?: string | null;
  availability_status?: string | null;
  availability?: string | null;
  horario_disponible?: string | null;
  availability_inherited?: boolean | null;
  search_tags?: string | null;
  etiquetas_busqueda?: string | null;
  deleted_at?: string | null;
};

export async function getCatalogBusinesses() {
  return getCatalogBusinessesWithOptions();
}

export async function getCatalogBusinessesWithOptions({
  includeDemo = false
}: {
  includeDemo?: boolean;
} = {}) {
  void includeDemo;
  const localBusinesses = readLocalCatalogBusinesses();
  const remoteBusinesses = await getRemoteCatalogBusinesses();

  return mergeBusinesses([...remoteBusinesses, ...localBusinesses]);
}

export async function getLiveCatalogBusinesses() {
  return getRemoteCatalogBusinesses();
}

export async function getCatalogProducts() {
  return getCatalogProductsWithOptions();
}

export async function getCatalogProductsWithOptions({
  includeUnavailable = false,
  includeDemo = false
}: {
  includeUnavailable?: boolean;
  includeDemo?: boolean;
} = {}) {
  void includeDemo;
  const businesses = await getCatalogBusinessesWithOptions({ includeDemo });
  const localProducts = readLocalCatalogProducts();
  const remoteProducts = await getRemoteCatalogProducts(businesses);
  return mergeProducts([...remoteProducts, ...localProducts], businesses, includeUnavailable);
}

export async function getLiveCatalogProducts({ includeUnavailable = false } = {}) {
  const businesses = await getLiveCatalogBusinesses();
  const remoteProducts = await getRemoteCatalogProducts(businesses);
  return mergeProducts(remoteProducts, businesses, includeUnavailable);
}

export async function getLiveCatalogItems() {
  return getLiveCatalogProducts();
}

export async function getCatalogItems() {
  return getCatalogProducts();
}

export async function createCatalogBusiness(input: Omit<CatalogBusiness, "id">) {
  const business: CatalogBusiness = {
    ...input,
    id: crypto.randomUUID()
  };

  if (supabase) {
    const { data, error } = await supabase
      .from("businesses")
      .insert(buildBusinessPayload(business))
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (data?.id) {
      business.id = data.id;
    }
  }

  saveLocalCatalogBusinesses([business, ...readLocalCatalogBusinesses()]);
  return business;
}

export async function createCatalogProduct(input: Omit<CatalogProduct, "id">) {
  const product: CatalogProduct = {
    ...input,
    id: crypto.randomUUID()
  };

  if (supabase) {
    const payload = buildProductPayload(product);
    const { data, error } = await supabase
      .from("products")
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.id) {
      throw new Error("No se pudo confirmar el producto en Supabase.");
    }

    product.id = data.id;
    product.businessId = data.business_id || product.businessId;
  } else {
    throw new Error("Supabase no está disponible para guardar el producto.");
  }

  saveLocalCatalogProducts([product, ...readLocalCatalogProducts()]);
  return product;
}

export async function updateCatalogBusiness(input: CatalogBusiness) {
  const business = input;

  if (supabase) {
    const { error } = await supabase
      .from("businesses")
      .update(buildBusinessPayload(business))
      .eq("id", business.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  saveLocalCatalogBusinesses(upsertById(readLocalCatalogBusinesses(), business));
  return business;
}

export async function updateCatalogProduct(input: CatalogProduct) {
  const product = input;

  if (supabase) {
    const { error } = await supabase
      .from("products")
      .update(buildProductPayload(product))
      .eq("id", product.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  saveLocalCatalogProducts(upsertById(readLocalCatalogProducts(), product));
  return product;
}

export async function deleteCatalogBusiness(id: string) {
  try {
    if (supabase) {
      await supabase
        .from("businesses")
        .update({ is_active: false, deleted_at: new Date().toISOString(), estado: "inactivo" })
        .eq("id", id);
    }
  } catch {
    // Local fallback keeps deleted records out of active operations.
  }

  saveLocalCatalogBusinesses(readLocalCatalogBusinesses().filter((business) => business.id !== id));
  saveLocalCatalogProducts(readLocalCatalogProducts().filter((product) => product.businessId !== id));
}

export async function deleteCatalogProduct(id: string) {
  try {
    if (supabase) {
      await supabase
        .from("products")
        .update({
          is_available: false,
          available: false,
          disponible: false,
          status: "pausado",
          estado: "pausado",
          availability_status: "pausado",
          deleted_at: new Date().toISOString()
        })
        .eq("id", id);
    }
  } catch {
    // Local fallback keeps deleted records out of active operations.
  }

  saveLocalCatalogProducts(readLocalCatalogProducts().filter((product) => product.id !== id));
}

export function searchCatalog(items: CatalogProduct[], query: string) {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);

  if (!tokens.length) {
    return [];
  }

  return items
    .map((item) => ({
      item,
      score: scoreCatalogItem(item, tokens)
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => ({ ...item, serviceType: "Compra local" as const }));
}

function scoreCatalogItem(item: CatalogProduct, tokens: string[]) {
  const haystack = normalizeSearchText(
    [
      item.name,
      item.description,
      item.category,
      item.businessName,
      item.sector,
      item.searchTags
    ].join(" ")
  );

  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function mergeBusinesses(businesses: CatalogBusiness[]) {
  return Array.from(new Map(businesses.map((business) => [business.id, business])).values()).filter(
    (business) => business.status === "activo"
  );
}

function mergeProducts(
  products: CatalogProduct[],
  businesses: CatalogBusiness[],
  includeUnavailable = false
) {
  const businessesById = new Map(businesses.map((business) => [business.id, business]));

  return Array.from(new Map(products.map((product) => [product.id, product])).values())
    .map((product) => {
      const business = businessesById.get(product.businessId);

      return business
        ? {
            ...product,
            businessName: business.name,
            businessZone: business.zone,
            businessBaseText: business.baseText,
            businessLat: business.lat,
            businessLng: business.lng,
            sector: business.category,
            availability: product.availabilityInherited ? business.availability : product.availability
          }
        : product;
    })
    .filter((product) => includeUnavailable || (product.available && product.status === "disponible"));
}

async function getRemoteCatalogBusinesses() {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("businesses")
      .select(businessSelectWithLocation)
      .order("name", { ascending: true });

    if (error) {
      if (isMissingLocationColumnError(error)) {
        const fallback = await supabase
          .from("businesses")
          .select(businessSelectFallback)
          .order("name", { ascending: true });

        if (fallback.error) {
          return [];
        }

        return (fallback.data ?? []).filter(isActiveBusinessRow).map(mapBusinessRow);
      }

      return [];
    }

    return (data ?? []).filter(isActiveBusinessRow).map(mapBusinessRow);
  } catch {
    return [];
  }
}

async function getRemoteCatalogProducts(businesses: CatalogBusiness[]) {
  if (!supabase) {
    return [];
  }

  const businessesById = new Map(businesses.map((business) => [business.id, business]));

  try {
    const { data, error } = await supabase
      .from("products")
      .select("id,business_id,negocio_id,name,nombre_producto,description,descripcion,category,categoria_producto,price,precio_venta,available,disponible,is_available,status,estado,availability_status,availability,horario_disponible,availability_inherited,search_tags,etiquetas_busqueda,deleted_at")
      .order("name", { ascending: true });

    if (error) {
      return [];
    }

    return (data ?? []).filter(isActiveProductRow).map((row) => mapProductRow(row, businessesById));
  } catch {
    return [];
  }
}

function mapBusinessRow(row: BusinessRow): CatalogBusiness {
  const status = row.estado === "inactivo" || row.status === "No disponible" ? "inactivo" : "activo";

  return {
    id: row.id,
    name: row.nombre_negocio || row.name || "Negocio local",
    category: normalizeSector(row.categoria_negocio || row.category),
    zone: row.zona || row.zone || "Zona local",
    baseText: row.base_text || row.direccion || row.zona || row.zone || "Base operativa del negocio",
    phone: row.telefono || row.phone || "",
    lat: toFiniteNumber(row.ubicacion_lat ?? row.location_lat ?? row.lat),
    lng: toFiniteNumber(row.ubicacion_lng ?? row.location_lng ?? row.lng),
    status,
    estimatedTime: row.estimated_time || "15-25 min",
    rating: String(row.rating ?? "Sin calificación todavía"),
    availability: row.availability || row.horario_disponible || buildAvailability(row.horario_operativo_inicio, row.horario_operativo_fin),
    availabilityStart: normalizeTimeToHHmm(row.horario_operativo_inicio) || "",
    availabilityEnd: normalizeTimeToHHmm(row.horario_operativo_fin) || ""
  };
}

function mapProductRow(row: ProductRow, businessesById: Map<string, CatalogBusiness>): CatalogProduct {
  const businessId = row.negocio_id || row.business_id || "";
  const business = businessesById.get(businessId);

  const customAvailability = row.horario_disponible || row.availability || "";
  const status = normalizeProductStatus(row.availability_status || row.estado || row.status);
  return {
    id: row.id,
    businessId,
    businessName: business?.name || "Negocio local",
    businessZone: business?.zone || "",
    businessBaseText: business?.baseText || business?.zone || "",
    businessLat: business?.lat ?? null,
    businessLng: business?.lng ?? null,
    sector: business?.category || "Otro",
    name: row.nombre_producto || row.name || "Producto local",
    description: row.descripcion || row.description || "",
    category: normalizeProductCategory(row.categoria_producto || row.category),
    price: toFiniteNumber(row.precio_venta ?? row.price) ?? 0,
    available: status === "disponible" && (row.is_available ?? row.disponible ?? row.available ?? true),
    status,
    availability: customAvailability || business?.availability || "",
    availabilityInherited: row.availability_inherited ?? !customAvailability,
    searchTags: row.etiquetas_busqueda || row.search_tags || ""
  };
}

function isActiveBusinessRow(row: BusinessRow) {
  return row.deleted_at == null && row.is_active !== false && row.estado !== "inactivo";
}

function isActiveProductRow(row: ProductRow) {
  return row.deleted_at == null;
}

function isMissingLocationColumnError(error: { message?: string; code?: string } | null) {
  if (!error) {
    return false;
  }

  return error.code === "42703" || /location_lat|location_lng|column|schema cache/i.test(error.message ?? "");
}

function normalizeSector(value: string | null | undefined): BusinessSector {
  if (value === "Abarrotes") return "Mandados";
  if (value === "Trámites") return "Servicios";
  return businessSectors.includes(value as BusinessSector) ? (value as BusinessSector) : "Otro";
}

function normalizeProductCategory(value: string | null | undefined): ProductCategory {
  return productCategories.includes(value as ProductCategory) ? (value as ProductCategory) : "Otro";
}

function normalizeProductStatus(value: string | null | undefined): CatalogProductStatus {
  if (value === "agotado" || value === "pausado") {
    return value;
  }

  return "disponible";
}

function buildAvailability(start?: string | null, end?: string | null) {
  const safeStart = normalizeTimeToHHmm(start);
  const safeEnd = normalizeTimeToHHmm(end);
  return safeStart && safeEnd ? `${safeStart} - ${safeEnd}` : "";
}

export function normalizeTimeToHHmm(value?: string | null) {
  const rawValue = String(value ?? "").trim().toLowerCase();

  if (!rawValue) {
    return "";
  }

  const directMatch = rawValue.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (directMatch) {
    return `${directMatch[1].padStart(2, "0")}:${directMatch[2]}`;
  }

  const meridiemMatch = rawValue.match(/^(\d{1,2}):([0-5]\d)\s*([ap])\.?\s*m\.?$/);
  if (!meridiemMatch) {
    return "";
  }

  let hours = Number(meridiemMatch[1]);
  const minutes = meridiemMatch[2];
  const meridiem = meridiemMatch[3];

  if (meridiem === "a" && hours === 12) {
    hours = 0;
  } else if (meridiem === "p" && hours !== 12) {
    hours += 12;
  }

  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function readLocalCatalogBusinesses() {
  return readLocalArray<CatalogBusiness>(CATALOG_BUSINESSES_KEY);
}

function readLocalCatalogProducts() {
  return readLocalArray<CatalogProduct>(CATALOG_PRODUCTS_KEY);
}

function saveLocalCatalogBusinesses(businesses: CatalogBusiness[]) {
  writeLocalArray(CATALOG_BUSINESSES_KEY, businesses);
}

function saveLocalCatalogProducts(products: CatalogProduct[]) {
  writeLocalArray(CATALOG_PRODUCTS_KEY, products);
}

function buildBusinessPayload(business: CatalogBusiness) {
  // Send only well-known columns to public.businesses to avoid schema cache errors.
  return {
    name: business.name,
    category: business.category,
    description: business.baseText || `${business.category} en ${business.zone}`,
    estimated_time: business.estimatedTime,
    status: business.status === "activo" ? "Disponible" : "No disponible",
    rating: null
  };
}

function buildProductPayload(product: CatalogProduct) {
  const payload: Record<string, unknown> = {};

  if (productColumns.has("business_id")) {
    payload.business_id = product.businessId;
  }
  if (productColumns.has("negocio_id")) {
    payload.negocio_id = product.businessId;
  }
  if (productColumns.has("name")) {
    payload.name = product.name;
  }
  if (productColumns.has("nombre_producto")) {
    payload.nombre_producto = product.name;
  }
  if (productColumns.has("description")) {
    payload.description = product.description;
  }
  if (productColumns.has("descripcion")) {
    payload.descripcion = product.description;
  }
  if (productColumns.has("category")) {
    payload.category = product.category;
  }
  if (productColumns.has("categoria_producto")) {
    payload.categoria_producto = product.category;
  }
  if (productColumns.has("price")) {
    payload.price = product.price;
  }
  if (productColumns.has("precio_venta")) {
    payload.precio_venta = product.price;
  }
  if (productColumns.has("available")) {
    payload.available = product.available;
  }
  if (productColumns.has("disponible")) {
    payload.disponible = product.available;
  }
  if (productColumns.has("is_available")) {
    payload.is_available = product.available;
  }
  if (productColumns.has("status")) {
    payload.status = product.status;
  }
  if (productColumns.has("estado")) {
    payload.estado = product.status;
  }
  if (productColumns.has("availability_status")) {
    payload.availability_status = product.status;
  }
  if (productColumns.has("availability")) {
    payload.availability = product.availabilityInherited ? "" : product.availability;
  }
  if (productColumns.has("horario_disponible")) {
    payload.horario_disponible = product.availabilityInherited ? "" : product.availability;
  }
  if (productColumns.has("availability_inherited")) {
    payload.availability_inherited = product.availabilityInherited;
  }
  if (productColumns.has("search_tags")) {
    payload.search_tags = product.searchTags;
  }
  if (productColumns.has("etiquetas_busqueda")) {
    payload.etiquetas_busqueda = product.searchTags;
  }

  return payload;
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const exists = items.some((item) => item.id === nextItem.id);

  if (!exists) {
    return [nextItem, ...items];
  }

  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}

function readLocalArray<T>(key: string) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

function writeLocalArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const numberValue = Number(value.trim());
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  return null;
}

