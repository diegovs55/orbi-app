"use client";

import {
  ClipboardList,
  CreditCard,
  LocateFixed,
  MapPin,
  PackageCheck,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Truck,
  UserRound
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AGENT_STATUS,
  AgentServiceType,
  getAgentOperatingEligibility,
  getAgentLocation,
  getAgentLocationDiagnostics,
  getAgents,
  OrbiAgent
} from "@/lib/agents";
import { CatalogProduct, CatalogSearchResult, getCatalogItems, searchCatalog } from "@/lib/catalog";
import {
  ActiveMission,
  createMission,
  getActiveMission,
  getMissionStatusLabel,
  isMissionActive,
  subscribeToMission
} from "@/lib/missions";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

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

type MapPoint = {
  lat: number;
  lng: number;
};

type AgentMatchingDebugRow = {
  id: string;
  name: string;
  status: string;
  isOnOrbit: boolean;
  availability: string;
  operationalBaseLat: number | null;
  operationalBaseLng: number | null;
  currentLat: number | null;
  currentLng: number | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  hasValidLocation: boolean;
  reason: string;
  fallbackWarning: string;
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
const pricingRule = "MVP_DISTANCE_V1";
const showAgentMatchingDebug =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_AGENT_MATCHING === "true";

export function ServiceRequestFlow() {
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);
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
  const [activeMission, setActiveMission] = useState<ActiveMission | null>(() => getActiveMission());

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
    return subscribeToMission(() => setActiveMission(getActiveMission()));
  }, []);

  useEffect(() => {
    let isActive = true;

    getCatalogItems()
      .then((items) => {
        if (!isActive) {
          return;
        }

        setCatalogItems(items);
        setCatalogError("");
      })
      .catch((caughtError: unknown) => {
        if (!isActive) {
          return;
        }

        setCatalogItems([]);
        setCatalogError(
          caughtError instanceof Error
            ? caughtError.message
            : "No fue posible cargar el catálogo Orbi."
        );
      });

    return () => {
      isActive = false;
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
        const radius = agent.radiusKm || 20;
        const exclusionReason = eligibility.eligible ? "" : eligibility.reason;

        console.info("[Orbi matching]", {
          usuario: {
            origin_lat: details.originLat,
            origin_lng: details.originLng,
            tiene_origen_preciso: Boolean(userHasOrigin)
          },
          agente: {
            id: agent.id,
            nombre: agent.name,
            service_type: agent.serviceType,
            status: agent.status,
            is_on_orbit: agent.isOnOrbit,
            availability: agent.availability,
            lat: agent.lat,
            lng: agent.lng,
            current_lat: agent.currentLat,
            current_lng: agent.currentLng,
            operational_base_lat: agent.operationalBaseLat,
            operational_base_lng: agent.operationalBaseLng,
            latitude: agent.latitude,
            longitude: agent.longitude,
            radius_km: radius,
            tiene_ubicacion_operativa: Boolean(eligibility.location)
          },
          distancia_km: distance,
          incluido: !exclusionReason,
          motivo_exclusion: exclusionReason || "Incluido"
        });

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

  const matchingStats = useMemo(() => {
    if (!selectedService) {
      return null;
    }

    const activeAgents = agents.filter((agent) => agent.status === activeAgentStatus && agent.isOnOrbit);
    const serviceCompatibleAgents = activeAgents.filter((agent) =>
      isServiceCompatible(agent.serviceType, selectedService.compatibleType as AgentServiceType)
    );
    const locatedAgents = serviceCompatibleAgents.filter((agent) =>
      getValidCoordinatePair(getAgentLocation(agent) ?? {})
    );

    return {
      total: agents.length,
      active: activeAgents.length,
      serviceCompatible: serviceCompatibleAgents.length,
      located: locatedAgents.length
    };
  }, [agents, selectedService]);

  const matchingDiagnostics = useMemo(() => {
    if (!selectedService) {
      return [];
    }

    const userOrigin = getValidCoordinatePair({
      lat: details.originLat,
      lng: details.originLng
    });

    return agents.map((agent) => {
      const agentPoint = getAgentLocation(agent);
      const validAgentPoint = agentPoint ? getValidCoordinatePair(agentPoint) : null;
      const eligibility = getAgentOperatingEligibility(
        agent,
        selectedService.compatibleType as AgentServiceType,
        userOrigin
      );
      const distance = eligibility.distanceKm;
      const radius = agent.radiusKm || 20;
      const serviceMatches = isServiceCompatible(
        agent.serviceType,
        selectedService.compatibleType as AgentServiceType
      );

      if (agent.status !== activeAgentStatus) {
        return `${agent.name}: fuera de servicio (${agent.status}).`;
      }

      if (!agent.isOnOrbit) {
        return `${agent.name}: fuera de órbita.`;
      }

      if (!serviceMatches) {
        return `${agent.name}: servicio incompatible (${agent.serviceType}).`;
      }

      if (eligibility.reason === "fuera de horario") {
        return `${agent.name}: fuera de horario (${agent.availability || "sin horario definido"}).`;
      }

      if (!validAgentPoint) {
        return `${agent.name}: sin ubicación válida. ${getAgentLocationDiagnostics(agent).reason}`;
      }

      if (distance !== null && distance > radius) {
        return `${agent.name}: fuera de radio (${distance.toFixed(1)} km > ${radius} km).`;
      }

      return `${agent.name}: compatible${distance !== null ? ` a ${distance.toFixed(1)} km` : ""}.`;
    });
  }, [agents, details.originLat, details.originLng, selectedService]);

  const matchingDebugRows = useMemo<AgentMatchingDebugRow[]>(() => {
    return agents.map((agent) => {
      const diagnostics = getAgentLocationDiagnostics(agent);

      return {
        id: agent.id,
        name: agent.name,
        status: agent.status,
        isOnOrbit: agent.isOnOrbit,
        availability: agent.availability,
        operationalBaseLat: agent.operationalBaseLat,
        operationalBaseLng: agent.operationalBaseLng,
        currentLat: agent.currentLat,
        currentLng: agent.currentLng,
        lat: agent.lat,
        lng: agent.lng,
        radiusKm: agent.radiusKm,
        hasValidLocation: diagnostics.hasValidLocation,
        reason: diagnostics.reason,
        fallbackWarning: diagnostics.fallbackWarning
      };
    });
  }, [agents]);

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
  const routeDistance = useMemo(
    () =>
      originCoordinatePair && destinationCoordinatePair
        ? calculateDistanceKm(
            originCoordinatePair.lat,
            originCoordinatePair.lng,
            destinationCoordinatePair.lat,
            destinationCoordinatePair.lng
          )
        : null,
    [destinationCoordinatePair, originCoordinatePair]
  );
  const serviceFee = isCatalogMission ? calculateServiceFee(routeDistance, cartSubtotal) : null;
  const logisticsStatusMessage = getLogisticsStatusMessage({
    hasCatalogOrigin: Boolean(originCoordinatePair),
    hasDestination: Boolean(destinationCoordinatePair),
    distance: routeDistance
  });

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
  }

  function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCatalogMission && !originCoordinatePair) {
      setLocationError("Completa ubicación del negocio en Admin para calcular logística.");
      return;
    }

    setIsRequestReady(true);
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
    const nextCart = existingItem
      ? cartItems.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      : [...cartItems, { product, quantity: 1 }];
    setSelectedService(service);
    setCartItems(nextCart);
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
    setCartItems([]);
    setCartMessage("");
    setDetails((currentDetails) => ({
      ...currentDetails,
      detail: searchQuery ? `Necesidad buscada: ${searchQuery}` : currentDetails.detail
    }));
  }

  function updateCartQuantity(productId: string, quantity: number) {
    const nextCart = cartItems.map((item) =>
      item.product.id === productId ? { ...item, quantity: Math.max(1, quantity) } : item
    );
    setCartItems(nextCart);
    updateDetailsWithCart(nextCart);
  }

  function removeCartItem(productId: string) {
    const nextCart = cartItems.filter((item) => item.product.id !== productId);
    setCartItems(nextCart);
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

  function handleSendMissionToAgent() {
    if (!selectedService || !selectedAgent) {
      return;
    }

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
    const mission = createMission({
      service_type: selectedService.label,
      origin_text: details.origin,
      origin_lat: details.originLat,
      origin_lng: details.originLng,
      destination_text: details.destination,
      destination_lat: details.destinationLat,
      destination_lng: details.destinationLng,
      requester_name: details.requesterName,
      requester_phone: details.requesterPhone,
      detail: ticketDetail,
      business_id: cartBusiness?.businessId,
      product_id: cartItems[0]?.product.id,
      business_lat: cartBusiness?.businessLat,
      business_lng: cartBusiness?.businessLng,
      product_name: cartItems.map((item) => item.product.name).join(", ") || undefined,
      business_name: cartBusiness?.businessName,
      product_price: cartSubtotal || undefined,
      items: cartItems.map((item) => ({
        product_id: item.product.id,
        product_name: item.product.name,
        business_id: item.product.businessId,
        business_name: item.product.businessName,
        quantity: item.quantity,
        price: item.product.price,
        subtotal: item.product.price * item.quantity
      })),
      subtotal_productos: cartSubtotal || undefined,
      service_fee: currentServiceFee ?? undefined,
      total: servicePrice,
      distance_km: routeDistance,
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
      costo_agente: isCatalogMission ? currentServiceFee ?? 0 : cost.agentCost,
      ganancia_orbi: isCatalogMission ? currentServiceFee ?? 0 : servicePrice - cost.agentCost,
      estimated_orbit: getEstimatedOrbit(distance),
      status: "por_tomar"
    });

    setActiveMission(mission);
    setRequestStatusMessage("Solicitud enviada. Esperando confirmación del agente.");
  }

  return (
    <div className="space-y-5">
      <StepHeader
        selectedService={selectedService}
        isRequestReady={isRequestReady}
        selectedAgent={selectedAgent}
      />

      {!selectedService ? (
        <>
          <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/92 via-orbi-panel/76 to-orbi-black/88 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.3),0_0_34px_rgba(31,139,255,0.12)] sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
              Red Orbi
            </p>
            <h2 className="mt-2 text-3xl font-black text-orbi-text">Búscalo y ponlo en órbita</h2>
            <div className="mt-5 flex min-h-14 items-center gap-3 rounded-md border border-orbi-cyan/25 bg-orbi-black/45 px-4 shadow-[0_0_24px_rgba(31,139,255,0.1)]">
              <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-orbi-cyan" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar productos, servicios, mandados o trámites..."
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
            ) : (
              <p className="mt-3 text-sm leading-6 text-orbi-muted">
                Escribe algo como frappe, medicina, traslado al centro, pago de recibo, recoger paquete o impresiones.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-muted">
              Accesos rápidos
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {services.map((service) => {
                const Icon = service.icon;
                return (
                  <button
                    key={service.label}
                    type="button"
                    onClick={() => setSelectedService(service)}
                    className="group rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 text-left shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)] transition hover:-translate-y-0.5 hover:border-orbi-cyan/35"
                  >
                    <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan shadow-[0_0_22px_rgba(31,139,255,0.12)]">
                      <Icon aria-hidden="true" className="h-6 w-6" />
                    </span>
                    <span className="block text-xl font-black text-orbi-text">{service.label}</span>
                    <span className="mt-2 block text-sm leading-6 text-orbi-muted">
                      {service.description}
                    </span>
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
          className="grid gap-4 rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] backdrop-blur sm:grid-cols-2 sm:p-6"
        >
          <SelectedService service={selectedService} onReset={resetFlow} />
          {isCatalogMission ? (
            <LocalCart
              items={cartItems}
              serviceFee={serviceFee}
              distance={routeDistance}
              hasValidDestination={Boolean(destinationCoordinatePair)}
              logisticsStatusMessage={logisticsStatusMessage}
              onQuantityChange={updateCartQuantity}
              onRemove={removeCartItem}
            />
          ) : (
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
          )}
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
              setDetails((currentDetails) => ({ ...currentDetails, scheduleMode: value }))
            }
            onScheduledAtChange={(value) => updateDetails("scheduledAt", value)}
          />
          {/* Future auth user profile autofill */}
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
          {locationError ? (
            <p className="rounded-md border border-yellow-300/15 bg-yellow-300/10 p-3 text-sm font-semibold text-yellow-100 sm:col-span-2">
              {locationError}
            </p>
          ) : null}
          {isCatalogMission ? null : (
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
          )}
          <button
            type="submit"
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] sm:col-span-2"
          >
            Ver agentes compatibles
          </button>
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

          {isLoadingAgents ? (
            <StateCard title="Buscando agentes compatibles..." body="Estamos revisando disponibilidad en Red Orbi." />
          ) : agentError ? (
            <StateCard title="No pudimos cargar agentes." body={agentError} tone="error" />
          ) : compatibleAgents.length ? (
            <>
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
              {showAgentMatchingDebug && matchingStats ? (
                <MatchingDebug
                  stats={matchingStats}
                  diagnostics={matchingDiagnostics}
                  agents={matchingDebugRows}
                />
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
              {showAgentMatchingDebug && matchingStats ? (
                <MatchingDebug
                  stats={matchingStats}
                  diagnostics={matchingDiagnostics}
                  agents={matchingDebugRows}
                />
              ) : null}
              <StateCard
                title="No hay agentes disponibles para este servicio o zona."
                body={
                  invalidOperationalLocationCount
                    ? `${invalidOperationalLocationCount} agente(s) coinciden por servicio y estado, pero fueron excluidos por no tener lat/lng válidos.`
                    : "Cambia el servicio o ajusta tu ubicación para buscar de nuevo."
                }
                actionLabel="Cambiar servicio o ajustar ubicación"
                onAction={() => {
                  setSelectedAgent(null);
                  setIsRequestReady(false);
                }}
              />
            </>
          )}
        </section>
      ) : null}

      {selectedService && selectedAgent ? (
        <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
            Confirmar misión
          </p>
          <h2 className="mt-2 text-2xl font-black text-orbi-text">Misión lista para enviar</h2>
          <div className="mt-5 grid gap-3 text-sm text-orbi-muted sm:grid-cols-2">
            <SummaryItem label="Resumen de servicio" value={selectedService.label} />
            {isCatalogMission && cartBusiness ? (
              <>
                <SummaryItem label="Negocio" value={cartBusiness.businessName} />
                <SummaryItem label="Productos" value={`${cartItems.length} producto(s)`} />
                <SummaryItem label="Subtotal productos" value={`$${cartSubtotal}`} />
                <SummaryItem label="Sector" value={cartBusiness.sector} />
              </>
            ) : null}
            <SummaryItem label="Origen" value={details.origin} />
            <SummaryItem label="Origen lat/lng" value={formatCoordinates(details.originLat, details.originLng)} />
            <SummaryItem label="Destino" value={details.destination} />
            <SummaryItem label="Destino lat/lng" value={formatCoordinates(details.destinationLat, details.destinationLng)} />
            <SummaryItem label="Horario" value={getDesiredTimeLabel(details)} />
            <SummaryItem label="Solicitante" value={details.requesterName} />
            <SummaryItem label="Teléfono" value={details.requesterPhone} />
            <SummaryItem label="Agente seleccionado" value={selectedAgent.name} />
            <SummaryItem label="Zona del agente" value={selectedAgent.zone} />
            <SummaryItem
              label="Distancia aproximada"
              value={formatDistance(getAgentDistance(details.originLat, details.originLng, selectedAgent))}
            />
            <SummaryItem label="Vehículo" value={selectedAgent.vehicle || "No especificado"} />
            <SummaryItem label="Nivel del agente" value={selectedAgent.trustLevel} />
            <SummaryItem label="Estado de pago" value={paymentStatus} />
            <SummaryItem label="Método de pago" value={paymentMethod} />
            <SummaryItem
              label="Órbita estimada"
              value={getEstimatedOrbit(getAgentDistance(details.originLat, details.originLng, selectedAgent))}
            />
            <SummaryItem
              label={isCatalogMission ? "Ticket de misión" : "Detalle"}
              value={
                isCatalogMission
                  ? buildCartTicket(cartItems, serviceFee, logisticsStatusMessage)
                  : details.detail
              }
              wide
            />
          </div>

          <div className="mt-5 rounded-md border border-orbi-cyan/20 bg-gradient-to-br from-orbi-blue/[0.14] to-white/[0.04] p-4 shadow-[0_0_28px_rgba(31,139,255,0.1)]">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
              Tiempo estimado de atención
            </p>
            <h3 className="mt-2 text-2xl font-black text-orbi-text">
              Órbita estimada: {getEstimatedOrbit(getAgentDistance(details.originLat, details.originLng, selectedAgent))}
            </h3>
            <p className="mt-2 text-sm leading-6 text-orbi-muted">
              Es una referencia aproximada según distancia y disponibilidad operativa; el agente confirma la misión.
            </p>
          </div>

          <div className="mt-5 rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-4">
            <h3 className="text-lg font-black text-orbi-text">Coordinación de pago</h3>
            <p className="mt-1 text-sm leading-6 text-orbi-muted">
              Define cómo se coordinará la misión con el agente. No hay pasarela integrada todavía.
            </p>
            <p className="mt-4 text-sm font-semibold text-orbi-text">Estado de pago</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {paymentStatuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setPaymentStatus(status)}
                  className={`min-h-11 rounded-md border px-3 py-2 text-sm font-bold transition ${
                    paymentStatus === status
                      ? "border-orbi-cyan/45 bg-orbi-blue/25 text-orbi-cyan"
                      : "border-white/10 bg-white/[0.04] text-orbi-muted hover:bg-white/10"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <p className="mt-4 text-sm font-semibold text-orbi-text">Método de pago</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {paymentMethods.map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`min-h-11 rounded-md border px-3 py-2 text-sm font-bold transition ${
                    paymentMethod === method
                      ? "border-orbi-cyan/45 bg-orbi-blue/25 text-orbi-cyan"
                      : "border-white/10 bg-white/[0.04] text-orbi-muted hover:bg-white/10"
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          {requestStatusMessage ? (
            <p className="mt-5 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-200">
              {requestStatusMessage}
            </p>
          ) : null}

          {activeMission && activeMission.selected_agent_id === selectedAgent.id ? (
            <div className="mt-5 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] p-4">
              <p className="text-sm font-bold text-orbi-cyan">
                {activeMission.status === "aceptada"
                  ? `Misión aceptada por ${activeMission.selected_agent_name}`
                  : activeMission.status === "por_tomar"
                    ? "Esperando confirmación del agente"
                    : getMissionStatusLabel(activeMission.status)}
              </p>
              {activeMission.status === "por_tomar" ? (
                <p className="mt-2 text-sm leading-6 text-orbi-muted">
                  La solicitud ya está en la red. El agente seleccionado puede tomarla desde Orbi.
                </p>
              ) : null}
              {isMissionActive(activeMission) ? (
                <Link
                  href="/orbita"
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] sm:w-auto"
                >
                  Ver misión en órbita
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setSelectedAgent(null)}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-orbi-text transition hover:bg-white/10"
            >
              Cambiar agente
            </button>
            <button
              type="button"
              onClick={handleSendMissionToAgent}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
            >
              <Send aria-hidden="true" className="h-5 w-5" />
              Enviar solicitud al agente
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
  isRequestReady,
  selectedAgent
}: {
  selectedService: ServiceOption | null;
  isRequestReady: boolean;
  selectedAgent: OrbiAgent | null;
}) {
  const steps = [
    { label: "Servicio", active: true, done: Boolean(selectedService) },
    { label: "Ficha", active: Boolean(selectedService), done: isRequestReady },
    { label: "Agente", active: isRequestReady, done: Boolean(selectedAgent) },
    { label: "Confirmar misión", active: Boolean(selectedAgent), done: false }
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {steps.map((step) => (
        <div
          key={step.label}
          className={`rounded-md border px-2 py-2 text-center text-[11px] font-bold ${
            step.done || step.active
              ? "border-orbi-cyan/25 bg-orbi-blue/10 text-orbi-cyan"
              : "border-white/10 bg-white/[0.03] text-orbi-muted"
          }`}
        >
          {step.label}
        </div>
      ))}
    </div>
  );
}

function SelectedService({
  service,
  onReset,
  actionLabel = "Cambiar servicio"
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
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
              Necesidad seleccionada
            </p>
            <p className="mt-1 font-black text-orbi-text">{service.label}</p>
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
  if (!results.length) {
    return (
      <div className="mt-4 rounded-md border border-white/10 bg-white/[0.04] p-4">
        <p className="text-sm font-bold text-orbi-text">
          No encontramos algo exacto, pero podemos ayudarte con un mandado o misión personalizada.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(["Mandado", "Compra local", "Servicio personalizado"] as const).map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => onSelectCustomMission(label)}
              className="min-h-10 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
            >
              {label}
            </button>
          ))}
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
        {results.slice(0, 6).map((result) => (
          <button
            key={result.id}
            type="button"
            onClick={() => onSelectProduct(result)}
            className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-orbi-cyan/35 hover:bg-orbi-blue/[0.08]"
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
                {cartItems.some((item) => item.product.id === result.id) ? "Agregado" : `$${result.price}`}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function LocalCart({
  items,
  serviceFee,
  distance,
  hasValidDestination,
  logisticsStatusMessage,
  onQuantityChange,
  onRemove
}: {
  items: CartItem[];
  serviceFee: number | null;
  distance: number | null;
  hasValidDestination: boolean;
  logisticsStatusMessage: string;
  onQuantityChange: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}) {
  const subtotal = getCartSubtotal(items);
  const business = items[0]?.product;
  const hasValidBusinessOrigin = business
    ? Boolean(getValidCoordinatePair({ lat: business.businessLat, lng: business.businessLng }))
    : false;

  return (
    <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4 sm:col-span-2">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
        Ticket de misión
      </p>
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
                  <input
                    min={1}
                    type="number"
                    value={item.quantity}
                    onChange={(event) => onQuantityChange(item.product.id, Number(event.target.value))}
                    className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-orbi-text outline-none"
                  />
                </label>
                <span className="rounded-full border border-orbi-cyan/20 bg-orbi-blue/10 px-3 py-2 text-sm font-black text-orbi-cyan">
                  ${subtotalItem}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <InfoTile label="Subtotal productos" value={`$${subtotal}`} />
        <InfoTile
          label="Servicio/logística"
          value={serviceFee === null ? logisticsStatusMessage : `$${serviceFee}`}
        />
        <InfoTile
          label="Total a pagar"
          value={serviceFee === null ? logisticsStatusMessage : `$${subtotal + serviceFee}`}
        />
      </div>
      {distance !== null ? (
        <p className="mt-2 text-xs font-semibold text-orbi-muted">
          Distancia origen-destino: {distance.toFixed(1)} km · Regla {pricingRule}
        </p>
      ) : null}
      {!hasValidDestination || !hasValidBusinessOrigin || (distance !== null && distance > 30) ? (
        <p className="mt-2 rounded-md border border-yellow-300/15 bg-yellow-300/10 p-2 text-xs font-semibold text-yellow-100">
          {logisticsStatusMessage}
        </p>
      ) : null}
      {distance !== null && distance > 50 ? (
        <p className="mt-2 rounded-md border border-red-300/15 bg-red-400/10 p-2 text-xs font-semibold text-red-100">
          La distancia parece fuera de zona. Revisa origen y destino.
        </p>
      ) : null}
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

function MatchingDebug({
  stats,
  diagnostics,
  agents
}: {
  stats: {
    total: number;
    active: number;
    serviceCompatible: number;
    located: number;
  };
  diagnostics: string[];
  agents: AgentMatchingDebugRow[];
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-xs font-semibold text-orbi-muted">
      <div className="grid gap-2 sm:grid-cols-4">
        <span>Agentes totales: {stats.total}</span>
        <span>En órbita: {stats.active}</span>
        <span>Servicio compatible: {stats.serviceCompatible}</span>
        <span>Ubicación válida: {stats.located}</span>
      </div>
      {diagnostics.length ? (
        <div className="mt-3 space-y-1 border-t border-white/10 pt-3">
          {diagnostics.slice(0, 5).map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      ) : null}
      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
        <p className="font-black uppercase tracking-[0.14em] text-amber-100">
          Debug temporal Supabase → matching
        </p>
        {agents.map((agent) => (
          <div key={agent.id} className="rounded-md border border-white/10 bg-orbi-black/35 p-3">
            <div className="flex flex-wrap gap-2 text-orbi-text">
              <span>{agent.name}</span>
              <span>id: {agent.id || "sin id"}</span>
              <span>status: {agent.status}</span>
              <span>is_on_orbit: {String(agent.isOnOrbit)}</span>
              <span>horario: {agent.availability || "sin horario"}</span>
              <span className={agent.hasValidLocation ? "text-orbi-cyan" : "text-red-200"}>
                hasValidLocation: {String(agent.hasValidLocation)}
              </span>
            </div>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              <span>
                operational_base_lat/lng:{" "}
                {formatNullablePair(agent.operationalBaseLat, agent.operationalBaseLng)}
              </span>
              <span>current_lat/lng: {formatNullablePair(agent.currentLat, agent.currentLng)}</span>
              <span>lat/lng: {formatNullablePair(agent.lat, agent.lng)}</span>
              <span>radius_km: {agent.radiusKm}</span>
            </div>
            <p className="mt-2 text-amber-100">Razón: {agent.reason}</p>
            {agent.fallbackWarning ? <p className="mt-1 text-amber-100">{agent.fallbackWarning}</p> : null}
          </div>
        ))}
      </div>
    </div>
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

function estimateMissionCost(distance: number | null) {
  const safeDistance = distance ?? 3;
  const price = Math.round(45 + safeDistance * 12);
  const agentCost = Math.round(price * 0.7);

  return {
    price,
    agentCost,
    orbiProfit: price - agentCost
  };
}

function calculateServiceFee(distance: number | null, subtotal: number) {
  if (distance === null || !Number.isFinite(distance) || distance < 0 || distance > 30) {
    return null;
  }

  let fee = 25;

  if (distance <= 2) {
    fee = 25;
  } else if (distance <= 5) {
    fee = 35;
  } else if (distance <= 8) {
    fee = 45;
  } else if (distance <= 12) {
    fee = 60;
  } else if (distance <= 20) {
    fee = 80;
  }

  if (subtotal > 600) {
    fee += 20;
  } else if (subtotal > 300) {
    fee += 10;
  }

  return fee;
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
