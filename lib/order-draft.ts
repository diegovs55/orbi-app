// One active draft per browser. draftId doubles as the idempotency key sent to
// the mission-create backend, so the same order cannot produce two missions even
// after a reload, retry, or two-tab scenario.

const DRAFT_KEY = "orbi_order_draft";
const SCHEMA_VERSION = 2;
const EXPIRY_HOURS = 72;

// ── Types ────────────────────────────────────────────────────────────────────

export type DraftServiceOption = {
  label: string;
  compatibleType: string;
};

// V1: campos de localización sin enriquecimiento geográfico.
// Conservado solo para la migración v1 → v2.
type DraftRequestDetailsV1 = {
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

// V2: extiende V1 con los diez campos geográficos del contrato (ORBI_GEO_CONTRACT.md).
// Los campos son opcionales (?) porque se rellenan progresivamente a medida que el
// usuario geocodifica cada punto — no existen en un draft recién creado.
// El valor null significa "coordenadas presentes pero sin nombre/confirmación todavía".
// La ausencia del campo (undefined) significa "geocodificación aún no iniciada".
export type DraftRequestDetails = DraftRequestDetailsV1 & {
  // Origen
  originPlaceName?: string | null;       // nombre canónico del geocodificador para las coords de origen
  originProviderId?: string | null;      // "photon:{osmType}:{osmId}" — entidad OSM seleccionada
  originProvider?: string | null;        // "photon" | null
  originConfirmed?: boolean | null;      // true cuando el usuario confirmó explícitamente las coords
  originReference?: string | null;       // anotación operativa del agente (capa de presentación)
  // Destino
  destinationPlaceName?: string | null;
  destinationProviderId?: string | null;
  destinationProvider?: string | null;
  destinationConfirmed?: boolean | null;
  destinationReference?: string | null;
};

export type DraftCartItem = {
  product: Record<string, unknown>;
  quantity: number;
};

export type DraftAgent = {
  id: string;
  name: string;
  zone?: string;
  vehicle?: string;
  trustLevel?: string;
  lat?: number | null;
  lng?: number | null;
  status?: string;
  serviceType?: string;
  isOnOrbit?: boolean;
};

// Tipo del draft en disco para v1 — solo para lectura durante migración.
type OrderDraftV1 = {
  draftId: string;
  idempotencyKey: string;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  selectedService: DraftServiceOption | null;
  selectedStep: string;
  details: DraftRequestDetailsV1;
  cartItems: DraftCartItem[];
  selectedAgent: DraftAgent | null;
  paymentStatus: string;
  paymentMethod: string;
  confirmedDraftSections: Record<string, boolean>;
};

export type OrderDraft = {
  draftId: string;
  idempotencyKey: string; // always === draftId
  schemaVersion: 2;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  selectedService: DraftServiceOption | null;
  selectedStep: string;
  details: DraftRequestDetails;
  cartItems: DraftCartItem[];
  selectedAgent: DraftAgent | null;
  paymentStatus: string;
  paymentMethod: string;
  confirmedDraftSections: Record<string, boolean>;
};

type DraftPayload = Omit<
  OrderDraft,
  "draftId" | "idempotencyKey" | "schemaVersion" | "createdAt" | "updatedAt" | "expiresAt"
>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

// ── Migración v1 → v2 ─────────────────────────────────────────────────────────

// Eleva un draft v1 al esquema v2 añadiendo los diez campos geográficos a null.
// No descarta datos del usuario — todos los campos v1 se conservan intactos.
// Compatibilidad dual: una vez que existan drafts v2 en producción, esta función
// debe mantenerse hasta que no queden drafts v1 activos (TTL máximo: 72 h).
export function migrateDraftV1ToV2(v1: OrderDraftV1): OrderDraft {
  return {
    ...v1,
    schemaVersion: 2,
    details: {
      ...v1.details,
      originPlaceName: null,
      originProviderId: null,
      originProvider: null,
      originConfirmed: null,
      originReference: null,
      destinationPlaceName: null,
      destinationProviderId: null,
      destinationProvider: null,
      destinationConfirmed: null,
      destinationReference: null,
    },
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export function loadDraft(): OrderDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { schemaVersion?: number } & Record<string, unknown>;

    // Draft v1 en disco: migrar en lugar de descartar (INV-015).
    if (parsed.schemaVersion === 1) {
      const v1 = parsed as unknown as OrderDraftV1;
      if (!v1.draftId || !v1.idempotencyKey) {
        window.localStorage.removeItem(DRAFT_KEY);
        return null;
      }
      if (new Date(v1.expiresAt) < new Date()) {
        window.localStorage.removeItem(DRAFT_KEY);
        return null;
      }
      const migrated = migrateDraftV1ToV2(v1);
      // Persistir la versión migrada para que la próxima lectura sea directa.
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(migrated));
      return migrated;
    }

    // Versión desconocida (ni 1 ni 2) — descartar.
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }

    const draft = parsed as unknown as OrderDraft;
    if (!draft.draftId || !draft.idempotencyKey) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    // Expired draft.
    if (new Date(draft.expiresAt) < new Date()) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return draft;
  } catch {
    // Corrupt JSON — clean up.
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    return null;
  }
}

/** Create or update the single active draft. Returns the saved draft. */
export function saveDraft(payload: DraftPayload, existingDraftId?: string): OrderDraft {
  const existing = loadDraft();
  const now = new Date();
  const draftId = existingDraftId ?? existing?.draftId ?? crypto.randomUUID();
  const createdAt = existing?.createdAt ?? now.toISOString();

  const draft: OrderDraft = {
    ...payload,
    draftId,
    idempotencyKey: draftId,
    schemaVersion: SCHEMA_VERSION,
    createdAt,
    updatedAt: now.toISOString(),
    expiresAt: addHours(now, EXPIRY_HOURS).toISOString(),
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }
  return draft;
}

export function clearDraft(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(DRAFT_KEY);
  }
}

/** A draft is meaningful when the user has at least selected a service. */
export function isDraftMeaningful(draft: OrderDraft): boolean {
  return draft.selectedService !== null;
}
