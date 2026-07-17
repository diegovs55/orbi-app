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
import { calculateServiceFee, PRICING_RULE, CATALOG } from "@/lib/pricing";
import { CatalogProduct, CatalogSearchResult, getCatalogItems, searchCatalog } from "@/lib/catalog";
import {
  getCurrentCustomerSession,
  loginCustomerWithSupabase,
  registerCustomerAccount,
  saveCustomerSession,
} from "@/lib/customers";
import {
  ActiveMission,
  cancelMissionByCustomer,
  createMission,
  fetchActiveMission,
  getMissionStatusLabel,
  isCancellableByCustomer,
  isMissionActive,
  isMissionClosed,
  updateActiveMission,
  updateActiveMissionById,
} from "@/lib/missions";
import { fetchRoute } from "@/lib/routing";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import {
  clearDraft,
  isDraftMeaningful,
  loadDraft,
  saveDraft,
  type DraftCartItem,
  type OrderDraft,
} from "@/lib/order-draft";
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


type SearchSuggestion = {
  displayName: string;
  lat: number;
  lon: number;
  providerId: string;
};

// Ubicación propuesta por ORBI (GPS o mapa) que espera confirmación del usuario (ORBI-UX-01).
type DestPendingConfirm = { text: string; lat: number; lng: number };

/** Derives the WaitingRequestCard message from the mission's actual status.
 *  Copy follows the exact Client → Negocio → Agente sequence.
 *  No agent is mentioned before one is assigned (aceptada/en_mision).
 *  Cancel overrides this with its own message via waitingRequestMessage prop. */
