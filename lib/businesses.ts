export const BUSINESS_STORAGE_KEY = "orbi_affiliated_businesses";
const EMPTY_LOCAL_BUSINESSES: AffiliateBusiness[] = [];
let cachedRawBusinesses: string | null = null;
let cachedLocalBusinesses: AffiliateBusiness[] = EMPTY_LOCAL_BUSINESSES;

export const businessCategories = [
  "Café y comida",
  "Farmacia",
  "Papelería",
  "Regalos",
  "Mandados"
] as const;

export type BusinessCategory = (typeof businessCategories)[number];

export type BusinessStatus = "Disponible" | "No disponible";

export type AffiliateBusiness = {
  id: string;
  name: string;
  category: BusinessCategory;
  description: string;
  estimatedTime: string;
  status: BusinessStatus;
  rating: string;
  source?: "seed" | "local";
};

export const seedBusinesses: AffiliateBusiness[] = [
  {
    id: "seed-regina-cafe",
    name: "Regina Café",
    category: "Café y comida",
    description: "Pide desayuno, café o snacks sin salir de casa.",
    estimatedTime: "15–25 min",
    status: "Disponible",
    rating: "4.8",
    source: "seed"
  },
  {
    id: "seed-panaderia-lupita",
    name: "Panadería Lupita",
    category: "Café y comida",
    description: "Pan dulce, café y antojos listos para entrega local.",
    estimatedTime: "15–25 min",
    status: "Disponible",
    rating: "4.7",
    source: "seed"
  },
  {
    id: "seed-taqueria-central",
    name: "Taquería Central",
    category: "Café y comida",
    description: "Tacos y comidas rápidas coordinadas por Orbi.",
    estimatedTime: "20–30 min",
    status: "Disponible",
    rating: "4.8",
    source: "seed"
  },
  {
    id: "seed-farmacia-san-antonio",
    name: "Farmacia San Antonio",
    category: "Farmacia",
    description: "Medicamentos y artículos urgentes entregados rápido.",
    estimatedTime: "15–25 min",
    status: "Disponible",
    rating: "4.9",
    source: "seed"
  },
  {
    id: "seed-botiquin-express",
    name: "Botiquín Express",
    category: "Farmacia",
    description: "Cuidado personal y productos de emergencia en ruta.",
    estimatedTime: "15–25 min",
    status: "Disponible",
    rating: "4.8",
    source: "seed"
  },
  {
    id: "seed-salud-24h",
    name: "Salud 24h",
    category: "Farmacia",
    description: "Pedidos de farmacia para necesidades del día.",
    estimatedTime: "20–35 min",
    status: "Disponible",
    rating: "4.7",
    source: "seed"
  },
  {
    id: "seed-papeleria-centro",
    name: "Papelería Centro",
    category: "Papelería",
    description: "Copias, impresiones y útiles cuando los necesitas.",
    estimatedTime: "15–25 min",
    status: "Disponible",
    rating: "4.7",
    source: "seed"
  },
  {
    id: "seed-copias-express",
    name: "Copias Express",
    category: "Papelería",
    description: "Impresiones y copias listas para recoger o enviar.",
    estimatedTime: "15–25 min",
    status: "Disponible",
    rating: "4.8",
    source: "seed"
  },
  {
    id: "seed-utiles-lupita",
    name: "Útiles Lupita",
    category: "Papelería",
    description: "Material escolar y oficina con entrega cercana.",
    estimatedTime: "20–30 min",
    status: "Disponible",
    rating: "4.7",
    source: "seed"
  },
  {
    id: "seed-floreria-dluz",
    name: "Florería D’Luz",
    category: "Regalos",
    description: "Flores, detalles y sorpresas en ruta.",
    estimatedTime: "20–35 min",
    status: "Disponible",
    rating: "4.8",
    source: "seed"
  },
  {
    id: "seed-sorpresas-regina",
    name: "Sorpresas Regina",
    category: "Regalos",
    description: "Regalos rápidos para cumpleaños y fechas especiales.",
    estimatedTime: "20–35 min",
    status: "Disponible",
    rating: "4.9",
    source: "seed"
  },
  {
    id: "seed-detalles-ana",
    name: "Detalles Ana",
    category: "Regalos",
    description: "Detalles personalizados coordinados por Orbi.",
    estimatedTime: "25–40 min",
    status: "Disponible",
    rating: "4.8",
    source: "seed"
  },
  {
    id: "seed-orbi-express",
    name: "Orbi Express",
    category: "Mandados",
    description: "Compras, pagos y vueltas coordinadas por Orbi.",
    estimatedTime: "15–25 min",
    status: "Disponible",
    rating: "4.9",
    source: "seed"
  },
  {
    id: "seed-ruta-corta",
    name: "Ruta Corta",
    category: "Mandados",
    description: "Recorridos cercanos para recoger y entregar.",
    estimatedTime: "15–25 min",
    status: "Disponible",
    rating: "4.8",
    source: "seed"
  },
  {
    id: "seed-recados-pro",
    name: "Recados Pro",
    category: "Mandados",
    description: "Mandados locales con seguimiento rápido.",
    estimatedTime: "20–30 min",
    status: "Disponible",
    rating: "4.8",
    source: "seed"
  }
];

export function readLocalBusinesses() {
  if (typeof window === "undefined") {
    return EMPTY_LOCAL_BUSINESSES;
  }

  try {
    const rawBusinesses = window.localStorage.getItem(BUSINESS_STORAGE_KEY);
    if (!rawBusinesses) {
      cachedRawBusinesses = null;
      cachedLocalBusinesses = EMPTY_LOCAL_BUSINESSES;
      return cachedLocalBusinesses;
    }

    if (rawBusinesses === cachedRawBusinesses) {
      return cachedLocalBusinesses;
    }

    const businesses = JSON.parse(rawBusinesses) as AffiliateBusiness[];
    cachedRawBusinesses = rawBusinesses;
    cachedLocalBusinesses = businesses.filter(isAffiliateBusiness);
    return cachedLocalBusinesses;
  } catch {
    cachedRawBusinesses = null;
    cachedLocalBusinesses = EMPTY_LOCAL_BUSINESSES;
    return cachedLocalBusinesses;
  }
}

export function writeLocalBusinesses(businesses: AffiliateBusiness[]) {
  window.localStorage.setItem(BUSINESS_STORAGE_KEY, JSON.stringify(businesses));
  window.dispatchEvent(new Event("orbi-businesses-change"));
}

export function createBusinessId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `business-${Date.now()}`;
}

function isAffiliateBusiness(value: unknown): value is AffiliateBusiness {
  if (!value || typeof value !== "object") {
    return false;
  }

  const business = value as Partial<AffiliateBusiness>;
  return (
    typeof business.id === "string" &&
    typeof business.name === "string" &&
    businessCategories.includes(business.category as BusinessCategory) &&
    typeof business.description === "string" &&
    typeof business.estimatedTime === "string" &&
    (business.status === "Disponible" || business.status === "No disponible") &&
    typeof business.rating === "string"
  );
}
