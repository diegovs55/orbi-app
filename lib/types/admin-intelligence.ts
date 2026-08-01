export type ActivityPeriod = "hoy" | "7d" | "mes" | "anio" | "todo" | "custom";

export type ActivitySummary = {
  period: ActivityPeriod;
  fromISO: string | null;
  toISO: string | null;
  misionesCumplidas: number;
  facturacionTotal: number;
  ticketPromedio: number | null;
  comisionOrbi: number;
  pagoAgentes: number;
  ingresoNegocios: number | null;
  misionesConSubtotal: number;
  tiposServicio: Array<{ tipo: string; count: number; facturacion: number }>;
  negociosActivos: Array<{
    businessId: string;
    businessName: string;
    misiones: number;
    facturacion: number;
    ticketPromedio: number;
    comisionOrbi: number;
    pagoAgente: number;
    ingresoNegocio: number | null;
  }>;
};

export type ActivitySearchGroup = {
  kind: "negocio" | "servicio";
  businessId: string | null;
  businessName: string | null;
  serviceType: string;
  misiones: number;
  facturacion: number;
  ticketPromedio: number | null;
  comisionOrbi: number;
  pagoAgente: number;
  ingresoNegocio: number | null;
  misionesConSubtotal: number;
  sample: Array<{
    id: string;
    productName: string | null;
    serviceType: string;
    totalAmount: number;
    createdAt: string;
  }>;
  cobertura: string | null;
};

export type ActivitySearchResponse = {
  query: string;
  total: number;
  groups: ActivitySearchGroup[];
};

export type OfferBusiness = {
  id: string;
  name: string;
  zone: string;
  category: string;
  productCount: number;
  priceMin: number | null;
  priceMax: number | null;
  priceAvg: number | null;
  lastProductUpdate: string | null;
  businessUpdatedAt: string;
};

export type OfferSummary = {
  businesses: OfferBusiness[];
  totals: {
    businesses: number;
    products: number;
    zones: number;
    sectors: number;
  };
};

export type SearchResultItem = {
  productId: string;
  productName: string;
  productCategory: string;
  price: number;
  status: string;
  businessId: string;
  businessName: string;
  businessZone: string;
  businessCategory: string;
};

export type SearchResponse = {
  results: SearchResultItem[];
  total: number;
  query: string;
};
