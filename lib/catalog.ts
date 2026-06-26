import { supabase } from "@/lib/supabase";
import { assertAuthenticated } from "@/lib/auth";

const businessSelectWithLocation =
  "id,name,category,description,zone,address,phone,lat,lng,status,rating,opening_time,closing_time,created_at,updated_at";

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
  "Repostería",
  "Medicamento",
  "Suplemento",
  "Higiene",
  "Limpieza",
  "Papelería",
  "Electrónica",
  "Ropa",
  "Calzado",
  "Hogar",
  "Herramienta",
  "Ferretería",
  "Juguete",
  "Mascota",
  "Trámite",
  "Mandado",
  "Traslado",
  "Servicio",
  "Otro"
] as const;


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
  rating: number | null;
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
  category?: string | null;
  description?: string | null;
  zone?: string | null;
  address?: string | null;
  phone?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  status?: string | null;
  rating?: string | number | null;
  opening_time?: string | null;
  closing_time?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ProductRow = {
  id: string;
  business_id?: string | null;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  price?: number | string | null;
  available?: boolean | null;
  status?: string | null;
  search_tags?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
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
  return mergeBusinesses(await getRemoteCatalogBusinesses());
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
  const remoteProducts = await getRemoteCatalogProducts(businesses);
  return mergeProducts(remoteProducts, businesses, includeUnavailable);
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

  await assertAuthenticated();

  if (!supabase) {
    throw new Error("Supabase no está disponible para guardar el negocio.");
  }

  const { data, error } = await supabase
    .from("businesses")
    .insert(buildBusinessPayload(business))
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.id) {
    throw new Error("No se pudo confirmar el negocio en Supabase.");
  }

  business.id = data.id;
  return business;
}

export async function createCatalogProduct(input: Omit<CatalogProduct, "id">) {
  const product: CatalogProduct = {
    ...input,
    id: crypto.randomUUID()
  };

  await assertAuthenticated();

  if (!supabase) {
    throw new Error("Supabase no está disponible para guardar el producto.");
  }

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
  return product;
}

export async function updateCatalogBusiness(input: CatalogBusiness) {
  const business = input;

  await assertAuthenticated();

  if (!supabase) {
    throw new Error("Supabase no está disponible para actualizar el negocio.");
  }

  const { error } = await supabase
    .from("businesses")
    .update(buildBusinessPayload(business))
    .eq("id", business.id);

  if (error) {
    throw new Error(error.message);
  }

  return business;
}

export async function updateCatalogProduct(input: CatalogProduct) {
  const product = input;

  await assertAuthenticated();

  if (!supabase) {
    throw new Error("Supabase no está disponible para actualizar el producto.");
  }

  const { error } = await supabase
    .from("products")
    .update(buildProductPayload(product))
    .eq("id", product.id);

  if (error) {
    throw new Error(error.message);
  }

  return product;
}

