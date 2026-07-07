"use client";

import {
  ClipboardList,
  CreditCard,
  LocateFixed,
  MapPin,
  PackageCheck,
  Radar,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Truck,
  UserRound
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  AGENT_STATUS,
  AgentServiceType,
  AgentTrustLevel,
  agentLevels,
  agentServiceTypes,
  getAgentOperatingEligibility,
  getAgentLocation,
  getAgents,
  OrbiAgent
} from "@/lib/agents";
import { supabase, subscribeToAgents, subscribeToBusinesses, subscribeToProducts } from "@/lib/supabase";
import { CostBreakdown } from "@/components/CostBreakdown";
import { estimateMissionCost, calculateServiceFee, PRICING_RULE, CATALOG } from "@/lib/pricing";
import { CatalogProduct, CatalogSearchResult, getCatalogItems, searchCatalog } from "@/lib/catalog";
import {
  upsertGuestCustomerFromMission,
  getCurrentCustomerSession,
  loginCustomerWithSupabase,
  registerCustomerAccount,
  saveCustomerSession,
} from "@/lib/customers";
import {
  ActiveMission,
  cancelMissionByCustomer,
  createMission,
  getActiveMission,
  getMissionStatusLabel,
  isMissionActive,
  subscribeToMission,
  updateActiveMission
} from "@/lib/missions";
import { fetchRoute } from "@/lib/routing";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { MissionOrbitTracker } from "@/components/MissionOrbitTracker";

const LocationPickerMap = dynamic(
  async () => {
    try {
      const mod = await import("@/components/LocationPickerMap");
      return mod.default ?? mod.LocationPickerMap;
    } catch {
      // Return a simple named fallback component to avoid crashing the app when chunk fails
      const LocationMapFallback = () => (
        <div className="flex h-full min-h-[320px] items-center justify-center bg-orbi-black text-sm font-semibold text-orbi-muted">
          No fue posible cargar el mapa.
        </div>
      );

      LocationMapFallback.displayName = "LocationMapFallback";
      return LocationMapFallback;
    }
  },
  {
    loading: () => (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-orbi-black text-sm font-semibold text-orbi-muted">
        Cargando mapa...
      </div>
    ),
    ssr: false
  }
);

const services = [
  {
    label: "Mandado",
    compatibleType: "Mandados",
    description: "Vueltas rápidas, recados y apoyo local.",
    icon: ClipboardList
  },
  {
    label: "Entrega",
    compatibleType: "Entregas",
    description: "Mover productos, paquetes o documentos.",
    icon: Truck
  },
  {
    label: "Traslado",
    compatibleType: "Traslados",
    description: "Coordinar movilidad punto a punto.",
    icon: MapPin
  },
  {
    label: "Compra local",
    compatibleType: "Compras",
    description: "Comprar en comercios cercanos por ti.",
    icon: ShoppingBag
  },
  {
    label: "Recolección",
    compatibleType: "Recolecciones",
    description: "Recoger artículos y llevarlos a destino.",
    icon: PackageCheck
  },
  {
    label: "Pago o trámite",
    compatibleType: "Mandados",
    description: "Pagos, filas, gestiones y vueltas.",
    icon: CreditCard
  }
] as const;

type ServiceOption = (typeof services)[number];

type CartItem = {
  product: CatalogSearchResult;
  quantity: number;
};

type RequestDetails = {
  origin: string;
  originLat: number | null;
  originLng: number | null;
  destination: string;
  destinationLat: number | null;
  destinationLng: number | null;
  detail: string;
  scheduleMode: "asap" | "scheduled";
  scheduledAt: string;
  requesterName: string;
  requesterPhone: string;
};

type PaymentStatus = "Pago al finalizar la misión" | "Esta misión requiere pago al inicio";
type PaymentMethod = "Efectivo" | "Transferencia" | "Tarjeta";

const emptyDetails: RequestDetails = {
  origin: "",
  originLat: null,
  originLng: null,
  destination: "",
  destinationLat: null,
  destinationLng: null,
  detail: "",
  scheduleMode: "asap",
  scheduledAt: "",
  requesterName: "",
  requesterPhone: ""
};

const statusStyles: Record<OrbiAgent["status"], string> = {
  [AGENT_STATUS.ONLINE]: "border-orbi-cyan/25 bg-orbi-blue/10 text-orbi-cyan",
  [AGENT_STATUS.OFFLINE]: "border-white/10 bg-white/5 text-orbi-muted"
};

type LocationTarget = "origin" | "destination";
type DraftSection = "pedido" | "destino" | "solicitante" | "resumen";
type WizardStep = "servicio" | "pedido" | "destino" | "solicitante" | "agente" | "confirmacion";
type ConfirmedDraftSections = Record<"pedido" | "destino" | "solicitante", boolean>;

type MapPoint = {
  lat: number;
  lng: number;
};

type GeocodeState = Record<
  LocationTarget,
  {
    isLoading: boolean;
    message: string;
    tone: "success" | "warning" | "";
  }
>;

const initialGeocodeState: GeocodeState = {
  origin: { isLoading: false, message: "", tone: "" },
  destination: { isLoading: false, message: "", tone: "" }
};

const activeAgentStatus: OrbiAgent["status"] = AGENT_STATUS.ONLINE;
const zumpahuacanCenter: MapPoint = { lat: 18.8349, lng: -99.5818 };
const paymentStatuses: PaymentStatus[] = [
  "Pago al finalizar la misión",
  "Esta misión requiere pago al inicio"
];
const paymentMethods: PaymentMethod[] = ["Efectivo", "Transferencia", "Tarjeta"];
const pricingRule = PRICING_RULE;

