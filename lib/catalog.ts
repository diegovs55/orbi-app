import { supabase } from "@/lib/supabase";

const CATALOG_BUSINESSES_KEY = "orbi_catalog_businesses";
const CATALOG_PRODUCTS_KEY = "orbi_catalog_products";

export const businessSectors = [
  "Alimentos y bebidas",
  "Farmacia",
  "Papelería",
  "Ferretería",
  "Abarrotes",
  "Servicios",
  "Trámites",
  "Otro"
] as const;

export type BusinessSector = (typeof businessSectors)[number];
export type CatalogBusinessStatus = "activo" | "inactivo";

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
  category: string;
  price: number;
  available: boolean;
  availability: string;
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
  availability?: string | null;
  horario_disponible?: string | null;
  search_tags?: string | null;
  etiquetas_busqueda?: string | null;
};

export async function getCatalogBusinesses() {
  const localBusinesses = readLocalCatalogBusinesses();
  const remoteBusinesses = await getRemoteCatalogBusinesses();

  if (remoteBusinesses.length || localBusinesses.length) {
    return mergeBusinesses([...remoteBusinesses, ...localBusinesses]);
  }

  return demoBusinesses;
}

export async function getCatalogProducts() {
  const businesses = await getCatalogBusinesses();
  const localProducts = readLocalCatalogProducts();
  const remoteProducts = await getRemoteCatalogProducts(businesses);
  const products = mergeProducts([...remoteProducts, ...localProducts], businesses);

  return products.length ? products : demoProducts;
}

export async function getCatalogItems() {
  return getCatalogProducts();
}

export async function createCatalogBusiness(input: Omit<CatalogBusiness, "id">) {
  const business: CatalogBusiness = {
    ...input,
    id: crypto.randomUUID()
  };

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("businesses")
        .insert({
          nombre_negocio: business.name,
          categoria_negocio: business.category,
          zona: business.zone,
          base_text: business.baseText,
          direccion: business.baseText,
          telefono: business.phone,
          ubicacion_lat: business.lat,
          ubicacion_lng: business.lng,
          estado: business.status,
          name: business.name,
          category: business.category,
          description: `${business.category} en ${business.zone}`,
          estimated_time: business.estimatedTime,
          status: business.status === "activo" ? "Disponible" : "No disponible",
          rating: business.rating,
          is_active: business.status === "activo"
        })
        .select("id")
        .maybeSingle();

      if (!error && data?.id) {
        business.id = data.id;
      }
    }
  } catch {
    // Local fallback keeps the MVP usable while Supabase schema catches up.
  }

  saveLocalCatalogBusinesses([business, ...readLocalCatalogBusinesses()]);
  return business;
}

export async function createCatalogProduct(input: Omit<CatalogProduct, "id">) {
  const product: CatalogProduct = {
    ...input,
    id: crypto.randomUUID()
  };

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("products")
        .insert({
          business_id: product.businessId,
          negocio_id: product.businessId,
          name: product.name,
          nombre_producto: product.name,
          description: product.description,
          descripcion: product.description,
          category: product.category,
          categoria_producto: product.category,
          price: product.price,
          precio_venta: product.price,
          available: product.available,
          disponible: product.available,
          availability: product.availability,
          horario_disponible: product.availability,
          search_tags: product.searchTags,
          etiquetas_busqueda: product.searchTags
        })
        .select("id")
        .maybeSingle();

      if (!error && data?.id) {
        product.id = data.id;
      }
    }
  } catch {
    // Local fallback keeps the MVP usable while Supabase schema catches up.
  }

  saveLocalCatalogProducts([product, ...readLocalCatalogProducts()]);
  return product;
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

function mergeProducts(products: CatalogProduct[], businesses: CatalogBusiness[]) {
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
            sector: business.category
          }
        : product;
    })
    .filter((product) => product.available);
}

async function getRemoteCatalogBusinesses() {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("businesses")
      .select("id,name,nombre_negocio,category,categoria_negocio,zone,zona,base_text,direccion,phone,telefono,lat,lng,location_lat,location_lng,ubicacion_lat,ubicacion_lng,status,estado,estimated_time,rating,is_active,deleted_at")
      .order("name", { ascending: true });

    if (error) {
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
      .select("id,business_id,negocio_id,name,nombre_producto,description,descripcion,category,categoria_producto,price,precio_venta,available,disponible,availability,horario_disponible,search_tags,etiquetas_busqueda")
      .order("name", { ascending: true });

    if (error) {
      return [];
    }

    return (data ?? []).map((row) => mapProductRow(row, businessesById));
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
    rating: String(row.rating ?? "4.8")
  };
}