export async function deleteCatalogBusiness(id: string) {
  await assertAuthenticated();

  if (!supabase) {
    throw new Error("Supabase no está disponible para eliminar el negocio.");
  }

  const { error } = await supabase
    .from("businesses")
    .update({ status: "inactivo" })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteCatalogProduct(id: string) {
  await assertAuthenticated();

  if (!supabase) {
    throw new Error("Supabase no está disponible para eliminar el producto.");
  }

  const { error } = await supabase
    .from("products")
    .update({
      available: false,
      status: "pausado"
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
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
    .filter((product) => {
      if (!businessesById.has(product.businessId)) return false;
      return includeUnavailable || (product.available && product.status === "disponible");
    });
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
      throw new Error(error.message);
    }

    return (data ?? []).filter(isActiveBusinessRow).map(mapBusinessRow);
  } catch (error) {
    console.error("Error fetching businesses:", error);
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
      .select("id,business_id,name,description,category,price,available,status,search_tags,created_at,updated_at")
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
  const status = row.status === "activo" ? "activo" : "inactivo";

  return {
    id: row.id,
    name: row.name || "Negocio local",
    category: normalizeSector(row.category),
    zone: row.zone || "Zona local",
    baseText: row.address || row.description || row.zone || "Base operativa del negocio",
    phone: row.phone || "",
    lat: toFiniteNumber(row.lat),
    lng: toFiniteNumber(row.lng),
    status,
    estimatedTime: "15-25 min",
    rating: (() => {
      if (row.rating == null) return null;
      const n = Number(row.rating);
      return Number.isFinite(n) ? n : null;
    })(),
    availability: buildAvailability(row.opening_time, row.closing_time),
    availabilityStart: normalizeTimeToHHmm(row.opening_time) || "",
    availabilityEnd: normalizeTimeToHHmm(row.closing_time) || ""
  };
}

function mapProductRow(row: ProductRow, businessesById: Map<string, CatalogBusiness>): CatalogProduct {
  const businessId = row.business_id || "";
  const business = businessesById.get(businessId);

  const status = normalizeProductStatus(row.status);
  return {
    id: row.id,
    businessId,
    businessName: business?.name || "Negocio local",
    businessZone: business?.zone || "",
    businessBaseText: business?.baseText || business?.zone || "",
    businessLat: business?.lat ?? null,
    businessLng: business?.lng ?? null,
    sector: business?.category || "Otro",
    name: row.name || "Producto local",
    description: row.description || "",
    category: normalizeProductCategory(row.category),
    price: toFiniteNumber(row.price) ?? 0,
    available: status === "disponible" && (row.available ?? true),
    status,
    availability: business?.availability || "",
    availabilityInherited: true,
    searchTags: row.search_tags || ""
  };
}

function isActiveBusinessRow(row: BusinessRow) {
  return row.status === "activo";
}

function isActiveProductRow(row: ProductRow) {
  return row.available !== false && row.status !== "pausado";
}

function normalizeSector(value: string | null | undefined): BusinessSector {
  if (value === "Abarrotes") return "Mandados";
  if (value === "Trámites") return "Servicios";
  if (businessSectors.includes(value as BusinessSector)) return value as BusinessSector;
  // Preserve custom category strings instead of collapsing to "Otro"
  return (value && value.trim()) ? (value as BusinessSector) : "Otro";
}

function normalizeProductCategory(value: string | null | undefined): ProductCategory {
  if (productCategories.includes(value as ProductCategory)) return value as ProductCategory;
  return (value && value.trim()) ? (value as ProductCategory) : "Otro";
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

function buildBusinessPayload(business: CatalogBusiness) {
  const parsedRating = (() => {
    if (business.rating == null) return null;
    const n = typeof business.rating === "number" ? business.rating : Number(business.rating as unknown as number);
    return Number.isFinite(n) ? n : null;
  })();

  return {
    name: business.name,
    category: business.category,
    description: business.baseText || `${business.category} en ${business.zone}`,
    zone: business.zone,
    address: business.baseText,
    phone: business.phone,
    lat: business.lat,
    lng: business.lng,
    status: business.status === "activo" ? "activo" : "inactivo",
    rating: parsedRating,
    opening_time: business.availabilityStart,
    closing_time: business.availabilityEnd
  };
}

function buildProductPayload(product: CatalogProduct) {
  return {
    business_id: product.businessId,
    name: product.name,
    description: product.description,
    category: product.category,
    price: product.price,
    available: product.available,
    status: product.status,
    search_tags: product.searchTags
  };
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const exists = items.some((item) => item.id === nextItem.id);

  if (!exists) {
    return [nextItem, ...items];
  }

  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
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

// ── Business-owned operations (no admin JWT required) ────────────────────────

export async function updateBusinessProfile(
  id: string,
  fields: {
    name: string;
    category: string;
    zone: string;
    baseText: string;
    lat: number;
    lng: number;
    availabilityStart: string;
    availabilityEnd: string;
  }
): Promise<void> {
  if (!supabase) throw new Error("Supabase no disponible.");
  const { error } = await supabase
    .from("businesses")
    .update({
      name: fields.name,
      category: fields.category,
      zone: fields.zone,
      description: fields.baseText,
      address: fields.baseText,
      lat: fields.lat,
      lng: fields.lng,
      opening_time: fields.availabilityStart || null,
      closing_time: fields.availabilityEnd || null,
      status: "activo"
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getBusinessOwnProducts(
  businessId: string,
  business: CatalogBusiness
): Promise<CatalogProduct[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("products")
    .select(
      "id,business_id,name,description,category,price,available,status,search_tags,created_at,updated_at"
    )
    .eq("business_id", businessId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  const businessesById = new Map([[businessId, business]]);
  return data.map((row) => mapProductRow(row as ProductRow, businessesById));
}

export async function upsertBusinessProduct(product: CatalogProduct): Promise<string> {
  if (!supabase) throw new Error("Supabase no disponible.");
  const payload = buildProductPayload(product);
  const isNew = !product.id || product.id.startsWith("prod_");
  if (isNew) {
    const { data, error } = await supabase
      .from("products")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (!data?.id) throw new Error("No se recibió el ID del producto.");
    return data.id as string;
  }
  const { error } = await supabase
    .from("products")
    .update(payload)
    .eq("id", product.id);
  if (error) throw new Error(error.message);
  return product.id;
}

