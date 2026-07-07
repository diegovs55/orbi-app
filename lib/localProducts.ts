import type { CatalogProduct } from "@/lib/catalog";

const KEY = "orbi_local_products";

type ProductStore = Record<string, CatalogProduct[]>;

function readStore(): ProductStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as ProductStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: ProductStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new Event("orbi-local-products-change"));
}

export function getLocalProducts(businessId: string): CatalogProduct[] {
  return readStore()[businessId] ?? [];
}

export function upsertLocalProduct(businessId: string, product: CatalogProduct): void {
  const store = readStore();
  const list = store[businessId] ?? [];
  const idx = list.findIndex((p) => p.id === product.id);
  store[businessId] = idx >= 0
    ? list.map((p) => (p.id === product.id ? product : p))
    : [product, ...list];
  writeStore(store);
}

export function toggleLocalProductStatus(businessId: string, productId: string): CatalogProduct | null {
  const store = readStore();
  const list = store[businessId] ?? [];
  let toggled: CatalogProduct | null = null;
  store[businessId] = list.map((p) => {
    if (p.id !== productId) return p;
    const next = p.status === "disponible" ? "pausado" : "disponible";
    toggled = { ...p, status: next, available: next === "disponible" };
    return toggled;
  });
  writeStore(store);
  return toggled;
}

export function getAllLocalProducts(): Array<{ businessId: string; products: CatalogProduct[] }> {
  const store = readStore();
  return Object.entries(store)
    .filter(([, products]) => products.length > 0)
    .map(([businessId, products]) => ({ businessId, products }));
}