function missionWaitingMessage(mission: ActiveMission | null): string {
  if (!mission) return "";
  const negocio = mission.business_name?.trim() || "El negocio";
  const agente  = mission.selected_agent_name?.trim() || "El agente";
  switch (mission.status) {
    case "esperando_negocio":
      return `Tu misión ya está en órbita. Ahora ${negocio} revisará tu pedido.`;
    case "preparando":
      return `${negocio} confirmó tu pedido. Lo están preparando.`;
    case "por_tomar":
      return "Buscando un agente disponible.";
    case "aceptada":
      return `${agente} aceptó tu misión. Ya va en camino.`;
    case "en_mision":
      return `${agente} está en camino con tu pedido.`;
    default:
      return "";
  }
}

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
  const [mapTarget, setMapTarget] = useState<LocationTarget | null>(null);
  const [mapPoint, setMapPoint] = useState<MapPoint>(zumpahuacanCenter);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("Pago al finalizar la misión");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Efectivo");
  const [requestStatusMessage, setRequestStatusMessage] = useState("");
  // Initialized as null to avoid SSR/client hydration mismatch (localStorage
  // is unavailable on the server). The useEffect below loads the real value.
  const [activeMission, setActiveMission] = useState<ActiveMission | null>(null);
  // True while the reconciliation effect is running — blocks form and mission card.
  const [isReconcilingMission, setIsReconcilingMission] = useState(true);
  const isReconcilingMissionRef = useRef(true);
  const [networkReconcileError, setNetworkReconcileError] = useState(false);
  const [expandedDraftSection, setExpandedDraftSection] = useState<DraftSection | null>(null);
  const [isCartDetailExpanded, setIsCartDetailExpanded] = useState(false);
  const [showWaitingCancelConfirm, setShowWaitingCancelConfirm] = useState(false);
  const [waitingRequestMessage, setWaitingRequestMessage] = useState("");
  const [customerSession, setCustomerSession] = useState<{ name: string; phone: string; email?: string } | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [confirmedDraftSections, setConfirmedDraftSections] = useState<ConfirmedDraftSections>(() =>
    getInitialConfirmedDraftSections(null)
  );

  const router = useRouter();
  const [isSending, setIsSending] = useState(false);
  // Ref guard: immune to React stale-closure race when two clicks arrive in the
  // same event-loop tick before a re-render flushes the isSending state update.
  const isSendingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // ID del log de interpretación activo (null si no hubo búsqueda por texto libre)
  const intentionLogIdRef = useRef<string | null>(null);
  const [orbitExperienceActive, setOrbitExperienceActive] = useState(false);
  const [sentMission, setSentMission] = useState<ActiveMission | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [showDraftChoice, setShowDraftChoice] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When true, the auto-save timer must not write to localStorage — the draft
  // has been intentionally consumed (mission sent) or discarded by the user.
  const draftSuppressedRef = useRef(false);
  const pendingDraftAgentId = useRef<string | null>(null);

  // PR-05 — LocationPicker para origen (ORBI-UX-01)
  const [originPendingConfirm, setOriginPendingConfirm] = useState<DestPendingConfirm | null>(null);
  const [originGpsLoading, setOriginGpsLoading] = useState(false);
  const [originGpsError, setOriginGpsError] = useState("");

  // PR-05 — LocationPicker para destino (ORBI-UX-01)
  const [destPendingConfirm, setDestPendingConfirm] = useState<DestPendingConfirm | null>(null);
  const [destGpsLoading, setDestGpsLoading] = useState(false);
  const [destGpsError, setDestGpsError] = useState("");

  // Cotización de precio desde servidor — garantiza que el preview = precio persistido.
  const [directQuote, setDirectQuote] = useState<{ fee: number; loading: boolean; error: boolean }>({
    fee: 0, loading: false, error: false,
  });

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
      goToStep("solicitante");
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

  // Restore agent from draft once the agents list is available.
  useEffect(() => {
    if (!pendingDraftAgentId.current || agents.length === 0) return;
    const match = agents.find((a) => a.id === pendingDraftAgentId.current);
    if (match) {
      setSelectedAgent(match);
      pendingDraftAgentId.current = null;
    }
  }, [agents]);

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

  // Mission reconciliation on mount: Supabase is the source of truth.
  // We do NOT render any mission card until we have verified the local entry against
  // Supabase. This prevents stale localStorage state (e.g. por_tomar in localStorage,
  // cumplida in Supabase) from showing a ghost mission on /pedir.
  //
  // Three-way result:
  //   found + active   → replace local with authoritative full row → show mission
  //   found + terminal → remove from localStorage → show clean /pedir
  //   not_found        → id no longer exists in DB → remove local entry → clean /pedir
  //   network_error    → can't verify → keep local state, show mission conservatively
  //                      (do NOT delete a mission just because the network failed)
  //
  // On mount: ask Supabase for the authenticated user's active mission.
  // localStorage is not consulted for missions — Supabase is the only source of truth.
  useEffect(() => {
    async function loadActiveMission() {
      // isReconcilingMission starts true — nothing renders until this resolves.
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        // Not authenticated: no active mission possible.
        const draft = loadDraft();
        if (draft && isDraftMeaningful(draft)) {
          setDraftId(draft.draftId);
          setShowDraftChoice(true);
        }
        isReconcilingMissionRef.current = false;
        setIsReconcilingMission(false);
        return;
      }

      const mission = await fetchActiveMission(user.id);

      if (mission) {
        // Active mission found — clear any orphan draft and show tracking.
        const orphan = loadDraft();
        if (orphan) clearDraft();
        setActiveMission(mission);
      } else {
        // No active mission — offer draft if one exists.
        const draft = loadDraft();
        if (draft && isDraftMeaningful(draft)) {
          setDraftId(draft.draftId);
          setShowDraftChoice(true);
        }
      }

      isReconcilingMissionRef.current = false;
      setIsReconcilingMission(false);
    }

    void loadActiveMission();
  }, []);

  // Mission realtime subscription: Supabase channel only — no localStorage listeners.
  // React state (activeMission) is the in-memory representation; Supabase is the authority.
  useEffect(() => {
    const channelName = `customer-mission-${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(channelName);
    ch.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "missions" },
      (payload) => {
        if (isReconcilingMissionRef.current) return;
        const updated = (payload.new ?? {}) as Partial<ActiveMission> & { id?: string };
        if (!updated.id) return;
        // Only apply if this update targets the mission we're currently tracking.
        setActiveMission((current) => {
          if (!current || current.id !== updated.id) return current;
          return { ...current, ...updated } as ActiveMission;
        });
      }
    );
    void ch.subscribe();

    return () => { void ch.unsubscribe(); };
  }, []);

  // Waiting-request acceptance: navigate to /orbita when the mission becomes "aceptada".
  // Covers the case where no agent was available at creation time and the user stayed on
  // /pedir watching the WaitingRequestCard. The direct-agent flow (handleSendMissionToAgent)
  // manages its own navigation via setOrbitExperienceActive + router.push after 1750ms,
  // so orbitExperienceActive guards against double-navigation.
  useEffect(() => {
    if (isReconcilingMission) return;
    if (!activeMission || activeMission.status !== "aceptada") return;
    if (orbitExperienceActive) return;
    router.push(`/orbita/${activeMission.id}`);
  }, [activeMission?.status, activeMission?.id, isReconcilingMission, orbitExperienceActive, router]);

  // Autofill solicitante — Auth is source of truth, localStorage is fallback.
  // Runs once on mount (SSR-safe). Two-phase: localStorage fills immediately,
  // then Supabase Auth upgrades if the customer is already authenticated.
  useEffect(() => {
    let cancelled = false;

    // Phase 1 — immediate fill from localStorage
    const localSession = getCurrentCustomerSession();
    if (localSession) {
      setCustomerSession(localSession);
      if (localSession.userId) {
        setAuthUserId(localSession.userId);
      }
      setDetails((prev) => {
        if (prev.requesterName || prev.requesterPhone) return prev;
        return { ...prev, requesterName: localSession.name, requesterPhone: localSession.phone };
      });
    }

    // Phase 2 — upgrade to Supabase Auth if available (~200 ms async)
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      setAuthUserId(user.id);
      const meta = user.user_metadata as { name?: string; phone?: string } | undefined;
      const name = meta?.name?.trim() ?? "";
      const phone = meta?.phone?.trim() ?? "";
      if (!name && !phone) return;
      setCustomerSession({ name, phone });
      setDetails((prev) => ({
        ...prev,
        requesterName: name || prev.requesterName,
        requesterPhone: phone || prev.requesterPhone,
      }));
    });

    return () => { cancelled = true; };
  }, []);

  // Eager draftId — generated the moment the user picks a service, without
  // waiting for the 800 ms auto-save debounce. Reuses any UUID already in
  // localStorage so reload/remount/two-tabs all share the same idempotency key.
  useEffect(() => {
    if (draftSuppressedRef.current) return; // draft was sent — do not recreate with stale form data
    if (!selectedService || draftId) return;
    const existing = loadDraft();
    const id = existing?.draftId ?? crypto.randomUUID();
    saveDraft(
      {
        selectedService: { label: selectedService.label, compatibleType: selectedService.compatibleType },
        selectedStep,
        details,
        cartItems: cartItems.map((ci) => ({
          product: ci.product as Record<string, unknown>,
          quantity: ci.quantity,
        })),
        selectedAgent: selectedAgent
          ? { id: selectedAgent.id, name: selectedAgent.name }
          : null,
        paymentStatus,
        paymentMethod,
        confirmedDraftSections,
      },
      id,
    );
    setDraftId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService, draftId]);

  // Draft auto-save — debounced 800 ms whenever meaningful state changes.
  useEffect(() => {
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      if (draftSuppressedRef.current) return; // draft was sent or discarded — never recreate
      if (!selectedService) return; // not meaningful yet
      const saved = saveDraft(
        {
          selectedService: selectedService
            ? { label: selectedService.label, compatibleType: selectedService.compatibleType }
            : null,
          selectedStep,
          details,
          cartItems: cartItems.map((ci) => ({
            product: ci.product as Record<string, unknown>,
            quantity: ci.quantity,
          })),
          selectedAgent: selectedAgent
            ? {
                id: selectedAgent.id,
                name: selectedAgent.name,
                zone: selectedAgent.zone,
                vehicle: selectedAgent.vehicle,
                trustLevel: selectedAgent.trustLevel,
                lat: selectedAgent.lat,
                lng: selectedAgent.lng,
                status: selectedAgent.status,
                serviceType: selectedAgent.serviceType,
                isOnOrbit: selectedAgent.isOnOrbit,
              }
            : null,
          paymentStatus,
          paymentMethod,
          confirmedDraftSections,
        },
        draftId ?? undefined,
      );
      setDraftId(saved.draftId);
    }, 800);
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService, selectedStep, details, cartItems, selectedAgent, paymentStatus, paymentMethod, confirmedDraftSections]);

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

  // Cotización de precio para traslado directo — consulta el mismo motor que usa el backend.
  // No requiere agente seleccionado: DEC-16-B solo necesita origin→destination (ORBI-P-13).
  useEffect(() => {
    if (isCatalogMission || !details.originLat || !details.originLng || !details.destinationLat || !details.destinationLng) {
      setDirectQuote({ fee: 0, loading: false, error: false });
      return;
    }
    const agentLocation = selectedAgent ? getAgentLocation(selectedAgent) : null;
    let cancelled = false;
    setDirectQuote((q) => ({ ...q, loading: true, error: false }));
    void fetch("/api/pricing/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        is_catalog:      false,
        ...(agentLocation ? { agent_lat: agentLocation.lat, agent_lng: agentLocation.lng } : {}),
        origin_lat:      details.originLat,
        origin_lng:      details.originLng,
        destination_lat: details.destinationLat,
        destination_lng: details.destinationLng,
        distance_km:     routeDistance,
        service_type:    selectedService?.label ?? "",
      }),
    })
      .then((r) => r.json())
      .then((data: { serviceFee?: number }) => {
        if (!cancelled) setDirectQuote({ fee: data.serviceFee ?? 0, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setDirectQuote((q) => ({ ...q, loading: false, error: true }));
      });
    return () => { cancelled = true; };
  }, [
    isCatalogMission, selectedAgent,
    details.originLat, details.originLng,
    details.destinationLat, details.destinationLng,
    routeDistance, selectedService,
  ]);

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
    setOriginGpsLoading(false);
    setOriginGpsError("");
    setOriginPendingConfirm(null);
    setDestGpsLoading(false);
    setDestGpsError("");
    setDestPendingConfirm(null);
  }

  function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCatalogMission && !originCoordinatePair) {
      setLocationError("Completa ubicación del negocio en Admin para calcular logística.");
      return;
    }

    setIsRequestReady(true);
    goToStep("confirmacion");
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

  function handleSelectCustomMission(
    label: ServiceOption["label"],
    intentionContext?: { intencionOrbi: string; propuestaMostrada: string; resultadosCatalogo: number },
  ) {
    const service = services.find((item) => item.label === label) ?? services[0];
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

    // Auditoría de interpretación: solo cuando proviene de búsqueda por texto libre.
    if (searchQuery.trim() && intentionContext) {
      const { intencionOrbi, propuestaMostrada, resultadosCatalogo } = intentionContext;
      const correccionHumana = label !== intencionOrbi ? label : null;
      void fetch("/api/intention-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto_original:      searchQuery.trim(),
          intencion_orbi:      intencionOrbi,
          propuesta_mostrada:  propuestaMostrada,
          resultados_catalogo: resultadosCatalogo,
          correccion_humana:   correccionHumana,
        }),
      })
        .then((r) => r.json())
        .then((data: { id?: string }) => {
          if (data.id) intentionLogIdRef.current = data.id;
        })
        .catch(() => { /* fire-and-forget: el flujo principal no depende del log */ });
    }
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
    if (target === "origin") setOriginPendingConfirm(null);
    if (target === "destination") setDestPendingConfirm(null);
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

  // PR-05.4 — GPS para origen. ORBI obtiene la ubicación; el usuario confirma con "¿Es aquí?" (ORBI-UX-01).
  function handleOriginGps() {
    setOriginGpsError("");
    setOriginPendingConfirm(null);
    setOriginGpsLoading(true);

    if (!navigator.geolocation) {
      setOriginGpsError("GPS no disponible. Escribe la dirección o usa el mapa.");
      setOriginGpsLoading(false);
      return;
    }

    // [DIAG-GPS]
    const _reqId = ++_gpsReqCounter;
    const _reqStart = Date.now();
    const _reqOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 };
    if (navigator.permissions) {
      navigator.permissions.query({ name: "geolocation" }).then((r) => {
        console.info("[GPS:permission]", { fn: "handleOriginGps", reqId: _reqId, state: r.state });
      }).catch(() => undefined);
    }
    console.info("[GPS:start]", {
      fn: "handleOriginGps", reqId: _reqId,
      time: new Date().toISOString(), visibility: document.visibilityState, options: _reqOptions,
    });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        console.info("[GPS:success]", {
          fn: "handleOriginGps", reqId: _reqId, elapsedMs: Date.now() - _reqStart,
          lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy,
        });
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        _lastKnownCustomerPos = point;
        try {
          const text = await reverseGeocodePoint(point);
          setOriginPendingConfirm({ text: text || "Ubicación actual", lat: point.lat, lng: point.lng });
        } catch {
          setOriginPendingConfirm({ text: "Ubicación actual", lat: point.lat, lng: point.lng });
        } finally {
          setOriginGpsLoading(false);
        }
      },
      (err) => {
        console.error("[GPS:error]", {
          fn: "handleOriginGps", reqId: _reqId, elapsedMs: Date.now() - _reqStart,
          code: err.code, message: err.message,
        });
        const msg = err.code === 1
          ? "Activa el GPS en Configuración → Safari → Ubicación para usar esta función."
          : err.code === 3
          ? "Tardó demasiado en ubicarte. Prueba de nuevo o usa el mapa."
          : "No pudimos ubicarte ahora. Prueba de nuevo o usa el mapa.";
        setOriginGpsError(msg);
        setOriginGpsLoading(false);
      },
      _reqOptions
    );
  }

  function handleOriginConfirmPending() {
    if (!originPendingConfirm) return;
    updateCoordinateDetails("origin", { latitude: originPendingConfirm.lat, longitude: originPendingConfirm.lng });
    setDetails((d) => ({ ...d, origin: originPendingConfirm.text }));
    setOriginPendingConfirm(null);
  }

  function handleOriginRejectPending() {
    setOriginPendingConfirm(null);
  }

  // PR-05 — GPS para destino. ORBI obtiene la ubicación; el usuario confirma con "¿Es aquí?" (ORBI-UX-01).
  function handleDestGps() {
    setDestGpsError("");
    setDestPendingConfirm(null);
    setDestGpsLoading(true);

    if (!navigator.geolocation) {
      setDestGpsError("No pudimos ubicarte. Escribe la dirección o usa el mapa.");
      setDestGpsLoading(false);
      return;
    }

    // [DIAG-GPS]
    const _reqId = ++_gpsReqCounter;
    const _reqStart = Date.now();
    const _reqOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 };
    if (navigator.permissions) {
      navigator.permissions.query({ name: "geolocation" }).then((r) => {
        console.info("[GPS:permission]", { fn: "handleDestGps", reqId: _reqId, state: r.state });
      }).catch(() => undefined);
    }
    console.info("[GPS:start]", {
      fn: "handleDestGps", reqId: _reqId,
      time: new Date().toISOString(), visibility: document.visibilityState, options: _reqOptions,
    });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        console.info("[GPS:success]", {
          fn: "handleDestGps", reqId: _reqId, elapsedMs: Date.now() - _reqStart,
          lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy,
        });
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        _lastKnownCustomerPos = point;
        try {
          const text = await reverseGeocodePoint(point);
          setDestPendingConfirm({ text: text || "Ubicación actual", lat: point.lat, lng: point.lng });
        } catch {
          setDestPendingConfirm({ text: "Ubicación actual", lat: point.lat, lng: point.lng });
        } finally {
          setDestGpsLoading(false);
        }
      },
      (err) => {
        console.error("[GPS:error]", {
          fn: "handleDestGps", reqId: _reqId, elapsedMs: Date.now() - _reqStart,
          code: err.code, message: err.message,
        });
        const msg = err.code === 1
          ? "Activa el GPS en Configuración → Safari → Ubicación para usar esta función."
          : err.code === 3
          ? "Tardó demasiado en ubicarte. Prueba de nuevo o usa el mapa."
          : "No pudimos ubicarte ahora. Prueba de nuevo o usa el mapa.";
        setDestGpsError(msg);
        setDestGpsLoading(false);
      },
      _reqOptions
    );
  }

  // ORBI-UX-01 — usuario confirma la propuesta del sistema.
  function handleDestConfirmPending() {
    if (!destPendingConfirm) return;
    setDetails((d) => ({
      ...d,
      destination: destPendingConfirm.text,
      destinationLat: destPendingConfirm.lat,
      destinationLng: destPendingConfirm.lng,
    }));
    setConfirmedDraftSections((s) => ({ ...s, destino: true }));
    setDestPendingConfirm(null);
  }

  function handleDestRejectPending() {
    setDestPendingConfirm(null);
  }

  // ORBI-UX-01 — usuario eligió de la lista; se confirma sin paso adicional.
  function handleDestSelectSuggestion(displayName: string, lat: number, lon: number) {
    setDetails((d) => ({
      ...d,
      destination: displayName,
      destinationLat: lat,
      destinationLng: lon,
    }));
    setConfirmedDraftSections((s) => ({ ...s, destino: true }));
    setDestPendingConfirm(null);
    setDestGpsError("");
  }

  function handleOpenMap(target: LocationTarget) {
    const currentLat = target === "origin" ? details.originLat : details.destinationLat;
    const currentLng = target === "origin" ? details.originLng : details.destinationLng;
    const currentPoint = getValidCoordinatePair({ lat: currentLat, lng: currentLng });

    setMapPoint(currentPoint ?? zumpahuacanCenter);
    setMapTarget(target);

    if (!currentPoint && navigator.geolocation) {
      // [DIAG-GPS]
      const _reqId = ++_gpsReqCounter;
      const _reqStart = Date.now();
      const _reqOptions = { enableHighAccuracy: true, timeout: 8000 };
      console.info("[GPS:start]", {
        fn: "handleOpenMap", reqId: _reqId,
        time: new Date().toISOString(), visibility: document.visibilityState,
        target, options: _reqOptions,
      });
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.info("[GPS:success]", {
            fn: "handleOpenMap", reqId: _reqId, elapsedMs: Date.now() - _reqStart,
            lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy,
          });
          setMapPoint({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (err) => {
          console.error("[GPS:error]", {
            fn: "handleOpenMap", reqId: _reqId, elapsedMs: Date.now() - _reqStart,
            code: err.code, message: err.message,
          });
        },
        _reqOptions
      );
    }
  }

  async function handleConfirmMapPoint() {
    if (!mapTarget) {
      return;
    }

    setIsReverseGeocoding(true);

    try {
      const address = await reverseGeocodePoint(mapPoint);

      if (mapTarget === "destination") {
        // ORBI-UX-01: el mapa propuso el punto; el usuario confirma con "¿Es aquí?".
        setDestPendingConfirm({
          text: address || "Punto marcado en mapa",
          lat: mapPoint.lat,
          lng: mapPoint.lng,
        });
      } else {
        // PR-05.4 / ORBI-UX-01: mismo flujo de confirmación para origen.
        setOriginPendingConfirm({
          text: address || "Punto marcado en mapa",
          lat: mapPoint.lat,
          lng: mapPoint.lng,
        });
      }
      setMapTarget(null);
    } catch {
      if (mapTarget === "destination") {
        setDestPendingConfirm({
          text: "Punto marcado en mapa",
          lat: mapPoint.lat,
          lng: mapPoint.lng,
        });
      } else {
        setOriginPendingConfirm({
          text: "Punto marcado en mapa",
          lat: mapPoint.lat,
          lng: mapPoint.lng,
        });
      }
      setMapTarget(null);
    } finally {
      setIsReverseGeocoding(false);
    }
  }

  function sendWhatsApp() {
    if (!selectedService || !selectedAgent) {
      return;
    }

    const distance = getAgentDistance(details.originLat, details.originLng, selectedAgent);
    const estimatedOrbit = getEstimatedOrbit(distance);
    const currentServiceFee = isCatalogMission ? calculateServiceFee(routeDistance, cartSubtotal) : directQuote.fee;
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

  async function handleSendMissionToAgent(overrideUserId?: string, requester?: { name: string; phone: string }) {
    if (!selectedService || !selectedAgent || isSendingRef.current) {
      return;
    }

    const userId = overrideUserId ?? authUserId;

    // Auth gate: show login/register inline before creating the mission.
    if (!userId) {
      setShowAuthGate(true);
      return;
    }

    // Lock immediately — ref is checked above and must be set before any await
    // so that a second click arriving in the same event-loop tick is blocked.
    isSendingRef.current = true;
    setIsSending(true);
    setSubmitError(null);

    const distance = getAgentDistance(details.originLat, details.originLng, selectedAgent);
    const currentServiceFee = isCatalogMission ? calculateServiceFee(routeDistance, cartSubtotal) : directQuote.fee;

    if (isCatalogMission && currentServiceFee === null) {
      isSendingRef.current = false;
      setIsSending(false);
      setLocationError(logisticsStatusMessage);
      return;
    }

    const servicePrice = isCatalogMission ? cartSubtotal + (currentServiceFee ?? 0) : directQuote.fee;
    const agentLocation = getAgentLocation(selectedAgent);
    const ticketDetail = isCatalogMission
      ? buildCartTicket(cartItems, currentServiceFee, logisticsStatusMessage)
      : details.detail;
    // Use requester override when available (from auth gate, where state may be stale).
    const requesterName = requester?.name || details.requesterName;
    const requesterPhone = requester?.phone || details.requesterPhone;

    try {
    const mission = await createMission({
      id: draftId ?? undefined,
      user_id: userId,
      service_type: selectedService.label,
      origin_text: details.origin,
      origin_lat: details.originLat,
      origin_lng: details.originLng,
      destination_text: details.destination,
      destination_lat: details.destinationLat,
      destination_lng: details.destinationLng,
      requester_name: requesterName,
      requester_phone: requesterPhone,
      customer_name: requesterName,
      customer_phone: requesterPhone,
      guest_name: requesterName,
      guest_phone: requesterPhone,
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
      costo_agente: isCatalogMission ? Math.round((currentServiceFee ?? 0) * CATALOG.comisionAgente * 100) / 100 : Math.round(directQuote.fee * 0.70),
      ganancia_orbi: isCatalogMission ? Math.round((currentServiceFee ?? 0) * (1 - CATALOG.comisionAgente) * 100) / 100 : directQuote.fee - Math.round(directQuote.fee * 0.70),
      estimated_orbit: getEstimatedOrbit(distance),
      mission_type: isCatalogMission ? "compra_negocio" : "directa",
      status: isCatalogMission ? "esperando_negocio" : "por_tomar"
    });

    draftSuppressedRef.current = true;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    clearDraft();
    setDraftId(null);
    setActiveMission(mission);
    setSentMission(mission);
    // Persist missionId so /orbita always shows THIS customer's mission.
    sessionStorage.setItem("orbi_active_mission_id", mission.id);
    // Auditoría de interpretación: completar el log si esta misión vino de texto libre.
    if (intentionLogIdRef.current) {
      const logId = intentionLogIdRef.current;
      intentionLogIdRef.current = null;
      void fetch(`/api/intention-logs/${logId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultado_final: mission.service_type,
          mission_id:      mission.id,
        }),
      }).catch(() => { /* fire-and-forget */ });
    }
    setRequestStatusMessage(
      isCatalogMission
        ? "Ya lo tenemos. En unos momentos el negocio lo confirma."
        : "Ya lo tenemos. Buscando quién te ayude."
    );
    setOrbitExperienceActive(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 1750));
    router.push("/usuarios");
    } catch (err) {
      // Re-enable the button so the user can retry after a confirmed failure.
      isSendingRef.current = false;
      setIsSending(false);
      setSubmitError(
        err instanceof Error
          ? err.message
          : "No fue posible enviar la misión. Verifica tu conexión e intenta de nuevo."
      );
    }
  }

  async function handleCreateWaitingRequest(overrideUserId?: string, requester?: { name: string; phone: string }) {
    if (!selectedService || isSendingRef.current) {
      return;
    }

    const userId = overrideUserId ?? authUserId;

    if (!userId) {
      setShowAuthGate(true);
      return;
    }

    if (activeMission?.status === "por_tomar" && !activeMission.selected_agent_id) {
      setWaitingRequestMessage("Ya lo tenemos. Seguimos buscando quién te ayude.");
      return;
    }

    isSendingRef.current = true;
    setIsSending(true);
    setSubmitError(null);

    const currentServiceFee = isCatalogMission ? calculateServiceFee(routeDistance, cartSubtotal) : directQuote.fee;

    if (isCatalogMission && currentServiceFee === null) {
      isSendingRef.current = false;
      setIsSending(false);
      setLocationError(logisticsStatusMessage);
      return;
    }

    const servicePrice = isCatalogMission ? cartSubtotal + (currentServiceFee ?? 0) : directQuote.fee;
    const ticketDetail = isCatalogMission
      ? buildCartTicket(cartItems, currentServiceFee, logisticsStatusMessage)
      : details.detail;
    const requesterName = requester?.name || details.requesterName;
    const requesterPhone = requester?.phone || details.requesterPhone;
    try {
    const mission = await createMission({
      id: draftId ?? undefined,
      user_id: userId,
      service_type: selectedService.label,
      origin_text: details.origin,
      origin_lat: details.originLat,
      origin_lng: details.originLng,
      destination_text: details.destination,
      destination_lat: details.destinationLat,
      destination_lng: details.destinationLng,
      requester_name: requesterName,
      requester_phone: requesterPhone,
      customer_name: requesterName,
      customer_phone: requesterPhone,
      guest_name: requesterName,
      guest_phone: requesterPhone,
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
      costo_agente: isCatalogMission ? Math.round((currentServiceFee ?? 0) * CATALOG.comisionAgente * 100) / 100 : Math.round(directQuote.fee * 0.70),
      ganancia_orbi: isCatalogMission ? Math.round((currentServiceFee ?? 0) * (1 - CATALOG.comisionAgente) * 100) / 100 : directQuote.fee - Math.round(directQuote.fee * 0.70),
      estimated_orbit: "Por confirmar con el agente",
      mission_type: isCatalogMission ? "compra_negocio" : "directa",
      status: isCatalogMission ? "esperando_negocio" : "por_tomar"
    });

    draftSuppressedRef.current = true;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    clearDraft();
    setDraftId(null);
    setActiveMission(mission);
    setWaitingRequestMessage(""); // message derives from mission.status in render
    setShowWaitingCancelConfirm(false);
    // Keep isSending true until the animation has completed one natural cycle:
    // text delay (0.5s) + text reaching full opacity (40% of 1.8s = 0.72s) ≈ 1200ms.
    // The backend call and this timer run concurrently via Promise.all above,
    // so no extra wait is added when the backend is slow.
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
    isSendingRef.current = false;
    setIsSending(false);
    router.push("/usuarios");
    } catch (err) {
      // On error: re-enable so the user can retry. draftId is NOT cleared here,
      // so the retry uses the same idempotency key and the server deduplicates.
      isSendingRef.current = false;
      setIsSending(false);
      setSubmitError(
        err instanceof Error
          ? err.message
          : "No fue posible enviar la misión. Verifica tu conexión e intenta de nuevo."
      );
    }
    // No finally: on success isSendingRef stays true. The button remains disabled
    // until React re-renders with activeMission set, at which point the activeMission
    // guard handles any subsequent interaction.
  }

  function handleContinueDraft() {
    // If a mission is already tracked in React state for this draft (e.g. clearDraft
    // failed due to a network drop), show tracking — never re-open the wizard.
    if (activeMission && !isMissionClosed(activeMission)) {
      clearDraft();
      setDraftId(null);
      setShowDraftChoice(false);
      return;
    }

    const draft = loadDraft();
    if (!draft) {
      setShowDraftChoice(false);
      return;
    }
    // Restore all state from the saved draft.
    if (draft.selectedService) {
      const match = services.find((s) => s.label === draft.selectedService!.label) ?? null;
      setSelectedService(match);
    }
    setSelectedStep(draft.selectedStep as WizardStep);
    setDetails((prev) => ({ ...prev, ...draft.details }));
    setPaymentStatus(draft.paymentStatus as PaymentStatus);
    setPaymentMethod(draft.paymentMethod as PaymentMethod);
    setConfirmedDraftSections(draft.confirmedDraftSections as ConfirmedDraftSections);
    if (draft.cartItems.length > 0) {
      setCartItems(draft.cartItems as typeof cartItems);
    }
    if (draft.selectedAgent) {
      pendingDraftAgentId.current = draft.selectedAgent.id;
    }
    setDraftId(draft.draftId);
    setShowDraftChoice(false);
  }

  function handleStartNewOrder() {
    clearDraft();
    setDraftId(null);
    setShowDraftChoice(false);
  }

  // Called by AuthGatePanel after successful login or registration.
  // Stores the userId and closes the gate. The user must press "Poner en órbita"
  // explicitly — we never auto-create a mission on auth success.
  function handleAuthGateSuccess(userId: string, name: string, phone: string, email: string) {
    setAuthUserId(userId);
    setShowAuthGate(false);
    saveCustomerSession(name, phone, email, userId);
    setCustomerSession({ name, phone, email });
    setDetails((prev) => ({
      ...prev,
      requesterName: name || prev.requesterName,
      requesterPhone: phone || prev.requesterPhone,
    }));
  }

  function handleModifyWaitingRequest() {
    setIsRequestReady(false);
    setSelectedAgent(null);
    setExpandedDraftSection(null);
    setConfirmedDraftSections(getInitialConfirmedDraftSections(activeMission));
    setWaitingRequestMessage("");
    setShowWaitingCancelConfirm(false);
  }

  async function handleCancelWaitingRequest() {
    const mission = activeMission;
    if (!mission?.id) return;
    setShowWaitingCancelConfirm(false);
    // Backend first — si retorna 409 el estado en Supabase no es cancelable.
    const { ok } = await cancelMissionByCustomer(mission.id);
    if (!ok) return;
    // Backend confirmó — ahora sincronizamos localStorage.
    const nextMission = updateActiveMission({ status: "cancelada" });
    setActiveMission(nextMission);
    setWaitingRequestMessage("Cancelado. No hubo ningún cargo.");
  }

  if (showDraftChoice) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-4 text-center">
        <p className="text-lg font-semibold text-orbi-text">
          Tienes un pedido pendiente.
        </p>
        <p className="max-w-sm text-sm text-orbi-muted">
          ¿Deseas continuar donde lo dejaste o empezar uno nuevo?
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            className="w-full rounded-xl bg-orbi-cyan px-6 py-3 text-sm font-semibold text-orbi-black transition hover:brightness-110"
            onClick={handleContinueDraft}
          >
            Continuar pedido
          </button>
          <button
            className="w-full rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-orbi-muted transition hover:border-white/30 hover:text-orbi-text"
            onClick={handleStartNewOrder}
          >
            Empezar uno nuevo
          </button>
        </div>
      </div>
    );
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

      {networkReconcileError ? (
        <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28)] sm:p-6">
          <p className="text-sm font-semibold text-orbi-text">No pudimos verificar tu misión.</p>
          <p className="mt-1 text-xs text-orbi-muted">Revisa tu conexión e intenta nuevamente.</p>
          <button
            type="button"
            onClick={() => {
              setNetworkReconcileError(false);
              setIsReconcilingMission(true);
              isReconcilingMissionRef.current = true;
              void supabase.auth.getUser().then(async ({ data: { user } }) => {
                const mission = user ? await fetchActiveMission(user.id) : null;
                if (mission) {
                  const orphan = loadDraft();
                  if (orphan) clearDraft();
                  setActiveMission(mission);
                } else {
                  const draft = loadDraft();
                  if (draft && isDraftMeaningful(draft)) { setDraftId(draft.draftId); setShowDraftChoice(true); }
                }
                isReconcilingMissionRef.current = false;
                setIsReconcilingMission(false);
              });
            }}
            className="mt-4 rounded-md border border-orbi-cyan/30 bg-orbi-cyan/10 px-4 py-2 text-xs font-semibold text-orbi-cyan transition hover:bg-orbi-cyan/20"
          >
            Reintentar
          </button>
        </section>
      ) : isReconcilingMission ? (
        <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28)] sm:p-6">
          <p className="text-xs text-orbi-muted">Estamos verificando tu misión…</p>
        </section>
      ) : null}

      {!networkReconcileError && !isReconcilingMission && !selectedService ? (
        <>
          <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/92 via-orbi-panel/76 to-orbi-black/88 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.3),0_0_34px_rgba(31,139,255,0.12)] sm:p-6">
            <div className="flex min-h-14 items-center gap-3 rounded-md border border-orbi-cyan/25 bg-orbi-black/45 px-4 shadow-[0_0_24px_rgba(31,139,255,0.1)]">
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
              O elige por dónde empezar
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
            <FormSection title="">
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
                  <OriginPickerField
                    value={details.origin}
                    lat={details.originLat}
                    lng={details.originLng}
                    searchCenter={resolveSearchCenter(null)}
                    isConfirmed={Boolean(details.originLat !== null && details.originLng !== null)}
                    pendingConfirm={originPendingConfirm}
                    gpsLoading={originGpsLoading}
                    gpsError={originGpsError}
                    onChange={(value) => updateLocationText("origin", value)}
                    onSelectSuggestion={(displayName, lat, lon) => {
                      updateLocationText("origin", displayName);
                      updateCoordinateDetails("origin", { latitude: lat, longitude: lon });
                    }}
                    onGpsRequest={handleOriginGps}
                    onOpenMap={() => handleOpenMap("origin")}
                    onConfirmPending={handleOriginConfirmPending}
                    onRejectPending={handleOriginRejectPending}
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
              <FormSection title={getDestinationSectionTitle(selectedService?.label)}>
                <DestinationPickerField
                  value={details.destination}
                  lat={details.destinationLat}
                  lng={details.destinationLng}
                  serviceLabel={selectedService?.label}
                  searchCenter={resolveSearchCenter(originCoordinatePair)}
                  isConfirmed={destinationIsConfirmed}
                  pendingConfirm={destPendingConfirm}
                  gpsLoading={destGpsLoading}
                  gpsError={destGpsError}
                  onChange={(value) => updateLocationText("destination", value)}
                  onSelectSuggestion={handleDestSelectSuggestion}
                  onGpsRequest={handleDestGps}
                  onOpenMap={() => handleOpenMap("destination")}
                  onConfirmPending={handleDestConfirmPending}
                  onRejectPending={handleDestRejectPending}
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
                {customerSession && authUserId ? (
                  <p className="mb-1 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-semibold text-orbi-cyan">
                    Usando tu cuenta ORBI.
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
                    goToStep("confirmacion");
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
                Continuar
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

      {!isReconcilingMission && !networkReconcileError && selectedService && isAgentStage && !isOrbitExperienceActive ? (
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
                    onSelect={() => { setSelectedAgent(agent); goToStep("confirmacion"); }}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              {activeMission?.status === "cumplida" || activeMission?.status === "archivada" ? (
                <StateCard
                  title="Misión cumplida"
                  body="Tu pedido fue entregado. Puedes iniciar uno nuevo cuando quieras."
                  actionLabel="Nuevo pedido"
                  onAction={handleModifyWaitingRequest}
                />
              ) : activeMission?.status === "cancelada" ? (
                <StateCard
                  title="Pedido cancelado"
                  body="Cancelado. No había ningún cargo pendiente."
                  actionLabel="Nuevo pedido"
                  onAction={handleModifyWaitingRequest}
                />
              ) : (
                <>
                  <WaitingRequestCard
                    message={waitingRequestMessage || missionWaitingMessage(activeMission)}
                    canCancel={isCancellableByCustomer(activeMission)}
                    showCancelConfirm={showWaitingCancelConfirm}
                    onWait={handleCreateWaitingRequest}
                    onModify={handleModifyWaitingRequest}
                    onCancel={() => setShowWaitingCancelConfirm(true)}
                    onConfirmCancel={handleCancelWaitingRequest}
                    onKeepWaiting={() => setShowWaitingCancelConfirm(false)}
                  />
                  {showAuthGate ? (
                    <div className="mt-3">
                      <AuthGatePanel
                        prefillName={details.requesterName}
                        prefillPhone={details.requesterPhone}
                        onAuthSuccess={handleAuthGateSuccess}
                        onDismiss={() => setShowAuthGate(false)}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </>
          )}
        </section>
      ) : null}

      {!isReconcilingMission && !networkReconcileError && !isOrbitExperienceActive && activeMission?.status === "por_tomar" && activeMission.selected_agent_id ? (
        <PendingMissionCard mission={activeMission} />
      ) : null}

      {isOrbitExperienceActive && sentMission ? (
        <OrbitExperienceStage
          missionId={sentMission.id}
          serviceType={sentMission.service_type}
        />
      ) : null}

      {!isReconcilingMission && !networkReconcileError && selectedService && isConfirmStage && !isOrbitExperienceActive && ((!activeMission || isMissionClosed(activeMission)) || isSending) ? (
        <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
            Tu pedido
          </p>
          <h2 className="mt-2 text-2xl font-black text-orbi-text">¿Lo pedimos así?</h2>

          {/* ORBI-P-13: Bloque de asignación de agente */}
          {selectedAgent ? (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-orbi-cyan">Agente seleccionado</p>
              <p className="mt-1 text-2xl font-black text-orbi-text">{selectedAgent.name}</p>
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04]">
                  <Radar aria-hidden="true" className="h-5 w-5 text-orbi-muted" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-orbi-text">ORBI asignará el mejor agente disponible para tu misión</p>
                  <p className="mt-1 text-xs leading-5 text-orbi-muted">
                    Seleccionamos según ubicación, disponibilidad y tiempo de respuesta.
                  </p>
                  <button
                    type="button"
                    onClick={() => goToStep("agente")}
                    className="mt-2 text-xs text-orbi-muted underline underline-offset-2 transition hover:text-orbi-text"
                  >
                    Prefiero elegir yo →
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3 text-sm text-orbi-muted sm:grid-cols-2">
            <SummaryItem label="Servicio" value={selectedService.label} />
            {isCatalogMission && cartBusiness ? <SummaryItem label="Negocio" value={cartBusiness.businessName} /> : null}
            {isCatalogMission && cartItems.length ? <SummaryItem label="Productos" value={`${cartItems.length} producto(s)`} /> : null}
            {selectedAgent ? (
              <SummaryItem
                label="Tiempo estimado"
                value={getEstimatedOrbit(getAgentDistance(details.originLat, details.originLng, selectedAgent))}
              />
            ) : null}
            <SummaryItem label="Método de pago" value={paymentMethod} />
            <SummaryItem label="Estado de pago" value={paymentStatus} />
          </div>
          <div className="mt-3">
            {isCatalogMission
              ? <CostBreakdown subtotal={cartSubtotal} serviceFee={serviceFee ?? 0} total={cartSubtotal + (serviceFee ?? 0)} />
              : directQuote.loading
                ? <p className="text-sm text-orbi-muted">Calculando precio…</p>
                : directQuote.error
                  ? <p className="text-sm text-red-400">No se pudo calcular el precio. Intenta de nuevo.</p>
                  : <CostBreakdown subtotal={null} serviceFee={directQuote.fee} total={directQuote.fee} />
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
                {selectedAgent ? (
                  <SummaryItem label="Tiempo estimado" value={getEstimatedOrbit(getAgentDistance(details.originLat, details.originLng, selectedAgent))} />
                ) : null}
                <SummaryItem label="Estado de pago" value={paymentStatus} />
                <SummaryItem label="Método de pago" value={paymentMethod} />
              </div>
            </div>
          ) : null}

          {showAuthGate ? (
            <div className="mt-5">
              <AuthGatePanel
                prefillName={details.requesterName}
                prefillPhone={details.requesterPhone}
                onAuthSuccess={handleAuthGateSuccess}
                onDismiss={() => setShowAuthGate(false)}
              />
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {isSending ? (
              <div className="sm:col-span-2 rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.06] p-8 text-center">
                <div
                  className="mx-auto mb-5 h-16 w-16 rounded-md overflow-hidden border border-white/10 bg-orbi-black/40"
                  style={{ animation: "orbiArrive 1.8s ease-out forwards" }}
                >
                  <img src="/orbi-logo.png" alt="ORBI" className="h-full w-full object-contain" />
                </div>
                <p className="text-xl font-black text-orbi-text" style={{ animation: "orbiArrive 1.8s ease-out 0.5s both" }}>Estamos poniendo tu misión en órbita…</p>
                <style>{`
                  @keyframes orbiArrive {
                    0%   { opacity: 0; transform: scale(0.96); }
                    40%  { opacity: 1; transform: scale(1.03); }
                    70%  { transform: scale(1.0); }
                    100% { opacity: 1; transform: scale(1.0); }
                  }
                `}</style>
              </div>
            ) : null}
            {submitError ? (
              <p className="sm:col-span-2 rounded-md border border-yellow-300/15 bg-yellow-300/[0.06] px-4 py-3 text-sm font-semibold text-yellow-100">
                {submitError}
              </p>
            ) : null}
            {!isSending && selectedAgent ? (
              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-orbi-text transition hover:bg-white/10"
              >
                Cambiar agente
              </button>
            ) : null}
            {!isSending ? (
              <button
                type="button"
                onClick={() => selectedAgent ? void handleSendMissionToAgent() : void handleCreateWaitingRequest()}
                className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] ${!selectedAgent ? "sm:col-span-2" : ""}`}
              >
                <Send aria-hidden="true" className="h-5 w-5" />
                Poner en órbita
              </button>
            ) : null}
            {selectedAgent ? (
              <button
                type="button"
                onClick={sendWhatsApp}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-5 py-3 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15 sm:col-span-2"
              >
                Enviar respaldo por WhatsApp
              </button>
            ) : null}
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
  const isOrbitStepReady = hasOrder && hasDestination && hasRequester;
  const steps = [
    { id: "servicio" as const, label: "Solicitud", done: Boolean(selectedService) },
    { id: "destino" as const, label: "Destino", done: hasDestination },
    { id: "solicitante" as const, label: "Solicitante", done: hasRequester },
    { id: "confirmacion" as const, label: "Confirmar", done: isOrbitStepReady }
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
      {title ? <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">{title}</h3> : null}
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
      eyebrow=""
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
          {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">{eyebrow}</p> : null}
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
  onSelectCustomMission: (
    label: ServiceOption["label"],
    intentionContext: { intencionOrbi: string; propuestaMostrada: string; resultadosCatalogo: number },
  ) => void;
}) {
  const intention = detectIntention(query);
  const isNonCatalogService =
    intention.serviceLabel === "Traslado" ||
    intention.serviceLabel === "Recolección" ||
    intention.serviceLabel === "Pago o trámite";

  const intentionContext = {
    intencionOrbi:      intention.serviceLabel,
    propuestaMostrada:  intention.proposal,
    resultadosCatalogo: results.length,
  };

  if (!results.length || isNonCatalogService) {
    return (
      <div className="mt-4 rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.06] p-5">
        <p className="text-base font-black text-orbi-text">{intention.proposal}</p>
        <p className="mt-1 text-sm text-orbi-muted">¿Lo pedimos así?</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSelectCustomMission(intention.serviceLabel, intentionContext)}
            className="inline-flex min-h-10 items-center rounded-md bg-orbi-blue px-5 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
          >
            Sí, pedir
          </button>
          <button
            type="button"
            onClick={() => onSelectCustomMission("Mandado", intentionContext)}
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

// PR-05.4 — Última posición GPS conocida del cliente (P2 del contexto operativo, §9.5).
// Módulo singleton: sobrevive re-renders y navegación de página. Se actualiza cada vez que
// el cliente obtiene GPS (origen o destino). Acceso sincrónico para resolveSearchCenter.
let _lastKnownCustomerPos: { lat: number; lng: number } | null = null;

// [DIAG-GPS] Contador incremental de solicitudes GPS. Solo para diagnóstico temporal.
let _gpsReqCounter = 0;

// PR-05 — LocationPicker para origen y destino con autocomplete, GPS y mapa.
// Implementa ORBI-UX-01: sugerencia seleccionada → confirmado directo; GPS/mapa → muestra "¿Es aquí?".
// Título del FormSection y placeholder del input según el tipo de misión (ORBI-UX-01 — lenguaje
// situacional, no genérico). Solo texto; sin lógica de negocio.

// Contexto operativo de la misión (§9.5 de ORBI_MASTER.md).
// P1: origen confirmado → P2: último GPS del cliente → P3: centro de Red ORBI → P4: null.
function resolveSearchCenter(
  originCoordinatePair: { lat: number; lng: number } | null
): { lat: number; lng: number } | null {
  if (originCoordinatePair) return originCoordinatePair;
  if (_lastKnownCustomerPos) return _lastKnownCustomerPos;
  const netLat = parseFloat(process.env.NEXT_PUBLIC_NETWORK_LAT ?? "");
  const netLng = parseFloat(process.env.NEXT_PUBLIC_NETWORK_LNG ?? "");
  if (Number.isFinite(netLat) && Number.isFinite(netLng)) return { lat: netLat, lng: netLng };
  return null;
}
function getDestinationSectionTitle(serviceLabel?: string): string {
  switch (serviceLabel) {
    case "Compra local": return "Destino de entrega";
    case "Traslado":     return "Destino";
    case "Pago o trámite": return "Lugar del trámite";
    default:             return "Destino";
  }
}

function getDestinationPlaceholder(serviceLabel?: string): string {
  switch (serviceLabel) {
    case "Compra local":   return "¿Dónde entregamos tu pedido?";
    case "Traslado":       return "¿A dónde vas?";
    case "Entrega":        return "¿A dónde enviamos?";
    case "Mandado":        return "¿A dónde va el mandado?";
    case "Recolección":    return "¿A dónde entregamos?";
    case "Pago o trámite": return "¿Dónde es el trámite?";
    default:               return "¿A dónde va?";
  }
}

// PR-05.4 — LocationPicker para origen con autocomplete, GPS y mapa.
// Mismo patrón ORBI-UX-01 que DestinationPickerField. Origen no tiene variación de placeholder por tipo de misión.
function OriginPickerField({
  value,
  searchCenter,
  isConfirmed,
  pendingConfirm,
  gpsLoading,
  gpsError,
  onChange,
  onSelectSuggestion,
  onGpsRequest,
  onOpenMap,
  onConfirmPending,
  onRejectPending,
}: {
  value: string;
  lat: number | null;
  lng: number | null;
  searchCenter?: { lat: number; lng: number } | null;
  isConfirmed: boolean;
  pendingConfirm: DestPendingConfirm | null;
  gpsLoading: boolean;
  gpsError: string;
  onChange: (value: string) => void;
  onSelectSuggestion: (displayName: string, lat: number, lon: number) => void;
  onGpsRequest: () => void;
  onOpenMap: () => void;
  onConfirmPending: () => void;
  onRejectPending: () => void;
}) {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(newValue: string) {
    onChange(newValue);
    setNoResults(false);
    setSearchUnavailable(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const trimmed = newValue.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      setSearching(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        const searchUrl = new URL("/api/geocoding/search", window.location.origin);
        searchUrl.searchParams.set("q", trimmed);
        searchUrl.searchParams.set("limit", "5");
        if (searchCenter) {
          searchUrl.searchParams.set("lat", String(searchCenter.lat));
          searchUrl.searchParams.set("lon", String(searchCenter.lng));
        }
        const res = await fetch(searchUrl.toString(), { signal: controller.signal });
        if (!res.ok) { setSearchUnavailable(true); return; }
        const data = (await res.json()) as { results: SearchSuggestion[]; status?: string };
        if (data.status === "unavailable") { setSearchUnavailable(true); setSuggestions([]); setShowDropdown(false); }
        else if (!data.results?.length) { setNoResults(true); setSuggestions([]); setShowDropdown(false); }
        else { setSuggestions(data.results); setShowDropdown(true); setNoResults(false); }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setSearchUnavailable(true);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function handleSelectSuggestion(s: SearchSuggestion) {
    onSelectSuggestion(s.displayName, s.lat, s.lon);
    setSuggestions([]);
    setShowDropdown(false);
    setNoResults(false);
    setSearchUnavailable(false);
  }

  const inputBorderClass = isConfirmed && !pendingConfirm
    ? "border-emerald-400/30 bg-emerald-400/[0.04]"
    : pendingConfirm
    ? "border-yellow-300/30 bg-yellow-300/[0.04]"
    : "border-white/10 bg-white/[0.04]";

  const displayValue = pendingConfirm ? pendingConfirm.text : value;
  const isTextDisabled = gpsLoading || Boolean(pendingConfirm);
  const isMapDisabled = Boolean(pendingConfirm);

  return (
    <div className="space-y-2">
      {!isConfirmed && !pendingConfirm && !gpsLoading && (
        <p className="px-0.5 text-xs text-orbi-muted">
          Usamos tu ubicación para calcular la ruta y el costo del servicio.
        </p>
      )}
      <div className={`flex items-center gap-2 rounded-md border px-3 py-2 transition ${inputBorderClass}`}>
        <input
          type="text"
          value={displayValue}
          disabled={isTextDisabled}
          placeholder="Dirección o referencia de salida"
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          className="min-w-0 flex-1 bg-transparent text-sm text-orbi-text outline-none placeholder:text-orbi-muted/55 disabled:opacity-60"
          aria-label="Punto de origen"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
        />
        <button
          type="button"
          onClick={onGpsRequest}
          disabled={isTextDisabled}
          aria-label="Usar mi ubicación como origen"
          className="flex-shrink-0 rounded p-1 text-orbi-muted transition hover:text-orbi-cyan disabled:opacity-40"
        >
          {gpsLoading
            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={onOpenMap}
          disabled={isMapDisabled}
          aria-label="Elegir origen en mapa"
          className="flex-shrink-0 rounded p-1 text-orbi-muted transition hover:text-orbi-cyan disabled:opacity-40"
        >
          <MapPin className="h-3.5 w-3.5" />
        </button>
      </div>

      {gpsLoading && (
        <div className="flex items-center gap-2 px-1">
          <RefreshCw className="h-3 w-3 animate-spin text-orbi-muted" aria-hidden="true" />
          <span className="text-xs text-orbi-muted">Obteniendo tu ubicación…</span>
        </div>
      )}

      {searching && !gpsLoading && (
        <div className="flex items-center gap-2 px-1">
          <RefreshCw className="h-3 w-3 animate-spin text-orbi-muted" aria-hidden="true" />
          <span className="text-xs text-orbi-muted">Buscando...</span>
        </div>
      )}

      {showDropdown && suggestions.length > 0 && (
        <div className="overflow-hidden rounded-md border border-white/10 bg-orbi-panel shadow-lg">
          {suggestions.map((s, i) => {
            const parts = s.displayName.split(/, (.+)/);
            const primary = parts[0] ?? s.displayName;
            const secondary = parts[1] ?? "";
            return (
              <button
                key={s.providerId || i}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectSuggestion(s)}
                className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.06] ${
                  i < suggestions.length - 1 ? "border-b border-white/[0.06]" : ""
                }`}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-orbi-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-orbi-text">{primary}</p>
                  {secondary && <p className="truncate text-xs text-orbi-muted">{secondary}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {noResults && !searching && (
        <div className="rounded-md border border-yellow-300/15 bg-yellow-300/[0.06] px-3 py-2.5">
          <p className="text-xs font-semibold text-yellow-100">No encontramos ese lugar.</p>
          <p className="mt-0.5 text-xs text-yellow-100/70">Prueba otra forma de escribirlo, o usa GPS o el mapa.</p>
        </div>
      )}

      {searchUnavailable && !searching && (
        <div className="rounded-md border border-yellow-300/15 bg-yellow-300/[0.06] px-3 py-2.5">
          <p className="text-xs font-semibold text-yellow-100">La búsqueda no está disponible ahora.</p>
          <p className="mt-0.5 text-xs text-yellow-100/70">Usa el GPS o el mapa para continuar.</p>
        </div>
      )}

      {gpsError && !gpsLoading && (
        <div className="rounded-md border border-yellow-300/15 bg-yellow-300/[0.06] px-3 py-2.5">
          <p className="text-xs font-semibold text-yellow-100">{gpsError}</p>
        </div>
      )}

      {pendingConfirm && (
        <div className="rounded-md border border-yellow-300/20 bg-yellow-300/[0.08] px-3 py-3">
          <p className="mb-2.5 text-xs font-semibold text-yellow-100">¿Es aquí?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onConfirmPending}
              className="flex-1 rounded-md border border-orbi-cyan/30 bg-orbi-blue/[0.15] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/25"
            >
              Sí, es aquí
            </button>
            <button
              type="button"
              onClick={onRejectPending}
              className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-orbi-text transition hover:bg-white/[0.08]"
            >
              Editar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DestinationPickerField({
  value,
  serviceLabel,
  searchCenter,
  isConfirmed,
  pendingConfirm,
  gpsLoading,
  gpsError,
  onChange,
  onSelectSuggestion,
  onGpsRequest,
  onOpenMap,
  onConfirmPending,
  onRejectPending,
}: {
  value: string;
  lat: number | null;
  lng: number | null;
  serviceLabel?: string;
  searchCenter?: { lat: number; lng: number } | null;
  isConfirmed: boolean;
  pendingConfirm: DestPendingConfirm | null;
  gpsLoading: boolean;
  gpsError: string;
  onChange: (value: string) => void;
  onSelectSuggestion: (displayName: string, lat: number, lon: number) => void;
  onGpsRequest: () => void;
  onOpenMap: () => void;
  onConfirmPending: () => void;
  onRejectPending: () => void;
}) {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Cerrar dropdown al hacer clic fuera del componente.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(newValue: string) {
    onChange(newValue);
    setNoResults(false);
    setSearchUnavailable(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!newValue.trim() || newValue.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      const searchUrl = new URL("/api/geocoding/search", window.location.origin);
      searchUrl.searchParams.set("q", newValue.trim());
      searchUrl.searchParams.set("limit", "5");
      if (searchCenter) {
        searchUrl.searchParams.set("lat", String(searchCenter.lat));
        searchUrl.searchParams.set("lon", String(searchCenter.lng));
      }
      fetch(searchUrl.toString(), {
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data: { results: SearchSuggestion[]; status?: string }) => {
          if (data.status === "unavailable") {
            setSuggestions([]);
            setSearchUnavailable(true);
            setShowDropdown(false);
          } else if (!data.results?.length) {
            setSuggestions([]);
            setNoResults(true);
            setShowDropdown(false);
          } else {
            setSuggestions(data.results);
            setNoResults(false);
            setShowDropdown(true);
          }
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name !== "AbortError") {
            setSuggestions([]);
            setSearchUnavailable(true);
            setShowDropdown(false);
          }
        })
        .finally(() => setSearching(false));
    }, 300);
  }

  function handleSelectSuggestion(s: SearchSuggestion) {
    setShowDropdown(false);
    setSuggestions([]);
    setSearching(false);
    setNoResults(false);
    setSearchUnavailable(false);
    onSelectSuggestion(s.displayName, s.lat, s.lon);
  }

  const inputBorder = isConfirmed
    ? "border-emerald-400/40"
    : pendingConfirm
      ? "border-yellow-300/40"
      : "border-white/10 focus-within:border-orbi-cyan/60 focus-within:ring-2 focus-within:ring-orbi-cyan/15";

  const displayValue = pendingConfirm ? pendingConfirm.text : value;
  const isTextDisabled = gpsLoading || Boolean(pendingConfirm);
  const isMapDisabled = Boolean(pendingConfirm);

  return (
    <div className="space-y-2" ref={containerRef}>
      {!isConfirmed && !pendingConfirm && !gpsLoading && (
        <p className="px-0.5 text-xs text-orbi-muted">
          Usamos tu ubicación para calcular la ruta y el costo del servicio.
        </p>
      )}
      {/* Fila del input */}
      <div className={`flex items-center gap-2 rounded-md border bg-white/[0.04] px-3 py-2.5 transition ${inputBorder}`}>
        {isConfirmed ? (
          <span className="flex-shrink-0 text-sm text-emerald-400" aria-hidden="true">✓</span>
        ) : (
          <MapPin className="h-4 w-4 flex-shrink-0 text-orbi-muted" aria-hidden="true" />
        )}
        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-orbi-text outline-none placeholder:text-orbi-muted/55"
          value={displayValue}
          placeholder={getDestinationPlaceholder(serviceLabel)}
          disabled={isTextDisabled}
          onChange={(e) => handleChange(e.target.value)}
          autoComplete="off"
        />
        {/* Botón GPS */}
        <button
          type="button"
          onClick={onGpsRequest}
          disabled={isTextDisabled}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-white/10 bg-white/[0.04] text-orbi-muted transition hover:border-orbi-cyan/30 hover:text-orbi-cyan disabled:opacity-40"
          aria-label="Usar mi ubicación como destino"
        >
          {gpsLoading
            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            : <LocateFixed className="h-3.5 w-3.5" />
          }
        </button>
        {/* Botón Mapa */}
        <button
          type="button"
          onClick={onOpenMap}
          disabled={isMapDisabled}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-white/10 bg-white/[0.04] text-orbi-muted transition hover:border-orbi-cyan/30 hover:text-orbi-cyan disabled:opacity-40"
          aria-label="Elegir destino en mapa"
        >
          <MapPin className="h-3.5 w-3.5" />
        </button>
      </div>

      {gpsLoading && (
        <div className="flex items-center gap-2 px-1">
          <RefreshCw className="h-3 w-3 animate-spin text-orbi-muted" aria-hidden="true" />
          <span className="text-xs text-orbi-muted">Obteniendo tu ubicación…</span>
        </div>
      )}

      {/* Indicador de búsqueda */}
      {searching && !gpsLoading && (
        <div className="flex items-center gap-2 px-1">
          <RefreshCw className="h-3 w-3 animate-spin text-orbi-muted" aria-hidden="true" />
          <span className="text-xs text-orbi-muted">Buscando...</span>
        </div>
      )}

      {/* Dropdown de sugerencias */}
      {showDropdown && suggestions.length > 0 && (
        <div className="overflow-hidden rounded-md border border-white/10 bg-orbi-panel shadow-lg">
          {suggestions.map((s, i) => {
            const parts = s.displayName.split(/, (.+)/);
            const primary = parts[0] ?? s.displayName;
            const secondary = parts[1] ?? "";
            return (
              <button
                key={s.providerId || i}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectSuggestion(s)}
                className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.06] ${
                  i < suggestions.length - 1 ? "border-b border-white/[0.06]" : ""
                }`}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-orbi-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-orbi-text">{primary}</p>
                  {secondary && (
                    <p className="truncate text-xs text-orbi-muted">{secondary}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Sin resultados */}
      {noResults && !searching && (
        <div className="rounded-md border border-yellow-300/15 bg-yellow-300/[0.06] px-3 py-2.5">
          <p className="text-xs font-semibold text-yellow-100">No encontramos ese lugar.</p>
          <p className="mt-0.5 text-xs text-yellow-100/70">Prueba otra forma de escribirlo, o usa GPS o el mapa.</p>
        </div>
      )}

      {/* Búsqueda no disponible */}
      {searchUnavailable && !searching && (
        <div className="rounded-md border border-yellow-300/15 bg-yellow-300/[0.06] px-3 py-2.5">
          <p className="text-xs font-semibold text-yellow-100">La búsqueda no está disponible ahora.</p>
          <p className="mt-0.5 text-xs text-yellow-100/70">Usa el GPS o el mapa para continuar.</p>
        </div>
      )}

      {/* Error de GPS */}
      {gpsError && !gpsLoading && (
        <div className="rounded-md border border-yellow-300/15 bg-yellow-300/[0.06] px-3 py-2.5">
          <p className="text-xs font-semibold text-yellow-100">{gpsError}</p>
        </div>
      )}

      {/* Banner "¿Es aquí?" — ORBI eligió (GPS o mapa), el usuario confirma (ORBI-UX-01) */}
      {pendingConfirm && (
        <div className="rounded-md border border-yellow-300/20 bg-yellow-300/[0.08] px-3 py-3">
          <p className="mb-2.5 text-xs font-semibold text-yellow-100">¿Es aquí?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onConfirmPending}
              className="flex-1 rounded-md border border-orbi-cyan/30 bg-orbi-blue/[0.15] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/25"
            >
              Sí, es aquí
            </button>
            <button
              type="button"
              onClick={onRejectPending}
              className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-orbi-text transition hover:bg-white/[0.08]"
            >
              Editar
            </button>
          </div>
        </div>
      )}
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
  canCancel,
  showCancelConfirm,
  onWait,
  onModify,
  onCancel,
  onConfirmCancel,
  onKeepWaiting
}: {
  message: string;
  canCancel: boolean;
  showCancelConfirm: boolean;
  onWait: () => void;
  onModify: () => void;
  onCancel: () => void;
  onConfirmCancel: () => void;
  onKeepWaiting: () => void;
}) {
  return (
    <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-6 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-8" style={{ animation: "orbiCardEnter 0.32s ease-out both" }}>
      <style>{`
        @keyframes orbiCardEnter {
          0%   { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan shadow-[0_0_24px_rgba(31,139,255,0.14)]">
        <Radar aria-hidden="true" className="h-7 w-7" />
      </div>
      {message ? (
        <p className="text-center text-xl font-black text-orbi-text">
          {message}
        </p>
      ) : null}
      {canCancel ? (
        showCancelConfirm ? (
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
        )
      ) : (
        <p className="mt-5 text-center text-xs text-orbi-muted">
          Ya no puedes cancelar desde ORBI.
        </p>
      )}
    </section>
  );
}

function PendingMissionCard({
  mission,
}: {
  mission: ActiveMission;
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

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/orbita/${mission.id}`}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
        >
          Ver detalle
        </Link>
      </div>
      <p className="mt-4 text-center text-xs text-orbi-muted">
        Ya no puedes cancelar desde ORBI.
      </p>
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
}: {
  missionId: string;
  serviceType: string;
}) {
  const folio = missionId.replace(/-/g, "").slice(-6).toUpperCase();
  const { searching, horizon } = commitmentTextForService(serviceType);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.07] p-5">
        <p className="text-xl font-black text-orbi-text">
          Ya lo tenemos.
        </p>
        <p className="mt-4 text-sm text-orbi-muted">{searching}</p>
        <p className="text-sm text-orbi-muted">{horizon}</p>
        <p className="mt-4 text-xs text-orbi-muted/40 font-mono tracking-wider">
          #{folio}
        </p>
      </div>
      <Suspense>
        <MissionOrbitTracker initialMissionId={missionId} />
      </Suspense>
    </div>
  );
}

// ── Auth gate — shown before mission creation when user is not authenticated ───

function AuthGatePanel({
  prefillName,
  prefillPhone,
  onAuthSuccess,
  onDismiss,
}: {
  prefillName: string;
  prefillPhone: string;
  onAuthSuccess: (userId: string, name: string, phone: string, email: string) => void;
  onDismiss: () => void;
}) {
  const [mode, setMode] = useState<"register" | "login" | "recovery">("register");
  const [fullName, setFullName] = useState(prefillName ?? "");
  const [phone, setPhone] = useState(prefillPhone ?? "");
  const [email, setEmail] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        name: fullName.trim(), phone: phone.trim(), email: email.trim(), password,
      });
      // result.authUserId comes directly from signUp()'s data.user.id — available
      // regardless of whether Supabase "Confirm email" is enabled or disabled.
      onAuthSuccess(result.authUserId, result.name, result.phone, result.email);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No se pudo resolver el usuario tras el inicio de sesión.");
      onAuthSuccess(user.id, session.name, session.phone ?? "", session.email ?? loginEmail.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Datos incorrectos.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (mode === "recovery") {
    return (
      <div className="rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.07] p-4">
        <p className="text-sm font-bold text-orbi-text">Recuperar contraseña</p>
        <p className="mt-1 text-xs text-orbi-muted">
          Te enviaremos un enlace para restablecer tu contraseña.
        </p>
        {recoverySent ? (
          <p className="mt-3 rounded-md border border-orbi-cyan/20 bg-orbi-cyan/10 px-3 py-2 text-xs font-semibold text-orbi-cyan">
            Revisa tu correo. Si la cuenta existe, recibirás el enlace en unos segundos.
          </p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!recoveryEmail.trim()) { setError("Ingresa tu correo."); return; }
              setError(""); setIsSubmitting(true);
              try {
                await supabase.auth.resetPasswordForEmail(recoveryEmail.trim(), {
                  redirectTo: `${window.location.origin}/pedir`,
                });
                setRecoverySent(true);
              } catch {
                setError("No fue posible enviar el correo. Intenta de nuevo.");
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="mt-3 space-y-3"
            noValidate
          >
            <div>
              <label className="block text-xs font-semibold text-orbi-muted">Correo electrónico</label>
              <input
                type="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
                placeholder="correo@ejemplo.com"
                autoComplete="email"
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
              {isSubmitting ? "Enviando…" : "Enviar enlace de recuperación"}
            </button>
          </form>
        )}
        <p className="mt-3 text-xs text-orbi-muted">
          <button
            type="button"
            onClick={() => { setMode("login"); setError(""); setRecoverySent(false); }}
            className="font-semibold text-orbi-cyan underline underline-offset-2 transition hover:text-white"
          >
            Volver al inicio de sesión
          </button>
        </p>
      </div>
    );
  }

  if (mode === "login") {
    return (
      <div className="rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.07] p-4">
        <p className="text-sm font-bold text-orbi-text">Inicia sesión para confirmar tu pedido</p>
        <p className="mt-1 text-xs text-orbi-muted">
          Tu misión se creará con tu cuenta después de iniciar sesión.
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
            {isSubmitting ? "Verificando…" : "Iniciar sesión"}
          </button>
        </form>
        <p className="mt-3 text-xs text-orbi-muted">
          <button
            type="button"
            onClick={() => { setMode("recovery"); setError(""); setRecoveryEmail(loginEmail); }}
            className="font-semibold text-orbi-cyan underline underline-offset-2 transition hover:text-white"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </p>
        <p className="mt-2 text-xs text-orbi-muted">
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
      <p className="text-sm font-bold text-orbi-text">Crea tu cuenta para confirmar el pedido</p>
      <p className="mt-1 text-xs text-orbi-muted">
        Tu misión quedará vinculada a tu cuenta desde el inicio.
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
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="Tu número de WhatsApp"
            autoComplete="tel"
          />
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
          {isSubmitting ? "Creando cuenta…" : "Crear cuenta"}
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
        {" · "}
        <button type="button" onClick={onDismiss} className="text-orbi-muted/60 underline underline-offset-2 transition hover:text-orbi-muted">
          Cancelar
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

// Proxy a /api/geocoding/reverse — nunca llama a Nominatim directamente (INV-017).
// Devuelve el nombre canónico del lugar o null si Nominatim no tiene datos para ese punto.
// Los textos de fallback ("Ubicación actual", "Punto marcado en mapa") son
// responsabilidad exclusiva de los sitios de llamada, no de esta función.
async function reverseGeocodePoint(point: MapPoint): Promise<string | null> {
  const res = await fetch(
    `/api/geocoding/reverse?lat=${encodeURIComponent(point.lat)}&lon=${encodeURIComponent(point.lng)}`
  );
  if (!res.ok) throw new Error("No fue posible consultar la dirección del punto marcado.");
  const data = (await res.json()) as { displayName?: string | null; status?: string };
  if (data.status === "unavailable") return null;
  return data.displayName ?? null;
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