export function ServiceRequestFlow() {
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);
  const [selectedStep, setSelectedStep] = useState<WizardStep>("servicio");
  const [showConfirmationDetails, setShowConfirmationDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState<CatalogProduct[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartMessage, setCartMessage] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [details, setDetails] = useState<RequestDetails>(emptyDetails);
  const [isRequestReady, setIsRequestReady] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<OrbiAgent | null>(null);
  const [agents, setAgents] = useState<OrbiAgent[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [agentError, setAgentError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [geocodeState, setGeocodeState] = useState<GeocodeState>(initialGeocodeState);
  const [mapTarget, setMapTarget] = useState<LocationTarget | null>(null);
  const [mapPoint, setMapPoint] = useState<MapPoint>(zumpahuacanCenter);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Pago al finalizar la misión");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Efectivo");
  const [requestStatusMessage, setRequestStatusMessage] = useState("");
  // Initialized as null to avoid SSR/client hydration mismatch (localStorage
  // is unavailable on the server). The useEffect below loads the real value.
  const [activeMission, setActiveMission] = useState<ActiveMission | null>(null);
  const [expandedDraftSection, setExpandedDraftSection] = useState<DraftSection | null>(null);
  const [isCartDetailExpanded, setIsCartDetailExpanded] = useState(false);
  const [showWaitingCancelConfirm, setShowWaitingCancelConfirm] = useState(false);
  const [waitingRequestMessage, setWaitingRequestMessage] = useState("");
  const [customerSession, setCustomerSession] = useState<{ name: string; phone: string; email?: string } | null>(null);
  const [sessionSource, setSessionSource] = useState<"auth" | "local" | null>(null);
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  const [confirmedDraftSections, setConfirmedDraftSections] = useState<ConfirmedDraftSections>(() =>
    getInitialConfirmedDraftSections(null)
  );

  const router = useRouter();
  const [isSending, setIsSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orbitExperienceActive, setOrbitExperienceActive] = useState(false);
  const [sentMission, setSentMission] = useState<ActiveMission | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const isOrbitPending = activeMission?.status === "por_tomar" && activeMission.selected_agent_id;
  const isOrbitExperienceActive = orbitExperienceActive;

  const isServiceStage = selectedStep === "servicio";
  const isPedidoStage = selectedStep === "pedido";
  const isDestinoStage = selectedStep === "destino";
  const isSolicitanteStage = selectedStep === "solicitante";
  const isAgentStage = selectedStep === "agente";
  const isConfirmStage = selectedStep === "confirmacion";

  function goToStep(step: WizardStep) {
    if (step === "servicio") {
      setSelectedStep("servicio");
      setIsRequestReady(false);
      setExpandedDraftSection("pedido");
      return;
    }

    if (step === "pedido") {
      setSelectedStep("pedido");
      setIsRequestReady(false);
      setExpandedDraftSection("pedido");
      return;
    }

    if (step === "destino") {
      setSelectedStep("destino");
      setIsRequestReady(false);
      setExpandedDraftSection("destino");
      return;
    }

    if (step === "solicitante") {
      setSelectedStep("solicitante");
      setIsRequestReady(false);
      setExpandedDraftSection("solicitante");
      return;
    }

    if (step === "agente") {
      setSelectedStep("agente");
      setIsRequestReady(true);
      setExpandedDraftSection(null);
      return;
    }

    if (step === "confirmacion") {
      if (!selectedAgent) {
        setSelectedStep("agente");
        setIsRequestReady(true);
        setExpandedDraftSection(null);
        return;
      }

      if (!orderIsConfirmed) {
        setSelectedStep("pedido");
        return;
      }

      if (!destinationIsConfirmed) {
        setSelectedStep("destino");
        return;
      }

      if (!requesterIsConfirmed) {
        setSelectedStep("solicitante");
        return;
      }

      setSelectedStep("confirmacion");
      setIsRequestReady(true);
      return;
    }
  }

  function goBack() {
    if (selectedStep === "pedido") {
      goToStep("servicio");
      return;
    }
    if (selectedStep === "destino") {
      goToStep("pedido");
      return;
    }
    if (selectedStep === "solicitante") {
      goToStep("destino");
      return;
    }
    if (selectedStep === "agente") {
      goToStep("solicitante");
      return;
    }
    if (selectedStep === "confirmacion") {
      goToStep("agente");
      return;
    }
  }

  useEffect(() => {
    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      if (!isActive) {
        return;
      }

      setAgentError("La consulta de agentes tardó demasiado. Revisa la conexión con Supabase.");
      setIsLoadingAgents(false);
    }, 8000);

    getAgents()
      .then((nextAgents) => {
        if (!isActive) {
          return;
        }

        window.clearTimeout(timeoutId);
        setAgents(nextAgents);
        setAgentError("");
      })
      .catch((caughtError: unknown) => {
        if (!isActive) {
          return;
        }

        window.clearTimeout(timeoutId);
        setAgents([]);
        setAgentError(
          caughtError instanceof Error
            ? caughtError.message
            : "No fue posible cargar agentes compatibles."
        );
      })
      .finally(() => {
        if (isActive) {
          window.clearTimeout(timeoutId);
          setIsLoadingAgents(false);
        }
      });

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    const unsubscribe = subscribeToAgents(async () => {
      if (!isActive) {
        return;
      }

      try {
        const nextAgents = await getAgents();
        if (!isActive) {
          return;
        }

        setAgents(nextAgents);
        setAgentError("");
      } catch {
        // Keep the current agent list if realtime refresh fails.
      }
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return subscribeToMission(() => setActiveMission(getActiveMission()));
  }, []);

  // Autofill solicitante — Auth is source of truth, localStorage is fallback.
  // Runs once on mount (SSR-safe). Two-phase: localStorage fills immediately,
  // then Supabase Auth upgrades the source if the customer is authenticated.
  useEffect(() => {
    let cancelled = false;

    // Phase 1 — immediate sync fill from localStorage
    const localSession = getCurrentCustomerSession();
    if (localSession) {
      setCustomerSession(localSession);
      setSessionSource("local");
      setDetails((prev) => {
        if (prev.requesterName || prev.requesterPhone) return prev;
        return { ...prev, requesterName: localSession.name, requesterPhone: localSession.phone };
      });
    }

    // Phase 2 — upgrade to Supabase Auth if available (~200 ms async)
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      const meta = user.user_metadata as { name?: string; phone?: string } | undefined;
      const name = meta?.name?.trim() ?? "";
      const phone = meta?.phone?.trim() ?? "";
      if (!name && !phone) return; // authenticated but no metadata — keep localStorage
      setCustomerSession({ name, phone });
      setSessionSource("auth");
      setDetails((prev) => ({
        ...prev,
        requesterName: name || prev.requesterName,
        requesterPhone: phone || prev.requesterPhone,
      }));
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let isActive = true;

    async function refreshCatalog() {
      try {
        const items = await getCatalogItems();
        if (!isActive) {
          return;
        }

        setCatalogItems(items);
        setCatalogError("");
      } catch (caughtError: unknown) {
        if (!isActive) {
          return;
        }

        setCatalogItems([]);
        setCatalogError(
          caughtError instanceof Error
            ? caughtError.message
            : "No fue posible cargar el catálogo Orbi."
        );
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

  const compatibleAgents = useMemo(() => {
    if (!selectedService) {
      return [];
    }

    return agents
      .map((agent) => {
        const userHasOrigin = getValidCoordinatePair({
          lat: details.originLat,
          lng: details.originLng
        });
        const eligibility = getAgentOperatingEligibility(
          agent,
          selectedService.compatibleType as AgentServiceType,
          userHasOrigin
        );
        const distance = eligibility.distanceKm;
        const exclusionReason = eligibility.eligible ? "" : eligibility.reason;

        if (exclusionReason) {
          return { agent, distance, included: false };
        }

        return { agent, distance, included: true };
      })
      .filter((result) => result.included)
      .sort((a, b) => {
        if (a.distance === null && b.distance === null) {
          return a.agent.name.localeCompare(b.agent.name);
        }

        if (a.distance === null) {
          return 1;
        }

        if (b.distance === null) {
          return -1;
        }

        return a.distance - b.distance;
      })
      .map((result) => result.agent);
  }, [agents, details.originLat, details.originLng, selectedService]);

  const invalidOperationalLocationCount = useMemo(() => {
    if (!selectedService) {
      return 0;
    }

    return agents.filter(
      (agent) =>
        isServiceCompatible(agent.serviceType, selectedService.compatibleType as AgentServiceType) &&
        agent.status === activeAgentStatus &&
        agent.isOnOrbit &&
        !getValidCoordinatePair(getAgentLocation(agent) ?? {})
    ).length;
  }, [agents, selectedService]);

  const catalogResults = useMemo(() => searchCatalog(catalogItems, searchQuery), [
    catalogItems,
    searchQuery
  ]);
  const cartSubtotal = useMemo(() => getCartSubtotal(cartItems), [cartItems]);
  const cartBusiness = cartItems[0]?.product ?? null;
  const isCatalogMission = cartItems.length > 0;
  const originCoordinatePair = useMemo(
    () => getValidCoordinatePair({ lat: details.originLat, lng: details.originLng }),
    [details.originLat, details.originLng]
  );
  const destinationCoordinatePair = useMemo(
    () => getValidCoordinatePair({ lat: details.destinationLat, lng: details.destinationLng }),
    [details.destinationLat, details.destinationLng]
  );
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);

  useEffect(() => {
    if (!originCoordinatePair || !destinationCoordinatePair) {
      setRouteDistance(null);
      setRouteDuration(null);
      setRouteGeometry(null);
      return;
    }
    // Haversine as immediate fallback while routing fetch is in flight
    const haversine = calculateDistanceKm(
      originCoordinatePair.lat, originCoordinatePair.lng,
      destinationCoordinatePair.lat, destinationCoordinatePair.lng
    );
    setRouteDistance(haversine);

    let cancelled = false;
    void fetchRoute(
      originCoordinatePair.lat, originCoordinatePair.lng,
      destinationCoordinatePair.lat, destinationCoordinatePair.lng
    ).then((result) => {
      if (cancelled) return;
      if (result) {
        setRouteDistance(result.distance_km);
        setRouteDuration(result.duration_min);
        setRouteGeometry(result.geometry);
      }
      // On failure: keep haversine distance, leave geometry/duration null
    });
    return () => { cancelled = true; };
  }, [originCoordinatePair, destinationCoordinatePair]);
  const serviceFee = isCatalogMission ? calculateServiceFee(routeDistance, cartSubtotal) : null;
  const logisticsStatusMessage = getLogisticsStatusMessage({
    hasCatalogOrigin: Boolean(originCoordinatePair),
    hasDestination: Boolean(destinationCoordinatePair),
    distance: routeDistance
  });
  const orderIsComplete = isCatalogMission
    ? cartItems.length > 0
    : Boolean(details.detail.trim() && details.origin.trim());
  const destinationIsComplete = Boolean(destinationCoordinatePair);
  const requesterIsComplete = Boolean(details.requesterName.trim() && details.requesterPhone.trim());
  const orderIsConfirmed = confirmedDraftSections.pedido && orderIsComplete;
  const destinationIsConfirmed = confirmedDraftSections.destino && destinationIsComplete;
  const requesterIsConfirmed = confirmedDraftSections.solicitante && requesterIsComplete;
  const naturalDraftSection: DraftSection = !orderIsConfirmed
    ? "pedido"
    : !destinationIsConfirmed
      ? "destino"
      : !requesterIsConfirmed
        ? "solicitante"
        : "resumen";
  const activeDraftSection = expandedDraftSection ?? naturalDraftSection;

  function resetFlow() {
    setSelectedService(null);
    setSearchQuery("");
    setCartItems([]);
    setCartMessage("");
    setDetails(emptyDetails);
    setIsRequestReady(false);
    setSelectedAgent(null);
    setPaymentStatus("Pago al finalizar la misión");
    setPaymentMethod("Efectivo");
    setRequestStatusMessage("");
    setExpandedDraftSection(null);
    setIsCartDetailExpanded(false);
    setConfirmedDraftSections(getInitialConfirmedDraftSections(null));
  }

  function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCatalogMission && !originCoordinatePair) {
      setLocationError("Completa ubicación del negocio en Admin para calcular logística.");
      return;
    }

    setIsRequestReady(true);
    setSelectedStep("agente");
  }

  function updateDetails(field: keyof RequestDetails, value: string) {
    setDetails((currentDetails) => ({ ...currentDetails, [field]: value }));
  }

  function handleSelectProduct(product: CatalogSearchResult) {
    setCartMessage("");
    const businessPoint = getValidCoordinatePair({
      lat: product.businessLat,
      lng: product.businessLng
    });

    if (!businessPoint) {
      setCartMessage("Completa ubicación del negocio en Admin para calcular logística.");
      return;
    }

    const existingBusinessId = cartItems[0]?.product.businessId;
    if (existingBusinessId && existingBusinessId !== product.businessId) {
      setCartMessage("Para esta versión, crea una misión separada para otro negocio.");
      return;
    }

    const service = services.find((item) => item.label === "Compra local") ?? services[0];
    const existingItem = cartItems.find((item) => item.product.id === product.id);
    if (existingItem) {
      // Prevent accidental increments from clicking the product again.
      setCartMessage("Producto ya agregado");
        // clear search input so previous results aren't shown
        setSearchQuery("");
      return;
    }
    const nextCart = [...cartItems, { product, quantity: 1 }];
    setSelectedService(service);
    setSelectedStep("pedido");
    setCartItems(nextCart);
    // clear the search to avoid showing previous results
    setSearchQuery("");
    setExpandedDraftSection(null);
    setIsCartDetailExpanded(false);
    setConfirmedDraftSections((currentSections) => ({ ...currentSections, pedido: false }));
    setDetails((currentDetails) => ({
      ...currentDetails,
      origin: product.businessBaseText || product.businessName,
      originLat: businessPoint.lat,
      originLng: businessPoint.lng,
      detail: buildCartTicket(nextCart, null, "Define destino para calcular servicio.")
    }));
    setIsRequestReady(false);
    setSelectedAgent(null);
  }

  function handleSelectCustomMission(label: "Mandado" | "Compra local" | "Servicio personalizado") {
    const serviceLabel = label === "Servicio personalizado" ? "Mandado" : label;
    const service = services.find((item) => item.label === serviceLabel) ?? services[0];
    setSelectedService(service);
    setSelectedStep("pedido");
    setExpandedDraftSection(null);
    setIsCartDetailExpanded(false);
    setConfirmedDraftSections(getInitialConfirmedDraftSections(null));
    setCartItems([]);
    setCartMessage("");
    setDetails((currentDetails) => ({
      ...currentDetails,
      detail: searchQuery ? `Necesidad buscada: ${searchQuery}` : currentDetails.detail
    }));
  }

  function handleAddMoreProduct() {
    setSearchQuery("");
    setSelectedStep("pedido");
    setExpandedDraftSection("pedido");
    setConfirmedDraftSections((currentSections) => ({
      ...currentSections,
      pedido: false
    }));

    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  }

  function updateCartQuantity(productId: string, quantity: number) {
    const nextCart = cartItems.map((item) =>
      item.product.id === productId ? { ...item, quantity: Math.max(1, quantity) } : item
    );
    setCartItems(nextCart);
    setConfirmedDraftSections((currentSections) => ({ ...currentSections, pedido: false }));
    updateDetailsWithCart(nextCart);
  }

  function removeCartItem(productId: string) {
    const nextCart = cartItems.filter((item) => item.product.id !== productId);
    setCartItems(nextCart);
    setConfirmedDraftSections((currentSections) => ({ ...currentSections, pedido: false }));
    updateDetailsWithCart(nextCart);
  }

  function updateDetailsWithCart(nextCart: CartItem[]) {
    const business = nextCart[0]?.product;
    const businessPoint = business
      ? getValidCoordinatePair({ lat: business.businessLat, lng: business.businessLng })
      : null;
    setDetails((currentDetails) => ({
      ...currentDetails,
      origin: business ? business.businessBaseText || business.businessName : "",
      originLat: businessPoint?.lat ?? null,
      originLng: businessPoint?.lng ?? null,
      detail: nextCart.length
        ? buildCartTicket(nextCart, null, "Define destino para calcular servicio.")
        : ""
    }));
  }

  function updateLocationText(target: LocationTarget, value: string) {
    setDetails((currentDetails) => ({
      ...currentDetails,
      ...(target === "origin"
        ? { origin: value, originLat: null, originLng: null }
        : { destination: value, destinationLat: null, destinationLng: null })
    }));
    setConfirmedDraftSections((currentSections) => ({
      ...currentSections,
      [target === "origin" ? "pedido" : "destino"]: false
    }));
    updateGeocodeState(target, { isLoading: false, message: "", tone: "" });
  }

  function updateCoordinateDetails(
    target: LocationTarget,
    coords: { latitude: number; longitude: number }
  ) {
    setDetails((currentDetails) => ({
      ...currentDetails,
      ...(target === "origin"
        ? { originLat: coords.latitude, originLng: coords.longitude }
        : { destinationLat: coords.latitude, destinationLng: coords.longitude })
    }));
    setConfirmedDraftSections((currentSections) => ({
      ...currentSections,
      [target === "origin" ? "pedido" : "destino"]: false
    }));
  }

  function clearCoordinateDetails(target: LocationTarget) {
    setDetails((currentDetails) => ({
      ...currentDetails,
      ...(target === "origin"
        ? { originLat: null, originLng: null }
        : { destinationLat: null, destinationLng: null })
    }));
  }

  function handleUseCurrentLocation(target: LocationTarget) {
    setLocationError("");

    if (!navigator.geolocation) {
      setLocationError("Tu navegador no permite obtener ubicación.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        updateCoordinateDetails(target, position.coords);
        updateGeocodeState(target, {
          isLoading: false,
          message: `Ubicación encontrada: ${formatCoordinates(
            position.coords.latitude,
            position.coords.longitude
          )}`,
          tone: "success"
        });

        try {
          const address = await reverseGeocodePoint(point);
          setDetails((currentDetails) => ({
            ...currentDetails,
            ...(target === "origin"
              ? { origin: address || "Ubicación actual" }
              : { destination: address || "Ubicación actual" })
          }));
        } catch {
          setDetails((currentDetails) => ({
            ...currentDetails,
            ...(target === "origin"
              ? { origin: "Ubicación actual" }
              : { destination: "Ubicación actual" })
          }));
        }
      },
      () => {
        setLocationError("No pudimos obtener tu ubicación. Puedes escribir una referencia manual.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleOpenMap(target: LocationTarget) {
    const currentLat = target === "origin" ? details.originLat : details.destinationLat;
    const currentLng = target === "origin" ? details.originLng : details.destinationLng;
    const currentPoint = getValidCoordinatePair({ lat: currentLat, lng: currentLng });

    setMapPoint(currentPoint ?? zumpahuacanCenter);
    setMapTarget(target);

    if (!currentPoint && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMapPoint({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        () => undefined,
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }

  async function handleConfirmMapPoint() {
    if (!mapTarget) {
      return;
    }

    setIsReverseGeocoding(true);

    try {
      updateCoordinateDetails(mapTarget, {
        latitude: mapPoint.lat,
        longitude: mapPoint.lng
      });

      const address = await reverseGeocodePoint(mapPoint);
      setDetails((currentDetails) => ({
        ...currentDetails,
        ...(mapTarget === "origin"
          ? { origin: address || "Punto marcado en mapa" }
          : { destination: address || "Punto marcado en mapa" })
      }));
      updateGeocodeState(mapTarget, {
        isLoading: false,
        message: `Ubicación encontrada: ${formatCoordinates(mapPoint.lat, mapPoint.lng)}`,
        tone: "success"
      });
      setMapTarget(null);
    } catch {
      updateCoordinateDetails(mapTarget, {
        latitude: mapPoint.lat,
        longitude: mapPoint.lng
      });
      setDetails((currentDetails) => ({
        ...currentDetails,
        ...(mapTarget === "origin"
          ? { origin: "Punto marcado en mapa" }
          : { destination: "Punto marcado en mapa" })
      }));
      updateGeocodeState(mapTarget, {
        isLoading: false,
        message: `Ubicación encontrada: ${formatCoordinates(mapPoint.lat, mapPoint.lng)}`,
        tone: "success"
      });
      setMapTarget(null);
    } finally {
      setIsReverseGeocoding(false);
    }
  }

  async function handleGeocodeLocation(target: LocationTarget) {
    const rawQuery = target === "origin" ? details.origin : details.destination;
    const query = buildLocalGeocodeQuery(rawQuery);

    if (!rawQuery.trim()) {
      updateGeocodeState(target, {
        message: "Escribe una dirección o referencia para buscar ubicación.",
        tone: "warning"
      });
      return;
    }

    updateGeocodeState(target, { isLoading: true, message: "", tone: "" });

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
      );

      if (!response.ok) {
        throw new Error("No fue posible consultar la referencia.");
      }

      const results = (await response.json()) as Array<{ lat: string; lon: string }>;
      const firstResult = results[0];

      if (!firstResult) {
        clearCoordinateDetails(target);
        updateGeocodeState(target, {
          isLoading: false,
          message:
            "No pudimos georreferenciar esta referencia. Usa tu ubicación actual o escribe más detalles.",
          tone: "warning"
        });
        return;
      }

      const latitude = Number(firstResult.lat);
      const longitude = Number(firstResult.lon);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("La referencia no devolvió coordenadas válidas.");
      }

      updateCoordinateDetails(target, { latitude, longitude });
      updateGeocodeState(target, {
        isLoading: false,
        message: `Ubicación encontrada: ${formatCoordinates(latitude, longitude)}`,
        tone: "success"
      });
    } catch {
      updateGeocodeState(target, {
        isLoading: false,
        message:
          "No pudimos georreferenciar esta referencia. Usa tu ubicación actual o escribe más detalles.",
        tone: "warning"
      });
    }
  }

  function updateGeocodeState(
    target: LocationTarget,
    nextState: Partial<GeocodeState[LocationTarget]>
  ) {
    setGeocodeState((currentState) => ({
      ...currentState,
      [target]: {
        ...currentState[target],
        ...nextState
      }
    }));
  }

  function sendWhatsApp() {
    if (!selectedService || !selectedAgent) {
      return;
    }

    const distance = getAgentDistance(details.originLat, details.originLng, selectedAgent);
    const estimatedOrbit = getEstimatedOrbit(distance);
    const currentServiceFee = isCatalogMission ? calculateServiceFee(routeDistance, cartSubtotal) : estimateMissionCost(distance).price;
    const totalEstimate = cartSubtotal + (currentServiceFee ?? 0);

    const message = [
      "Solicitud Orbi",
      `Servicio: ${selectedService.label}`,
      ...(isCatalogMission && cartBusiness
        ? [
            `Negocio: ${cartBusiness.businessName}`,
            `Productos:`,
            ...cartItems.map((item) => `- ${item.quantity}x ${item.product.name} · ${item.product.businessName} · $${item.product.price * item.quantity}`),
            `Subtotal productos: $${cartSubtotal}`,
            `Servicio/logística: ${currentServiceFee === null ? logisticsStatusMessage : `$${currentServiceFee}`}`,
            `Total a pagar: ${currentServiceFee === null ? logisticsStatusMessage : `$${totalEstimate}`}`,
            `Sector: ${cartBusiness.sector}`
          ]
        : []),
      `Origen texto: ${details.origin}`,
      ...(originCoordinatePair
        ? [`Origen coordenadas: ${formatCoordinates(originCoordinatePair.lat, originCoordinatePair.lng)}`]
        : []),
      `Destino texto: ${details.destination}`,
      ...(destinationCoordinatePair
        ? [`Destino coordenadas: ${formatCoordinates(destinationCoordinatePair.lat, destinationCoordinatePair.lng)}`]
        : []),
      `Detalle: ${details.detail}`,
      `Horario: ${getDesiredTimeLabel(details)}`,
      `Solicitante: ${details.requesterName}`,
      `Teléfono: ${details.requesterPhone}`,
      `Agente: ${selectedAgent.name}`,
      `Zona del agente: ${selectedAgent.zone}`,
      `Vehículo: ${selectedAgent.vehicle || "No especificado"}`,
      `Nivel del agente: ${selectedAgent.trustLevel}`,
      `Estado de pago: ${paymentStatus}`,
      `Método de pago: ${paymentMethod}`,
      `Órbita estimada: ${estimatedOrbit}`,
      ...(routeDistance === null ? [] : [`Distancia origen-destino: ${routeDistance.toFixed(1)} km`]),
      ...(routeDistance !== null && routeDistance > 50
        ? ["La distancia parece fuera de zona. Revisa origen y destino."]
        : [])
    ].join("\n");

    window.open(buildWhatsAppUrl(message), "_blank", "noopener,noreferrer");
  }

  async function handleSendMissionToAgent() {
    if (!selectedService || !selectedAgent || isSending) {
      return;
    }

    setSubmitError(null);

    const distance = getAgentDistance(details.originLat, details.originLng, selectedAgent);
    const cost = estimateMissionCost(distance);
    const currentServiceFee = isCatalogMission ? calculateServiceFee(routeDistance, cartSubtotal) : cost.price;

    if (isCatalogMission && currentServiceFee === null) {
      setLocationError(logisticsStatusMessage);
      return;
    }

    const servicePrice = isCatalogMission ? cartSubtotal + (currentServiceFee ?? 0) : cost.price;
    const agentLocation = getAgentLocation(selectedAgent);
    const ticketDetail = isCatalogMission
      ? buildCartTicket(cartItems, currentServiceFee, logisticsStatusMessage)
      : details.detail;

    try {
    const mission = await createMission({
      service_type: selectedService.label,
      origin_text: details.origin,
      origin_lat: details.originLat,
      origin_lng: details.originLng,
      destination_text: details.destination,
      destination_lat: details.destinationLat,
      destination_lng: details.destinationLng,
      requester_name: details.requesterName,
      requester_phone: details.requesterPhone,
      customer_name: details.requesterName,
      customer_phone: details.requesterPhone,
      guest_name: details.requesterName,
      guest_phone: details.requesterPhone,
      detail: ticketDetail,
      business_id: cartBusiness?.businessId,
      product_id: cartItems[0]?.product.id,
      business_lat: cartBusiness?.businessLat,
      business_lng: cartBusiness?.businessLng,
      product_name: cartItems.map((item) => item.product.name).join(", ") || undefined,
      business_name: cartBusiness?.businessName,
      product_price: cartSubtotal || undefined,
      items: cartItems.map((item) => ({
        product_id:   item.product.id,
        product_name: item.product.name,
        business_id:  item.product.businessId,
        business_name: item.product.businessName,
        quantity:     item.quantity,
        price:        item.product.price,
        subtotal:     item.product.price * item.quantity,
        category:     item.product.category ?? "",
      })),
      subtotal_productos: cartSubtotal || undefined,
      service_fee: currentServiceFee ?? undefined,
      total: servicePrice,
      total_amount: servicePrice,
      distance_km: routeDistance,
      duration_min: routeDuration ?? undefined,
      route_geometry: routeGeometry ?? undefined,
      pricing_rule: isCatalogMission ? pricingRule : undefined,
      product_ids: cartItems.map((item) => item.product.id),
      sector: cartBusiness?.sector,
      categoria_producto: cartItems[0]?.product.category,
      selected_agent_id: selectedAgent.id,
      selected_agent_name: selectedAgent.name,
      selected_agent_zone: selectedAgent.zone,
      selected_agent_vehicle: selectedAgent.vehicle,
      selected_agent_trust: selectedAgent.trustLevel,
      selected_agent_lat: agentLocation?.lat ?? selectedAgent.lat,
      selected_agent_lng: agentLocation?.lng ?? selectedAgent.lng,
      payment_status: paymentStatus,
      payment_method: paymentMethod,
      precio_servicio: servicePrice,
      costo_agente: isCatalogMission ? Math.round((currentServiceFee ?? 0) * CATALOG.comisionAgente * 100) / 100 : cost.agentCost,
      ganancia_orbi: isCatalogMission ? Math.round((currentServiceFee ?? 0) * (1 - CATALOG.comisionAgente) * 100) / 100 : servicePrice - cost.agentCost,
      estimated_orbit: getEstimatedOrbit(distance),
      mission_type: isCatalogMission ? "compra_negocio" : "directa",
      status: isCatalogMission ? "esperando_negocio" : "por_tomar"
    });


    setActiveMission(mission);
    setSentMission(mission);
    // Persist missionId so /orbita always shows THIS customer's mission.
    sessionStorage.setItem("orbi_active_mission_id", mission.id);
    try {
      await upsertGuestCustomerFromMission(mission);
    } catch (err) {
      console.error("[pedir] upsert cliente falló:", err);
    }
    setRequestStatusMessage(
      isCatalogMission
        ? "Ya lo tenemos. En unos momentos el negocio lo confirma."
        : "Ya lo tenemos. Buscando quién te ayude."
    );
    setIsSending(true);
    setOrbitExperienceActive(true);

    // Authenticated users never see the register prompt.
    // Anonymous users without any session get the register invite.
    const needsRegistration = sessionSource !== "auth" && !getCurrentCustomerSession();
    if (needsRegistration) {
      setShowRegisterPrompt(true);
    } else {
      await new Promise<void>((resolve) => setTimeout(resolve, 1750));
      router.push(`/orbita/${mission.id}`);
    }
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "No fue posible enviar la misión. Verifica tu conexión e intenta de nuevo."
      );
    }
  }

  async function handleCreateWaitingRequest() {
    if (!selectedService) {
      return;
    }

    if (activeMission?.status === "por_tomar" && !activeMission.selected_agent_id) {
      setWaitingRequestMessage("Ya lo tenemos. Seguimos buscando quién te ayude.");
      return;
    }

    const cost = estimateMissionCost(null);
    const currentServiceFee = isCatalogMission ? calculateServiceFee(routeDistance, cartSubtotal) : cost.price;

    if (isCatalogMission && currentServiceFee === null) {
      setLocationError(logisticsStatusMessage);
      return;
    }

    const servicePrice = isCatalogMission ? cartSubtotal + (currentServiceFee ?? 0) : cost.price;
    const ticketDetail = isCatalogMission
      ? buildCartTicket(cartItems, currentServiceFee, logisticsStatusMessage)
      : details.detail;
    const mission = await createMission({
      service_type: selectedService.label,
      origin_text: details.origin,
      origin_lat: details.originLat,
      origin_lng: details.originLng,
      destination_text: details.destination,
      destination_lat: details.destinationLat,
      destination_lng: details.destinationLng,
      requester_name: details.requesterName,
      requester_phone: details.requesterPhone,
      customer_name: details.requesterName,
      customer_phone: details.requesterPhone,
      guest_name: details.requesterName,
      guest_phone: details.requesterPhone,
      detail: ticketDetail,
      business_id: cartBusiness?.businessId,
      product_id: cartItems[0]?.product.id,
      business_lat: cartBusiness?.businessLat,
      business_lng: cartBusiness?.businessLng,
      product_name: cartItems.map((item) => item.product.name).join(", ") || undefined,
      business_name: cartBusiness?.businessName,
      product_price: cartSubtotal || undefined,
      items: cartItems.map((item) => ({
        product_id:   item.product.id,
        product_name: item.product.name,
        business_id:  item.product.businessId,
        business_name: item.product.businessName,
        quantity:     item.quantity,
        price:        item.product.price,
        subtotal:     item.product.price * item.quantity,
        category:     item.product.category ?? "",
      })),
      subtotal_productos: cartSubtotal || undefined,
      service_fee: currentServiceFee ?? undefined,
      total: servicePrice,
      total_amount: servicePrice,
      distance_km: routeDistance,
      duration_min: routeDuration ?? undefined,
      route_geometry: routeGeometry ?? undefined,
      pricing_rule: isCatalogMission ? pricingRule : undefined,
      product_ids: cartItems.map((item) => item.product.id),
      sector: cartBusiness?.sector,
      categoria_producto: cartItems[0]?.product.category,
      selected_agent_id: "",
      selected_agent_name: "",
      payment_status: paymentStatus,
      payment_method: paymentMethod,
      precio_servicio: servicePrice,
      costo_agente: isCatalogMission ? Math.round((currentServiceFee ?? 0) * CATALOG.comisionAgente * 100) / 100 : cost.agentCost,
      ganancia_orbi: isCatalogMission ? Math.round((currentServiceFee ?? 0) * (1 - CATALOG.comisionAgente) * 100) / 100 : servicePrice - cost.agentCost,
      estimated_orbit: "Por confirmar con el agente",
      mission_type: isCatalogMission ? "compra_negocio" : "directa",
      status: isCatalogMission ? "esperando_negocio" : "por_tomar"
    });

    setActiveMission(mission);
    try {
      await upsertGuestCustomerFromMission(mission);
    } catch (err) {
      console.error("[pedir] upsert cliente falló:", err);
    }
    setWaitingRequestMessage(
      isCatalogMission
        ? "Ya lo tenemos. En unos momentos el negocio lo confirma."
        : "Ya lo tenemos. Buscando quién te ayude."
    );
    setShowWaitingCancelConfirm(false);
  }

  function handleModifyWaitingRequest() {
    setIsRequestReady(false);
    setSelectedAgent(null);
    setExpandedDraftSection(null);
    setConfirmedDraftSections(getInitialConfirmedDraftSections(activeMission));
    setWaitingRequestMessage("");
    setShowWaitingCancelConfirm(false);
  }

  function handleCancelWaitingRequest() {
    const nextMission = updateActiveMission({ status: "cancelada" });
    setActiveMission(nextMission);
    setWaitingRequestMessage("Cancelado. No hubo ningún cargo.");
    setShowWaitingCancelConfirm(false);
    // Persist cancel to Supabase. Fire-and-forget — local state already updated.
    if (nextMission?.id) void cancelMissionByCustomer(nextMission.id);
  }

  return (
    <div className="space-y-5">
      <StepHeader
        selectedService={selectedService}
        details={details}
        cartItems={cartItems}
        confirmedSections={confirmedDraftSections}
        isRequestReady={isRequestReady}
        selectedAgent={selectedAgent}
        selectedStep={selectedStep}
        onStepClick={goToStep}
      />

      {!selectedService ? (
        <>
          <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/92 via-orbi-panel/76 to-orbi-black/88 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.3),0_0_34px_rgba(31,139,255,0.12)] sm:p-6">
            <h1 className="text-4xl font-black text-orbi-text">¿Qué necesitas?</h1>
            <div className="mt-5 flex min-h-14 items-center gap-3 rounded-md border border-orbi-cyan/25 bg-orbi-black/45 px-4 shadow-[0_0_24px_rgba(31,139,255,0.1)]">
              <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-orbi-cyan" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Dime qué necesitas..."
                className="min-w-0 flex-1 bg-transparent py-4 text-base font-semibold text-orbi-text outline-none placeholder:text-orbi-muted/55"
              />
            </div>
            {catalogError ? (
              <p className="mt-3 rounded-md border border-yellow-300/15 bg-yellow-300/10 p-3 text-sm font-semibold text-yellow-100">
                {catalogError}
              </p>
            ) : null}
            {searchQuery.trim() ? (
              <CatalogSuggestions
                query={searchQuery}
                results={catalogResults}
                cartItems={cartItems}
                message={cartMessage}
                onSelectProduct={handleSelectProduct}
                onSelectCustomMission={handleSelectCustomMission}
              />
            ) : null}
          </section>

          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-muted">
              Categorías
            </p>
            <div className="flex flex-wrap gap-2">
              {services.map((service) => {
                const Icon = service.icon;
                return (
                  <button
                    key={service.label}
                    type="button"
                    onClick={() => {
                      setSelectedService(service);
                      setSelectedStep("pedido");
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-orbi-text transition hover:border-orbi-cyan/30 hover:bg-orbi-blue/[0.08]"
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 text-orbi-cyan" />
                    {service.label}
                  </button>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      {isCatalogMission && !selectedAgent ? (
        <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/92 via-orbi-panel/76 to-orbi-black/88 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.3),0_0_34px_rgba(31,139,255,0.12)] sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
            Agregar otro producto o servicio
          </p>
          <div className="mt-4 flex min-h-12 items-center gap-3 rounded-md border border-orbi-cyan/25 bg-orbi-black/45 px-4">
            <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-orbi-cyan" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar otro producto, servicio o trámite..."
              className="min-w-0 flex-1 bg-transparent py-3 text-sm font-semibold text-orbi-text outline-none placeholder:text-orbi-muted/55"
            />
          </div>
          {searchQuery.trim() ? (
            <CatalogSuggestions
              query={searchQuery}
              results={catalogResults}
              cartItems={cartItems}
              message={cartMessage}
              onSelectProduct={handleSelectProduct}
              onSelectCustomMission={handleSelectCustomMission}
            />
          ) : null}
        </section>
      ) : null}

      {selectedService && !isRequestReady ? (
        <form
          onSubmit={handleDetailsSubmit}
          className="space-y-4 rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] backdrop-blur sm:p-6"
        >
          {activeDraftSection === "pedido" ? (
            <FormSection title="Tu pedido">
              <SelectedService service={selectedService} onReset={resetFlow} />
              {isCatalogMission ? (
                <LocalCart
                  items={cartItems}
                  isExpanded={isCartDetailExpanded}
                  onExpandedChange={setIsCartDetailExpanded}
                  onQuantityChange={updateCartQuantity}
                  onRemove={removeCartItem}
                    onAddMore={handleAddMoreProduct}
                />
              ) : (
                <>
                  <label className="block text-sm font-semibold text-orbi-text sm:col-span-2">
                    Detalle de la solicitud
                    <textarea
                      className="mt-2 min-h-24 w-full resize-y rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
                      value={details.detail}
                      placeholder="Describe qué necesitas, instrucciones, referencias o notas importantes"
                      onChange={(event) => updateDetails("detail", event.target.value)}
                      required
                    />
                  </label>
                  <LocationField
                    label="Punto de origen"
                    value={details.origin}
                    placeholder="Dirección o referencia de salida"
                    lat={details.originLat}
                    lng={details.originLng}
                    buttonLabel="Usar mi ubicación"
                    geocodeState={geocodeState.origin}
                    onChange={(value) => updateLocationText("origin", value)}
                    onUseLocation={() => handleUseCurrentLocation("origin")}
                    onOpenMap={() => handleOpenMap("origin")}
                  />
                </>
              )}
              <ContinueStepButton
                disabled={!orderIsComplete}
                onClick={() => {
                  setConfirmedDraftSections((currentSections) => ({
                    ...currentSections,
                    pedido: true
                  }));
                  setExpandedDraftSection(null);
                }}
              />
            </FormSection>
          ) : orderIsConfirmed ? (
            selectedStep === "pedido" ? (
              <OrderSummaryCard
                service={selectedService}
                details={details}
                cartItems={cartItems}
                subtotal={cartSubtotal}
                onEdit={() => {
                  setIsCartDetailExpanded(Boolean(cartItems.length));
                  setConfirmedDraftSections((currentSections) => ({
                    ...currentSections,
                    pedido: false
                  }));
                  setExpandedDraftSection("pedido");
                  goToStep("pedido");
                }}
              />
            ) : (
              <RequestSummaryBanner
                service={selectedService}
                details={details}
                cartItems={cartItems}
                subtotal={cartSubtotal}
                onEdit={() => {
                  setIsCartDetailExpanded(Boolean(cartItems.length));
                  setConfirmedDraftSections((currentSections) => ({
                    ...currentSections,
                    pedido: false
                  }));
                  setExpandedDraftSection("pedido");
                  goToStep("pedido");
                }}
              />
            )
          ) : null}

          {orderIsConfirmed ? (
            activeDraftSection === "destino" ? (
              <FormSection title="Destino">
                <LocationField
                  label="Punto de destino"
                  value={details.destination}
                  placeholder="Dirección o referencia de llegada"
                  lat={details.destinationLat}
                  lng={details.destinationLng}
                  buttonLabel="Usar ubicación actual como destino"
                  geocodeState={geocodeState.destination}
                  onChange={(value) => updateLocationText("destination", value)}
                  onUseLocation={() => handleUseCurrentLocation("destination")}
                  onOpenMap={() => handleOpenMap("destination")}
                />
                <ScheduleField
                  mode={details.scheduleMode}
                  scheduledAt={details.scheduledAt}
                  onModeChange={(value) =>
                    {
                      setDetails((currentDetails) => ({ ...currentDetails, scheduleMode: value }));
                      setConfirmedDraftSections((currentSections) => ({
                        ...currentSections,
                        destino: false
                      }));
                    }
                  }
                  onScheduledAtChange={(value) => {
                    updateDetails("scheduledAt", value);
                    setConfirmedDraftSections((currentSections) => ({
                      ...currentSections,
                      destino: false
                    }));
                  }}
                />
                <ContinueStepButton
                  disabled={!destinationIsComplete}
                  onClick={() => {
                    setConfirmedDraftSections((currentSections) => ({
                      ...currentSections,
                      destino: true
                    }));
                    setExpandedDraftSection(null);
                    goToStep("solicitante");
                  }}
                />
              </FormSection>
            ) : destinationIsConfirmed ? (
              <DestinationSummaryCard
                destination={details.destination}
                schedule={getDesiredTimeLabel(details)}
                onEdit={() => {
                  setConfirmedDraftSections((currentSections) => ({
                    ...currentSections,
                    destino: false
                  }));
                  setExpandedDraftSection("destino");
                  goToStep("destino");
                }}
              />
            ) : null
          ) : null}

          {orderIsConfirmed && destinationIsConfirmed ? (
            activeDraftSection === "solicitante" ? (
              <FormSection title="Datos del solicitante">
                {customerSession && sessionSource === "auth" ? (
                  <p className="mb-1 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-semibold text-orbi-cyan">
                    Usando tu cuenta ORBI.
                  </p>
                ) : customerSession && sessionSource === "local" ? (
                  <p className="mb-1 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-semibold text-orbi-cyan">
                    Recordamos tu última visita.
                  </p>
                ) : null}
                <RequestInput
                  label="Nombre del solicitante"
                  value={details.requesterName}
                  placeholder="Tu nombre"
                  onChange={(value) => updateDetails("requesterName", value)}
                />
                <RequestInput
                  label="Teléfono del solicitante"
                  value={details.requesterPhone}
                  placeholder="55 0000 0000"
                  onChange={(value) => updateDetails("requesterPhone", value)}
                />
                <ContinueStepButton
                  disabled={!requesterIsComplete}
                  onClick={() => {
                    setConfirmedDraftSections((currentSections) => ({
                      ...currentSections,
                      solicitante: true
                    }));
                    setExpandedDraftSection(null);
                    goToStep("agente");
                  }}
                />
              </FormSection>
            ) : requesterIsConfirmed ? (
              <RequesterSummaryCard
                name={details.requesterName}
                phone={details.requesterPhone}
                onEdit={() => {
                  setConfirmedDraftSections((currentSections) => ({
                    ...currentSections,
                    solicitante: false
                  }));
                  setExpandedDraftSection("solicitante");
                  goToStep("solicitante");
                }}
              />
            ) : null
          ) : null}

          {orderIsConfirmed && destinationIsConfirmed && requesterIsConfirmed && activeDraftSection === "resumen" ? (
            <FormSection title="Resumen">
              <CompactCostSummary
                isCatalogMission={isCatalogMission}
                subtotal={cartSubtotal}
                serviceFee={serviceFee}
                logisticsStatusMessage={logisticsStatusMessage}
                selectedService={selectedService.label}
                destinationReady={Boolean(destinationCoordinatePair)}
              />
              <button
                type="submit"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] sm:col-span-2"
              >
                Ver agentes compatibles
              </button>
            </FormSection>
          ) : null}

          {expandedDraftSection && expandedDraftSection !== naturalDraftSection ? (
            <button
              type="button"
              onClick={() => setExpandedDraftSection(null)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-orbi-text transition hover:bg-white/10"
            >
              Continuar
            </button>
          ) : null}

          {locationError ? (
            <p className="rounded-md border border-yellow-300/15 bg-yellow-300/10 p-3 text-sm font-semibold text-yellow-100">
              {locationError}
            </p>
          ) : null}
        </form>
      ) : null}

      {selectedService && isRequestReady && !selectedAgent ? (
        <section className="space-y-4">
          <SelectedService
            service={selectedService}
            onReset={() => {
              setIsRequestReady(false);
              setSelectedAgent(null);
            }}
            actionLabel="Editar solicitud"
          />

          {!destinationCoordinatePair ? (
            <StateCard
              title="Define el destino para calcular servicio y buscar agentes."
              body="El destino permite calcular la misión y encontrar agentes dentro de radio operativo."
              actionLabel="Agregar destino"
              onAction={() => setIsRequestReady(false)}
            />
          ) : isLoadingAgents ? (
            <StateCard title="Buscando agentes compatibles..." body="Estamos revisando disponibilidad en Red Orbi." />
          ) : agentError ? (
            <StateCard title="No pudimos cargar agentes." body={agentError} tone="error" />
          ) : compatibleAgents.length ? (
            <>
              <div className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
                  Agente disponible
                </p>
                <h2 className="mt-1 text-lg font-black text-orbi-text">
                  Elige quién te ayudará
                </h2>
              </div>
              {details.originLat === null || details.originLng === null ? (
                <p className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-4 text-sm leading-6 text-orbi-muted">
                  Sin ubicación precisa, mostramos agentes disponibles por servicio.
                </p>
              ) : null}
              {invalidOperationalLocationCount ? (
                <p className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-4 text-sm leading-6 text-orbi-muted">
                  {invalidOperationalLocationCount} agente(s) operativo(s) fueron excluidos porque no tienen lat/lng válidos registrados.
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                {compatibleAgents.map((agent) => (
                  <AgentOptionCard
                    key={agent.id}
                    agent={agent}
                    originLat={details.originLat}
                    originLng={details.originLng}
                    onSelect={() => setSelectedAgent(agent)}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              {activeMission?.status === "cancelada" ? (
                <StateCard
                  title="Pedido cancelado"
                  body="Cancelado. No había ningún cargo pendiente."
                  actionLabel="Cambiar algo"
                  onAction={handleModifyWaitingRequest}
                />
              ) : (
                <WaitingRequestCard
                  message={waitingRequestMessage}
                  showCancelConfirm={showWaitingCancelConfirm}
                  onWait={handleCreateWaitingRequest}
                  onModify={handleModifyWaitingRequest}
                  onCancel={() => setShowWaitingCancelConfirm(true)}
                  onConfirmCancel={handleCancelWaitingRequest}
                  onKeepWaiting={() => setShowWaitingCancelConfirm(false)}
                />
              )}
            </>
          )}
        </section>
      ) : null}

      {!isOrbitExperienceActive && activeMission?.status === "por_tomar" && activeMission.selected_agent_id ? (
        <PendingMissionCard mission={activeMission} onCancel={handleCancelWaitingRequest} />
      ) : null}

      {isOrbitExperienceActive && sentMission ? (
        <OrbitExperienceStage
          missionId={sentMission.id}
          serviceType={sentMission.service_type}
          showRegisterPrompt={showRegisterPrompt}
          requesterName={details.requesterName || sentMission.requester_name}
          requesterPhone={details.requesterPhone || sentMission.requester_phone}
          onSaveSession={(name, phone, email) => {
            saveCustomerSession(name, phone, email);
            setCustomerSession({ name, phone, email });
            setShowRegisterPrompt(false);
          }}
          onDismissRegister={() => setShowRegisterPrompt(false)}
        />
      ) : null}

      {selectedService && selectedAgent && !isOrbitExperienceActive ? (
        <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
            Tu pedido
          </p>
          <h2 className="mt-2 text-2xl font-black text-orbi-text">¿Lo pedimos así?</h2>
          <div className="mt-5 grid gap-3 text-sm text-orbi-muted sm:grid-cols-2">
            <SummaryItem label="Servicio" value={selectedService.label} />
            {isCatalogMission && cartBusiness ? <SummaryItem label="Negocio" value={cartBusiness.businessName} /> : null}
            {isCatalogMission && cartItems.length ? <SummaryItem label="Productos" value={`${cartItems.length} producto(s)`} /> : null}
            <SummaryItem label="Agente" value={selectedAgent.name} />
            <SummaryItem
              label="Tiempo estimado"
              value={getEstimatedOrbit(getAgentDistance(details.originLat, details.originLng, selectedAgent))}
            />
            <SummaryItem label="Método de pago" value={paymentMethod} />
            <SummaryItem label="Estado de pago" value={paymentStatus} />
          </div>
          <div className="mt-3">
            {isCatalogMission
              ? <CostBreakdown subtotal={cartSubtotal} serviceFee={serviceFee ?? 0} total={cartSubtotal + (serviceFee ?? 0)} />
              : <CostBreakdown subtotal={null} serviceFee={estimateMissionCost(null).price} total={estimateMissionCost(null).price} />
            }
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setShowConfirmationDetails((current) => !current)}
              className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-orbi-text transition hover:bg-white/10"
            >
              {showConfirmationDetails ? "Ocultar detalle" : "Ver detalle"}
            </button>
          </div>

          {showConfirmationDetails ? (
            <div className="mt-5 rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-4 text-sm text-orbi-muted">
              <p className="font-semibold text-orbi-text">Detalle de la solicitud</p>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {isCatalogMission && cartBusiness ? <SummaryItem label="Negocio" value={cartBusiness.businessName} /> : null}
                {isCatalogMission && cartItems.length ? <SummaryItem label="Productos" value={`${cartItems.length} producto(s)`} /> : null}
                <SummaryItem label="Tiempo estimado" value={getEstimatedOrbit(getAgentDistance(details.originLat, details.originLng, selectedAgent))} />
                <SummaryItem label="Estado de pago" value={paymentStatus} />
                <SummaryItem label="Método de pago" value={paymentMethod} />
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {isSending ? (
              <div className="sm:col-span-2 rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.06] p-6 text-center">
                <div className="mx-auto mb-3 h-12 w-12 animate-pulse rounded-full bg-orbi-cyan/30" />
                <p className="text-lg font-black text-orbi-text">Ya lo tenemos…</p>
                <p className="mt-2 text-sm text-orbi-muted">Estamos conectando tu solicitud con el agente seleccionado.</p>
              </div>
            ) : null}
            {submitError ? (
              <p className="sm:col-span-2 rounded-md border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-sm text-red-400">
                {submitError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setSelectedAgent(null)}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-orbi-text transition hover:bg-white/10"
            >
              Cambiar agente
            </button>
            <button
              type="button"
              disabled={isSending}
              onClick={handleSendMissionToAgent}
              className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] ${
                isSending ? "cursor-not-allowed opacity-70" : ""
              }`}
            >
              <Send aria-hidden="true" className="h-5 w-5" />
              {isSending ? "Enviando..." : "Poner en órbita"}
            </button>
            <button
              type="button"
              onClick={sendWhatsApp}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-5 py-3 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15 sm:col-span-2"
            >
              Enviar respaldo por WhatsApp
            </button>
          </div>
        </section>
      ) : null}

      {mapTarget ? (
        <LocationPickerDialog
          isSaving={isReverseGeocoding}
          point={mapPoint}
          title={mapTarget === "origin" ? "Elegir punto de origen" : "Elegir punto de destino"}
          onClose={() => setMapTarget(null)}
          onConfirm={handleConfirmMapPoint}
          onPointChange={setMapPoint}
        />
      ) : null}
    </div>
  );
}

function StepHeader({
  selectedService,
  details,
  cartItems,
  confirmedSections,
  isRequestReady,
  selectedAgent,
  selectedStep,
  onStepClick
}: {
  selectedService: ServiceOption | null;
  details: RequestDetails;
  cartItems: CartItem[];
  confirmedSections: ConfirmedDraftSections;
  isRequestReady: boolean;
  selectedAgent: OrbiAgent | null;
  selectedStep: WizardStep;
  onStepClick: (step: WizardStep) => void;
}) {
  const hasOrder = confirmedSections.pedido && Boolean(cartItems.length || details.detail.trim());
  const hasDestination =
    confirmedSections.destino &&
    Boolean(getValidCoordinatePair({ lat: details.destinationLat, lng: details.destinationLng }));
  const hasRequester =
    confirmedSections.solicitante &&
    Boolean(details.requesterName.trim() && details.requesterPhone.trim());
  const isOrbitStepReady = hasOrder && hasDestination && hasRequester && Boolean(selectedAgent);
  const steps = [
    { id: "servicio" as const, label: "Solicitud", done: Boolean(selectedService) },
    { id: "destino" as const, label: "Destino", done: hasDestination },
    { id: "solicitante" as const, label: "Solicitante", done: hasRequester },
    { id: "agente" as const, label: "Agente", done: Boolean(selectedAgent) },
    { id: "confirmacion" as const, label: "Poner en órbita", done: isOrbitStepReady }
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {steps.map((step) => {
        const isCurrent = selectedStep === step.id || (step.id === "servicio" && selectedStep === "pedido");
        const isClickable = step.done || isCurrent;

        return (
          <button
            type="button"
            key={step.id}
            onClick={() => {
              if (isClickable) {
                onStepClick(step.id === "servicio" && selectedService ? "pedido" : step.id);
              }
            }}
            disabled={!isClickable}
            className={`rounded-md border px-2 py-2 text-center text-[11px] font-bold transition ${
              isCurrent
                ? "border-orbi-cyan/45 bg-orbi-blue/20 text-orbi-cyan shadow-[0_0_18px_rgba(31,139,255,0.12)]"
                : step.done
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-white/[0.03] text-orbi-muted"
            } ${isClickable ? "cursor-pointer hover:border-orbi-cyan/45" : "cursor-not-allowed"}`}
          >
            {step.done && !isCurrent ? "✓ " : null}
            {step.label}
          </button>
        );
      })}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-md border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function ContinueStepButton({
  disabled,
  onClick
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
    >
      Continuar
    </button>
  );
}

function getServiceTitle(serviceLabel: string) {
  switch (serviceLabel) {
    case "Compra local":
      return "TU PEDIDO";
    case "Traslado":
      return "TU TRASLADO";
    case "Mandado":
      return "TU MANDADO";
    case "Entrega":
      return "TU ENTREGA";
    case "Recolección":
      return "TU RECOLECCIÓN";
    case "Pago o trámite":
      return "TU TRÁMITE";
    default:
      return serviceLabel;
  }
}

function SelectedService({
  service,
  onReset,
  actionLabel = "Ajustar categoría"
}: {
  service: ServiceOption;
  onReset: () => void;
  actionLabel?: string;
}) {
  const Icon = service.icon;

  return (
    <div className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-4 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <p className="mt-1 font-black text-orbi-text">{getServiceTitle(service.label)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-orbi-text transition hover:bg-white/10"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function OrderSummaryCard({
  service,
  details,
  cartItems,
  subtotal,
  onEdit
}: {
  service: ServiceOption;
  details: RequestDetails;
  cartItems: CartItem[];
  subtotal: number;
  onEdit: () => void;
}) {
  const itemCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const firstItem = cartItems[0];
  const summary = cartItems.length
    ? `${itemCount} ${itemCount === 1 ? "producto" : "productos"} · ${firstItem?.product.businessName ?? service.label}`
    : shortenText(details.detail || service.description, 72);

  return (
    <CompactStepCard
      eyebrow="Tu pedido"
      title={getServiceTitle(service.label)}
      body={summary}
      meta={cartItems.length ? `Subtotal $${subtotal}` : `Origen: ${shortenText(details.origin, 64)}`}
      actionLabel={cartItems.length ? "Ver detalle" : "Cambiar"}
      onAction={onEdit}
    />
  );
}

function RequestSummaryBanner({
  service,
  details,
  cartItems,
  subtotal,
  onEdit
}: {
  service: ServiceOption;
  details: RequestDetails;
  cartItems: CartItem[];
  subtotal: number;
  onEdit: () => void;
}) {
  const itemCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const firstItem = cartItems[0];
  const summary = cartItems.length
    ? `Solicitud: ${itemCount} ${itemCount === 1 ? "producto" : "productos"} · ${firstItem?.product.businessName || getServiceTitle(service.label)} · $${subtotal}`
    : `Solicitud: ${shortenText(details.detail || service.description, 72)} · $${subtotal}`;

  return (
    <section className="rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-black text-orbi-text">{summary}</p>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
        >
          Editar solicitud
        </button>
      </div>
    </section>
  );
}

function DestinationSummaryCard({
  destination,
  schedule,
  onEdit
}: {
  destination: string;
  schedule: string;
  onEdit: () => void;
}) {
  return (
    <CompactStepCard
      eyebrow="Destino"
      title="Destino seleccionado"
      body={shortenText(destination, 86)}
      meta={schedule}
      actionLabel="Cambiar"
      onAction={onEdit}
    />
  );
}

function RequesterSummaryCard({
  name,
  phone,
  onEdit
}: {
  name: string;
  phone: string;
  onEdit: () => void;
}) {
  return (
    <CompactStepCard
      eyebrow="Datos del solicitante"
      title={name}
      body={phone}
      actionLabel="Cambiar"
      onAction={onEdit}
    />
  );
}

function CompactStepCard({
  eyebrow,
  title,
  body,
  meta,
  actionLabel,
  onAction
}: {
  eyebrow: string;
  title: string;
  body: string;
  meta?: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <section className="rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">{eyebrow}</p>
          <h3 className="mt-1 font-black text-orbi-text">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-orbi-muted">{body}</p>
          {meta ? <p className="mt-1 text-xs font-bold text-orbi-cyan">{meta}</p> : null}
        </div>
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
        >
          {actionLabel}
        </button>
      </div>
    </section>
  );
}

// ── Intention detection ───────────────────────────────────────────────────────

type DetectedIntention = {
  serviceLabel: "Compra local" | "Traslado" | "Recolección" | "Pago o trámite" | "Mandado";
  proposal: string;
};

function detectIntention(query: string): DetectedIntention {
  const q = query.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const is = (...words: string[]) => words.some((w) => q.includes(w));

  if (is("traslado", "llevame", "llevame", "llévenme", "llevenme", "llevar", "lleven", "ir a", "quiero ir", "me llevan", "me lleven", "necesito ir", "necesito que me lleven", "necesito que me lleve")) {
    return { serviceLabel: "Traslado", proposal: "Entendí. Vamos a ayudarte a llegar." };
  }

  if (is("recoger", "recoge", "recogen", "recoleccion", "recolección", "paquete", "que recojan", "que recoja")) {
    return { serviceLabel: "Recolección", proposal: "Entendí. Mandamos a alguien a recogerlo." };
  }

  if (is("pagar", "pago", "recibo", "tramite", "trámite", "fila", "cfe", "agua ", " luz", "predial", "banco", "servicio", "factura")) {
    return { serviceLabel: "Pago o trámite", proposal: "Entendí. Podemos hacer ese trámite por ti." };
  }

  if (is("comprar", "compra", "quiero", "tráeme", "traeme", "conseguir", "buscar", "cafe", "café", "medicina", "farmacia", "comida", "producto")) {
    return { serviceLabel: "Compra local", proposal: "Entendí. Vamos a conseguirlo." };
  }

  return { serviceLabel: "Mandado", proposal: "Entendí. Mandamos a alguien." };
}

// ─────────────────────────────────────────────────────────────────────────────

function CatalogSuggestions({
  query,
  results,
  cartItems,
  message,
  onSelectProduct,
  onSelectCustomMission
}: {
  query: string;
  results: CatalogSearchResult[];
  cartItems: CartItem[];
  message: string;
  onSelectProduct: (product: CatalogSearchResult) => void;
  onSelectCustomMission: (label: "Mandado" | "Compra local" | "Servicio personalizado") => void;
}) {
  const intention = detectIntention(query);
  const isNonCatalogService =
    intention.serviceLabel === "Traslado" ||
    intention.serviceLabel === "Recolección" ||
    intention.serviceLabel === "Pago o trámite";

  if (!results.length || isNonCatalogService) {
    const missionLabel = intention.serviceLabel === "Compra local"
      ? "Compra local"
      : intention.serviceLabel === "Mandado"
        ? "Mandado"
        : "Servicio personalizado";

    return (
      <div className="mt-4 rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.06] p-5">
        <p className="text-base font-black text-orbi-text">{intention.proposal}</p>
        <p className="mt-1 text-sm text-orbi-muted">¿Lo pedimos así?</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSelectCustomMission(missionLabel as "Mandado" | "Compra local" | "Servicio personalizado")}
            className="inline-flex min-h-10 items-center rounded-md bg-orbi-blue px-5 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
          >
            Sí, pedir
          </button>
          <button
            type="button"
            onClick={() => onSelectCustomMission("Mandado")}
            className="inline-flex min-h-10 items-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-2 text-sm font-bold text-orbi-muted transition hover:bg-white/10"
          >
            Es otra cosa
          </button>
        </div>
      </div>
    );
  }

  const firstResult = results[0];

  return (
    <div className="mt-4 space-y-3">
      {message ? (
        <p className="rounded-md border border-yellow-300/15 bg-yellow-300/10 p-3 text-sm font-semibold text-yellow-100">
          {message}
        </p>
      ) : null}
      <div className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-orbi-cyan">
          Categoría: Compra local
        </p>
        <p className="mt-1 text-sm font-semibold text-orbi-muted">
          Sector: {firstResult.sector} · Buscando “{query}”
        </p>
      </div>
      <div className="grid gap-2">
        {results.slice(0, 6).map((result) => {
          const already = cartItems.some((item) => item.product.id === result.id);
          return (
            <button
              key={result.id}
              type="button"
              onClick={already ? undefined : () => onSelectProduct(result)}
              disabled={already}
              aria-disabled={already}
              className={`rounded-md border border-white/10 bg-white/[0.04] p-4 text-left transition ${
                already ? "opacity-60 cursor-not-allowed" : "hover:border-orbi-cyan/35 hover:bg-orbi-blue/[0.08]"
              }`}
            >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-orbi-text">
                  {result.name} · {result.businessName}
                </p>
                <p className="mt-1 text-xs font-semibold text-orbi-cyan">
                  {result.category} · {result.sector}
                </p>
                <p className="mt-2 text-sm leading-6 text-orbi-muted">{result.description}</p>
              </div>
              <span className="shrink-0 rounded-full border border-orbi-cyan/20 bg-orbi-blue/10 px-3 py-1 text-sm font-black text-orbi-cyan">
                {already ? "✓ Agregado" : `$${result.price}`}
              </span>
            </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LocalCart({
  items,
  isExpanded,
  onExpandedChange,
  onQuantityChange,
  onRemove,
  onAddMore
}: {
  items: CartItem[];
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onAddMore: () => void;
}) {
  const subtotal = getCartSubtotal(items);
  const business = items[0]?.product;
  const firstItem = items[0];
  const hasValidBusinessOrigin = business
    ? Boolean(getValidCoordinatePair({ lat: business.businessLat, lng: business.businessLng }))
    : false;

  return (
    <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4 sm:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
            Ticket de misión
          </p>
          <p className="mt-2 text-lg font-black text-orbi-text">
            {items.length} {items.length === 1 ? "producto agregado" : "productos agregados"}
          </p>
          {firstItem ? (
            <p className="mt-1 text-sm leading-6 text-orbi-muted">
              {firstItem.quantity}x {firstItem.product.name} · {firstItem.product.businessName} · Subtotal ${subtotal}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onExpandedChange(true)}
              className="rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
            >
              Ajustar cantidad
            </button>
            <button
              type="button"
              onClick={onAddMore}
              className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-orbi-text transition hover:bg-white/10"
            >
              Agregar otro producto
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onExpandedChange(!isExpanded)}
          className="shrink-0 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
        >
          {isExpanded ? "Ocultar detalle" : "Ver detalle"}
        </button>
      </div>
      {business ? (
        <div className="mt-3 rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-3">
          <p className="font-black text-orbi-text">{business.businessName}</p>
          <p className="mt-1 text-xs text-orbi-muted">
            Origen automático: {business.businessBaseText || business.businessZone || business.businessName}
          </p>
          {!hasValidBusinessOrigin ? (
            <p className="mt-2 rounded-md border border-yellow-300/15 bg-yellow-300/10 p-2 text-xs font-semibold text-yellow-100">
              Completa ubicación del negocio en Admin para calcular logística.
            </p>
          ) : null}
        </div>
      ) : null}
      {isExpanded ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => {
            const subtotalItem = item.product.price * item.quantity;
            return (
              <div key={item.product.id} className="rounded-md border border-white/10 bg-orbi-black/25 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-orbi-text">{item.product.name}</p>
                    <p className="mt-1 text-xs text-orbi-muted">
                      {item.product.businessName} · ${item.product.price} c/u
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(item.product.id)}
                    className="rounded-md border border-red-300/15 bg-red-400/10 px-2 py-1 text-xs font-bold text-red-200"
                  >
                    Quitar
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
                  <label className="text-xs font-semibold text-orbi-muted">
                    Cantidad
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onQuantityChange(item.product.id, Math.max(1, item.quantity - 1))}
                        className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-orbi-text transition hover:bg-white/10"
                      >
                        -
                      </button>
                      <input
                        min={1}
                        type="number"
                        value={item.quantity}
                        onChange={(event) => onQuantityChange(item.product.id, Number(event.target.value))}
                        className="w-20 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-orbi-text outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => onQuantityChange(item.product.id, item.quantity + 1)}
                        className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-orbi-text transition hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>
                  </label>
                  <span className="rounded-full border border-orbi-cyan/20 bg-orbi-blue/10 px-3 py-2 text-sm font-black text-orbi-cyan">
                    ${subtotalItem}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <p className="mt-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-black text-orbi-text">
        Subtotal productos: ${subtotal}
      </p>
    </div>
  );
}

function AgentOptionCard({
  agent,
  originLat,
  originLng,
  onSelect
}: {
  agent: OrbiAgent;
  originLat: number | null;
  originLng: number | null;
  onSelect: () => void;
}) {
  const distance = getAgentDistance(originLat, originLng, agent);

  return (
    <article className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)]">
      <div className="flex items-start gap-4">
        <AgentAvatar agent={agent} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black leading-tight text-orbi-text">{agent.name}</h2>
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusStyles[agent.status]}`}
            >
              {agent.status}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-orbi-cyan">{agent.serviceType}</p>
          <p className="mt-2 text-sm leading-6 text-orbi-muted">{agent.description}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <InfoTile label="Zona" value={agent.zone} />
        <InfoTile label="Nivel" value={agent.trustLevel} />
        <InfoTile label="Radio" value={`${agent.radiusKm || 20} km`} />
        <InfoTile
          label="Distancia"
          value={
            distance === null
              ? "Sin ubicación operativa registrada."
              : `A ${distance.toFixed(1)} km de tu punto de origen`
          }
        />
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
      >
        Elegir agente
      </button>
    </article>
  );
}

function AgentAvatar({ agent }: { agent: OrbiAgent }) {
  if (agent.photoUrl) {
    return (
      <div
        aria-label={agent.name}
        role="img"
        className="h-16 w-16 shrink-0 rounded-md border border-orbi-cyan/20 bg-cover bg-center"
        style={{ backgroundImage: `url(${agent.photoUrl})` }}
      />
    );
  }

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-lg font-black text-orbi-cyan shadow-[0_0_22px_rgba(31,139,255,0.12)]">
      {agent.initials || <UserRound aria-hidden="true" className="h-7 w-7" />}
    </div>
  );
}

function RequestInput({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  );
}

function LocationField({
  label,
  value,
  placeholder,
  lat,
  lng,
  buttonLabel,
  geocodeState,
  onChange,
  onUseLocation,
  onOpenMap
}: {
  label: string;
  value: string;
  placeholder: string;
  lat: number | null;
  lng: number | null;
  buttonLabel: string;
  geocodeState: GeocodeState[LocationTarget];
  onChange: (value: string) => void;
  onUseLocation: () => void;
  onOpenMap: () => void;
}) {
  return (
    <div className="space-y-2">
      <RequestInput label={label} value={value} placeholder={placeholder} onChange={onChange} />
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onOpenMap}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
        >
          <MapPin aria-hidden="true" className="h-4 w-4" />
          Elegir en mapa
        </button>
        <button
          type="button"
          onClick={onUseLocation}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
        >
          <LocateFixed aria-hidden="true" className="h-4 w-4" />
          {buttonLabel}
        </button>
      </div>
      {geocodeState.message ? (
        <p
          className={`rounded-md border px-3 py-2 text-xs font-semibold ${
            geocodeState.tone === "success"
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
              : "border-yellow-300/15 bg-yellow-300/10 text-yellow-100"
          }`}
        >
          {geocodeState.message}
        </p>
      ) : null}
      {lat !== null && lng !== null ? (
        <p className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
          Ubicación encontrada: {formatCoordinates(lat, lng)}
        </p>
      ) : null}
    </div>
  );
}

function LocationPickerDialog({
  title,
  point,
  isSaving,
  onPointChange,
  onConfirm,
  onClose
}: {
  title: string;
  point: MapPoint;
  isSaving: boolean;
  onPointChange: (point: MapPoint) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-orbi-black/82 px-3 pb-3 pt-10 backdrop-blur sm:items-center sm:justify-center sm:p-6">
      <section className="max-h-[92vh] w-full overflow-hidden rounded-md border border-orbi-cyan/20 bg-gradient-to-br from-orbi-panel via-orbi-panel/95 to-orbi-black shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_44px_rgba(31,139,255,0.18)] sm:max-w-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orbi-cyan">
              Selección visual
            </p>
            <h2 className="mt-1 text-xl font-black text-orbi-text">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-orbi-muted">
              Toca el mapa o arrastra el marcador para ajustar el punto.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-orbi-text transition hover:bg-white/10"
          >
            Cerrar
          </button>
        </div>
        <div className="h-[58vh] min-h-[320px] w-full border-b border-white/10">
          <LocationPickerMap point={point} onPointChange={onPointChange} />
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
          <p className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-semibold text-orbi-muted">
            Punto seleccionado: {formatCoordinates(point.lat, point.lng)}
          </p>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isSaving ? "Confirmando..." : "Confirmar punto"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ScheduleField({
  mode,
  scheduledAt,
  onModeChange,
  onScheduledAtChange
}: {
  mode: "asap" | "scheduled";
  scheduledAt: string;
  onModeChange: (value: "asap" | "scheduled") => void;
  onScheduledAtChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-orbi-text">
        Horario deseado
        <select
          className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
          value={mode}
          onChange={(event) => onModeChange(event.target.value as "asap" | "scheduled")}
        >
          <option value="asap">Lo antes posible</option>
          <option value="scheduled">Programar horario</option>
        </select>
      </label>
      {mode === "scheduled" ? (
        <input
          className="w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => onScheduledAtChange(event.target.value)}
          required
        />
      ) : null}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="font-semibold text-orbi-muted">{label}</p>
      <p className="mt-1 font-black text-orbi-text">{value}</p>
    </div>
  );
}

function CompactCostSummary({
  isCatalogMission,
  subtotal,
  serviceFee,
  logisticsStatusMessage,
  selectedService,
  destinationReady
}: {
  isCatalogMission: boolean;
  subtotal: number;
  serviceFee: number | null;
  logisticsStatusMessage: string;
  selectedService: string;
  destinationReady: boolean;
}) {
  if (!isCatalogMission) {
    return (
      <div className="rounded-md border border-white/10 bg-white/[0.04] p-3 sm:col-span-2">
        <p className="text-sm font-black text-orbi-text">{selectedService}</p>
        <p className="mt-1 text-xs leading-5 text-orbi-muted">
          El costo se estima con el agente según distancia, tiempo y detalle de la misión.
        </p>
      </div>
    );
  }

  if (serviceFee === null) {
    return (
      <>
        <InfoTile label="Subtotal productos" value={`$${subtotal}`} />
        <InfoTile
          label="Servicio / logística"
          value={destinationReady ? logisticsStatusMessage : "Define destino"}
        />
      </>
    );
  }

  return (
    <div className="sm:col-span-2">
      <CostBreakdown subtotal={subtotal} serviceFee={serviceFee} total={subtotal + serviceFee} />
    </div>
  );
}

function SummaryItem({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 ${wide ? "sm:col-span-2" : ""}`}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-orbi-cyan">{label}</p>
      <p className="mt-1 font-semibold text-orbi-text">{value}</p>
    </div>
  );
}

function StateCard({
  title,
  body,
  tone = "default",
  actionLabel,
  onAction
}: {
  title: string;
  body: string;
  tone?: "default" | "error";
  actionLabel?: string;
  onAction?: () => void;
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
        <RefreshCw aria-hidden="true" className="h-7 w-7" />
      </div>
      <h2 className="text-2xl font-black tracking-normal text-orbi-text">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-orbi-muted sm:text-base">
        {body}
      </p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function WaitingRequestCard({
  message,
  showCancelConfirm,
  onWait,
  onModify,
  onCancel,
  onConfirmCancel,
  onKeepWaiting
}: {
  message: string;
  showCancelConfirm: boolean;
  onWait: () => void;
  onModify: () => void;
  onCancel: () => void;
  onConfirmCancel: () => void;
  onKeepWaiting: () => void;
}) {
  return (
    <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-6 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-8">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan shadow-[0_0_24px_rgba(31,139,255,0.14)]">
        <Radar aria-hidden="true" className="h-7 w-7" />
      </div>
      <h2 className="text-center text-2xl font-black text-orbi-text">Ya lo tenemos</h2>
      <p className="mx-auto mt-3 max-w-lg text-center text-sm leading-6 text-orbi-muted">
        Ahora mismo no hay alguien disponible cerca. Estamos buscando.
      </p>
      {message ? (
        <p className="mt-4 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-center text-sm font-bold text-emerald-200">
          {message}
        </p>
      ) : null}
      {showCancelConfirm ? (
        <div className="mt-5 rounded-md border border-red-300/20 bg-red-400/10 p-4">
          <h3 className="font-black text-red-100">¿Cancelamos?</h3>
          <p className="mt-2 text-sm leading-6 text-red-100/85">
            Todavía no hay ningún cargo. Puedes cancelar sin problema.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onConfirmCancel}
              className="min-h-11 rounded-md border border-red-300/25 bg-red-400/15 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-400/20"
            >
              Sí, cancelar
            </button>
            <button
              type="button"
              onClick={onKeepWaiting}
              className="min-h-11 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-orbi-text transition hover:bg-white/10"
            >
              Seguir esperando
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={onWait}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
          >
            Seguir esperando
          </button>
          <button
            type="button"
            onClick={onModify}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-orbi-text transition hover:bg-white/10"
          >
            Cambiar algo
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-red-300/20 bg-red-400/10 px-5 py-3 text-sm font-bold text-red-100 transition hover:bg-red-400/15"
          >
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}

function PendingMissionCard({
  mission,
  onCancel
}: {
  mission: ActiveMission;
  onCancel: () => void;
}) {
  const total = mission.total ?? mission.total_amount ?? mission.precio_servicio ?? 0;
  const origin = mission.origin_text || "Origen no disponible";
  const destination = mission.destination_text || "Destino no disponible";

  return (
    <section className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">Cómo va tu pedido</p>
          <h2 className="mt-2 text-2xl font-black text-orbi-text">Ya lo tenemos</h2>
          <p className="mt-2 text-sm leading-6 text-orbi-muted">
            Esperando confirmación del agente.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-orbi-cyan/20 bg-orbi-blue/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
          {getMissionStatusLabel(mission.status)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orbi-muted">Agente seleccionado</p>
          <p className="mt-2 text-sm font-bold text-orbi-text">{mission.selected_agent_name || "No asignado"}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orbi-muted">Servicio</p>
          <p className="mt-2 text-sm font-bold text-orbi-text">{mission.service_type}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orbi-muted">Total</p>
          <p className="mt-2 text-sm font-bold text-orbi-text">${total.toFixed(2)}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orbi-muted">Origen / Destino</p>
          <p className="mt-2 text-sm font-bold text-orbi-text">{origin}</p>
          <p className="mt-1 text-sm text-orbi-muted">{destination}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link
          href={`/orbita/${missionId}`}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
        >
          Ver detalle
        </Link>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-red-300/20 bg-red-400/10 px-5 py-3 text-sm font-bold text-red-100 transition hover:bg-red-400/20"
        >
          Cancelar misión
        </button>
      </div>
    </section>
  );
}

function commitmentTextForService(serviceType: string): {
  searching: string;
  horizon: string;
} {
  const t = serviceType.toLowerCase();
  if (t.includes("traslado")) {
    return {
      searching: "Buscando quién te lleve.",
      horizon: "Normalmente encontramos a alguien en menos de 8 minutos.",
    };
  }
  if (t.includes("recolección") || t.includes("recoleccion") || t.includes("entrega")) {
    return {
      searching: "Buscando quién lo recoja.",
      horizon: "Normalmente encontramos a alguien en menos de 8 minutos.",
    };
  }
  if (t.includes("pago") || t.includes("trámite") || t.includes("tramite")) {
    return {
      searching: "Buscando quién haga ese trámite.",
      horizon: "Normalmente encontramos a alguien en menos de 8 minutos.",
    };
  }
  if (t.includes("compra")) {
    return {
      searching: "Buscando quién lo consiga.",
      horizon: "Normalmente encontramos a alguien en menos de 8 minutos.",
    };
  }
  return {
    searching: "Buscando quién te ayude.",
    horizon: "Normalmente encontramos a alguien en menos de 8 minutos.",
  };
}

function OrbitExperienceStage({
  missionId,
  serviceType,
  showRegisterPrompt,
  requesterName,
  requesterPhone,
  onSaveSession,
  onDismissRegister,
}: {
  missionId: string;
  serviceType: string;
  showRegisterPrompt: boolean;
  requesterName: string;
  requesterPhone: string;
  onSaveSession: (name: string, phone: string, email: string) => void;
  onDismissRegister: () => void;
}) {
  const folio = missionId.replace(/-/g, "").slice(-6).toUpperCase();
  const { searching, horizon } = commitmentTextForService(serviceType);

  return (
    <div className="space-y-4">
      {/* Capa de compromiso — Bloque A */}
      <div className="rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.07] p-5">
        <p className="text-xl font-black text-orbi-text">
          Ya puedes dejar esto en nuestras manos.
        </p>
        <p className="mt-1 text-sm font-mono font-semibold tracking-widest text-orbi-cyan">
          #{folio}
        </p>
        <p className="mt-4 text-sm text-orbi-muted">{searching}</p>
        <p className="text-sm text-orbi-muted">{horizon}</p>
        <p className="mt-3 text-xs text-orbi-muted/70">
          Si en 10 minutos no encontramos a nadie, te avisamos aquí.
        </p>
      </div>

      {/* Tracker de estado */}
      <Suspense>
        <MissionOrbitTracker initialMissionId={missionId} />
      </Suspense>

      {showRegisterPrompt ? (
        <SaveSessionPrompt
          name={requesterName}
          phone={requesterPhone}
          onSave={onSaveSession}
          onDismiss={onDismissRegister}
        />
      ) : null}
    </div>
  );
}

function SaveSessionPrompt({
  name,
  phone,
  onSave,
  onDismiss: _onDismiss,
}: {
  name: string;
  phone: string;
  onSave: (name: string, phone: string, email: string) => void;
  onDismiss: () => void;
}) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [fullName, setFullName] = useState(name ?? "");
  const [email, setEmail] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayPhone = phone.replace(/\D/g, "").replace(/(\d{2})(\d{4})(\d{4})/, "$1 $2 $3");

  async function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password) {
      setError("Todos los campos son obligatorios."); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Ingresa un correo electrónico válido."); return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres."); return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden."); return;
    }
    setError(""); setIsSubmitting(true);
    try {
      const result = await registerCustomerAccount({
        name: fullName.trim(), phone, email: email.trim(), password,
      });
      saveCustomerSession(result.name, result.phone, result.email);
      onSave(result.name, result.phone, result.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible crear la cuenta.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim() || !password) {
      setError("Ingresa tu correo y contraseña."); return;
    }
    setError(""); setIsSubmitting(true);
    try {
      const session = await loginCustomerWithSupabase(loginEmail.trim(), password);
      saveCustomerSession(session.name, session.phone, session.email);
      onSave(session.name, session.phone ?? phone, session.email ?? loginEmail.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Datos incorrectos.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (mode === "login") {
    return (
      <div className="rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.07] p-4">
        <p className="text-sm font-bold text-orbi-text">Ya tienes una cuenta Orbi</p>
        <p className="mt-1 text-xs text-orbi-muted">
          Inicia sesión para vincular esta misión a tu historial.
        </p>
        <form onSubmit={handleLoginSubmit} className="mt-3 space-y-3" noValidate>
          <div>
            <label className="block text-xs font-semibold text-orbi-muted">Correo electrónico</label>
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
              placeholder="correo@ejemplo.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-orbi-muted">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
              placeholder="Tu contraseña"
              autoComplete="current-password"
            />
          </div>
          {error ? (
            <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full min-h-10 items-center justify-center rounded-md bg-orbi-blue px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0f7af0] disabled:opacity-50"
          >
            {isSubmitting ? "Verificando…" : "Iniciar sesión y seguir misión"}
          </button>
        </form>
        <p className="mt-3 text-xs text-orbi-muted">
          ¿Es una cuenta nueva?{" "}
          <button
            type="button"
            onClick={() => { setMode("register"); setError(""); setPassword(""); }}
            className="font-semibold text-orbi-cyan underline underline-offset-2 transition hover:text-white"
          >
            Regístrate
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.07] p-4">
      <p className="text-sm font-bold text-orbi-text">¿Te reconocemos la próxima vez?</p>
      <p className="mt-1 text-xs text-orbi-muted">
        Crea tu cuenta Orbi para guardar tu historial, seguir tu misión y pedir más rápido.
      </p>
      <form onSubmit={handleRegisterSubmit} className="mt-3 space-y-3" noValidate>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">Nombre completo</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="Tu nombre completo"
            autoComplete="name"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">Correo electrónico</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="correo@ejemplo.com"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">WhatsApp</label>
          <p className="mt-1 rounded-md border border-white/10 bg-orbi-black/40 px-3 py-2 font-mono text-sm font-bold text-orbi-cyan">
            {displayPhone || phone}
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">Confirmar contraseña</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="Repite la contraseña"
            autoComplete="new-password"
          />
        </div>
        {error ? (
          <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full min-h-10 items-center justify-center rounded-md bg-orbi-blue px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0f7af0] disabled:opacity-50"
        >
          {isSubmitting ? "Creando cuenta…" : "Crear mi cuenta y seguir misión"}
        </button>
      </form>
      <p className="mt-3 text-xs text-orbi-muted">
        ¿Ya tienes cuenta?{" "}
        <button
          type="button"
          onClick={() => { setMode("login"); setError(""); setPassword(""); setConfirmPassword(""); }}
          className="font-semibold text-orbi-cyan underline underline-offset-2 transition hover:text-white"
        >
          Inicia sesión
        </button>
      </p>
    </div>
  );
}


function getInitialConfirmedDraftSections(mission: ActiveMission | null): ConfirmedDraftSections {
  return {
    pedido: Boolean(mission),
    destino: Boolean(mission),
    solicitante: Boolean(mission)
  };
}

function getDesiredTimeLabel(details: RequestDetails) {
  if (details.scheduleMode === "asap") {
    return "Lo antes posible";
  }

  return details.scheduledAt || "Programar horario";
}

function formatCoordinates(lat: number | null, lng: number | null) {
  const point = getValidCoordinatePair({ lat, lng });

  if (!point) {
    return "No capturada";
  }

  return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
}

function formatDistance(distance: number | null) {
  return distance === null ? "Sin ubicación operativa registrada." : `${distance.toFixed(1)} km`;
}

function shortenText(value: string, maxLength: number) {
  const normalizedValue = value.trim();

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength - 1).trim()}…`;
}

function getEstimatedOrbit(distance: number | null) {
  if (distance === null) {
    return "Por confirmar con el agente";
  }

  if (distance <= 2) {
    return "5-10 min";
  }

  if (distance <= 5) {
    return "10-20 min";
  }

  if (distance <= 10) {
    return "20-35 min";
  }

  return "35-60 min";
}


function getCartSubtotal(items: CartItem[]) {
  return items.reduce((total, item) => total + item.product.price * item.quantity, 0);
}

function buildCartTicket(
  items: CartItem[],
  serviceFee: number | null,
  logisticsStatusMessage: string
) {
  const subtotal = getCartSubtotal(items);
  const lines = items.map(
    (item) =>
      `- ${item.quantity}x ${item.product.name} · ${item.product.businessName} · $${item.product.price * item.quantity}`
  );

  return [
    "Ticket de misión:",
    "Productos:",
    ...lines,
    `Subtotal productos: $${subtotal}`,
    `Servicio/logística: ${serviceFee === null ? logisticsStatusMessage : `$${serviceFee}`}`,
    `Total a pagar: ${serviceFee === null ? logisticsStatusMessage : `$${subtotal + serviceFee}`}`
  ].join("\n");
}

type CoordinatePairSource = {
  lat?: unknown;
  lng?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  location_lat?: unknown;
  location_lng?: unknown;
};

function getValidCoordinatePair(source: CoordinatePairSource) {
  const lat = toValidCoordinate(source.lat ?? source.latitude ?? source.location_lat);
  const lng = toValidCoordinate(source.lng ?? source.longitude ?? source.location_lng);

  if (lat === null || lng === null) {
    return null;
  }

  if (lat === 0 && lng === 0) {
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
}

function formatNullablePair(lat: number | null, lng: number | null) {
  return `${lat ?? "null"}, ${lng ?? "null"}`;
}

function toValidCoordinate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function getLogisticsStatusMessage({
  hasCatalogOrigin,
  hasDestination,
  distance
}: {
  hasCatalogOrigin: boolean;
  hasDestination: boolean;
  distance: number | null;
}) {
  if (!hasCatalogOrigin) {
    return "Completa ubicación del negocio en Admin para calcular logística.";
  }

  if (!hasDestination || distance === null) {
    return "Define destino para calcular servicio.";
  }

  if (distance > 30) {
    return "Fuera de cobertura operativa. Revisa dirección o solicita cotización.";
  }

  return "Define destino para calcular servicio.";
}

function getAgentDistance(originLat: number | null, originLng: number | null, agent: OrbiAgent) {
  const point = getAgentLocation(agent);
  const originPoint = getValidCoordinatePair({ lat: originLat, lng: originLng });
  const agentPoint = point ? getValidCoordinatePair(point) : null;

  if (!originPoint || !agentPoint) {
    return null;
  }

  return calculateDistanceKm(originPoint.lat, originPoint.lng, agentPoint.lat, agentPoint.lng);
}

function isServiceCompatible(agentService: AgentServiceType, requestedService: AgentServiceType) {
  return agentService === "Todos los servicios" || agentService === requestedService;
}

function buildLocalGeocodeQuery(rawQuery: string) {
  const query = rawQuery.trim();

  if (!query) {
    return "";
  }

  const hasStateOrCountry = /estado de m[eé]xico|m[eé]xico/i.test(query);
  const hasMunicipality = /zumpahuac[aá]n/i.test(query);
  const isShortReference = query.split(/\s+/).filter(Boolean).length <= 3;

  if (hasStateOrCountry || !isShortReference) {
    return query;
  }

  if (hasMunicipality) {
    return `${query}, Estado de México, México`;
  }

  return `${query}, Zumpahuacán, Estado de México, México`;
}

async function reverseGeocodePoint(point: MapPoint) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
      point.lat
    )}&lon=${encodeURIComponent(point.lng)}`
  );

  if (!response.ok) {
    throw new Error("No fue posible consultar la dirección del punto marcado.");
  }

  const result = (await response.json()) as { display_name?: string };
  return result.display_name?.trim() ?? "";
}

function calculateDistanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const earthRadiusKm = 6371;
  const dLat = degreesToRadians(latB - latA);
  const dLng = degreesToRadians(lngB - lngA);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degreesToRadians(latA)) *
      Math.cos(degreesToRadians(latB)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}