function mapProductRow(row: ProductRow, businessesById: Map<string, CatalogBusiness>): CatalogProduct {
  const businessId = row.negocio_id || row.business_id || "";
  const business = businessesById.get(businessId);

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
    category: row.categoria_producto || row.category || "General",
    price: toFiniteNumber(row.precio_venta ?? row.price) ?? 0,
    available: row.disponible ?? row.available ?? true,
    availability: row.horario_disponible || row.availability || "",
    searchTags: row.etiquetas_busqueda || row.search_tags || ""
  };
}

function isActiveBusinessRow(row: BusinessRow) {
  return row.deleted_at == null && row.is_active !== false && row.estado !== "inactivo";
}

function normalizeSector(value: string | null | undefined): BusinessSector {
  return businessSectors.includes(value as BusinessSector) ? (value as BusinessSector) : "Otro";
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

const demoBusinesses: CatalogBusiness[] = [
  {
    id: "demo-regina-cafe",
    name: "Regina Café",
    category: "Alimentos y bebidas",
    zone: "Centro",
    baseText: "Centro de Zumpahuacán",
    phone: "",
    lat: 18.8349,
    lng: -99.5818,
    status: "activo",
    estimatedTime: "15-25 min",
    rating: "4.8"
  },
  {
    id: "demo-farmacia-san-antonio",
    name: "Farmacia San Antonio",
    category: "Farmacia",
    zone: "Centro",
    baseText: "Centro de Zumpahuacán",
    phone: "",
    lat: 18.8349,
    lng: -99.5818,
    status: "activo",
    estimatedTime: "15-25 min",
    rating: "4.7"
  },
  {
    id: "demo-papeleria-centro",
    name: "Papelería Centro",
    category: "Papelería",
    zone: "Centro",
    baseText: "Centro de Zumpahuacán",
    phone: "",
    lat: 18.8349,
    lng: -99.5818,
    status: "activo",
    estimatedTime: "15-25 min",
    rating: "4.8"
  }
];

const demoProducts: CatalogProduct[] = [
  {
    id: "demo-frappe-moka",
    businessId: "demo-regina-cafe",
    businessName: "Regina Café",
    businessZone: "Centro",
    businessBaseText: "Centro de Zumpahuacán",
    businessLat: 18.8349,
    businessLng: -99.5818,
    sector: "Alimentos y bebidas",
    name: "Frappe moka",
    description: "Bebida fría preparada al momento.",
    category: "Bebidas frías",
    price: 65,
    available: true,
    availability: "08:00 - 20:00",
    searchTags: "frappe café cafe moka bebida desayuno snacks"
  },
  {
    id: "demo-frappe-oreo",
    businessId: "demo-regina-cafe",
    businessName: "Regina Café",
    businessZone: "Centro",
    businessBaseText: "Centro de Zumpahuacán",
    businessLat: 18.8349,
    businessLng: -99.5818,
    sector: "Alimentos y bebidas",
    name: "Frappe oreo",
    description: "Frappe dulce con galleta.",
    category: "Bebidas frías",
    price: 70,
    available: true,
    availability: "08:00 - 20:00",
    searchTags: "frappe oreo café cafe bebida"
  },
  {
    id: "demo-medicina",
    businessId: "demo-farmacia-san-antonio",
    businessName: "Farmacia San Antonio",
    businessZone: "Centro",
    businessBaseText: "Centro de Zumpahuacán",
    businessLat: 18.8349,
    businessLng: -99.5818,
    sector: "Farmacia",
    name: "Medicamento general",
    description: "Compra asistida de medicamento sujeto a disponibilidad.",
    category: "Medicamentos",
    price: 0,
    available: true,
    availability: "09:00 - 21:00",
    searchTags: "medicina medicamento farmacia dolor urgente"
  },
  {
    id: "demo-impresiones",
    businessId: "demo-papeleria-centro",
    businessName: "Papelería Centro",
    businessZone: "Centro",
    businessBaseText: "Centro de Zumpahuacán",
    businessLat: 18.8349,
    businessLng: -99.5818,
    sector: "Papelería",
    name: "Impresiones",
    description: "Impresiones y copias para entrega local.",
    category: "Copias e impresiones",
    price: 5,
    available: true,
    availability: "09:00 - 19:00",
    searchTags: "impresiones copias papelería papeleria útiles utiles"
  }
];
