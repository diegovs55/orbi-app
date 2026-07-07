"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { LocateFixed, LogOut, MapPin, Pencil, Plus, PowerOff, RotateCcw, Store } from "lucide-react";
import {
  CatalogBusiness,
  CatalogProduct,
  CatalogProductStatus,
  ProductCategory,
  businessSectors,
  getCatalogBusinessesWithOptions,
  getBusinessOwnProducts,
  updateBusinessProfile,
  upsertBusinessProduct,
  productCategories,
  normalizeTimeToHHmm,
} from "@/lib/catalog";
import {
  BusinessSession,
  clearBusinessSession,
  getBusinessSession
} from "@/lib/businessSession";
import {
  ActiveMission,
  confirmMissionByBusiness,
  fetchBusinessPendingMissions,
  markOrderReadyByBusiness,
} from "@/lib/missions";
import { subscribeToTableChanges } from "@/lib/supabase";
import {
  isAudioReady,
  enableAutoUnlock,
  playBusinessAlert,
  startRepeatingAlert,
  stopRepeatingAlert,
} from "@/lib/notificationSound";

const LocationPickerMap = dynamic(
  async () => {
    const mod = await import("@/components/LocationPickerMap");
    return mod.default ?? (mod as { LocationPickerMap: React.ComponentType<unknown> }).LocationPickerMap;
  },
  { ssr: false }
);

const statusLabel: Record<CatalogProductStatus, string> = {
  disponible: "Disponible",
  agotado: "Agotado",
  pausado: "Pausado"
};

export function BusinessCatalog({ onLogout }: { onLogout: () => void }) {
  const [session, setSession] = useState<BusinessSession | null>(null);
  const [myBusiness, setMyBusiness] = useState<CatalogBusiness | null>(null);
  const [noMatch, setNoMatch] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // Product list search
  const [searchQ, setSearchQ] = useState("");

  // Product form state
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [fname, setFname] = useState("");
  const [fdesc, setFdesc] = useState("");
  const [fcat, setFcat] = useState("");
  const [fprice, setFprice] = useState("");
  const [fstatus, setFstatus] = useState<CatalogProductStatus>("disponible");
  const [ferror, setFerror] = useState("");
  const [fmsg, setFmsg] = useState("");
  const [fsaving, setFsaving] = useState(false);

  // Profile form state
  const [showProfile, setShowProfile] = useState(false);
  const [pfName, setPfName] = useState("");
  const [pfDesc, setPfDesc] = useState("");
  const [pfCat, setPfCat] = useState("");
  const [pfZone, setPfZone] = useState("");
  const [pfStart, setPfStart] = useState("");
  const [pfEnd, setPfEnd] = useState("");
  const [pfLoc, setPfLoc] = useState<{ lat: number; lng: number }>({ lat: 19.4326, lng: -99.1332 });
  const [pfLocSet, setPfLocSet] = useState(false);
  const [pfSaving, setPfSaving] = useState(false);
  const [pfError, setPfError] = useState("");
  const [pfGeoLoading, setPfGeoLoading] = useState(false);

  // Load session → find business
  useEffect(() => {
    const s = getBusinessSession();
    if (!s) return;
    setSession(s);
    if (!s.supabaseBusinessId) { setNoMatch(true); return; }
    getCatalogBusinessesWithOptions({ includeDemo: false })
      .then((all) => {
        const found = all.find((b) => b.id === s.supabaseBusinessId);
        if (found) setMyBusiness(found);
        else setNoMatch(true);
      })
      .catch(() => setNoMatch(true));
  }, []);

  // Init profile fields when business loads — sanitize time values
  useEffect(() => {
    if (!myBusiness) return;
    setPfName(myBusiness.name);
    setPfDesc(myBusiness.baseText || "");
    setPfCat(myBusiness.category || "");
    setPfZone(myBusiness.zone || "");
    // normalizeTimeToHHmm converts "10:00 p.m." → "22:00", "08:00 a.m." → "08:00"
    setPfStart(normalizeTimeToHHmm(myBusiness.availabilityStart) || "");
    setPfEnd(normalizeTimeToHHmm(myBusiness.availabilityEnd) || "");
    if (myBusiness.lat !== null && myBusiness.lng !== null) {
      setPfLoc({ lat: myBusiness.lat, lng: myBusiness.lng });
      setPfLocSet(true);
      setShowProfile(false);
    } else {
      setShowProfile(true);
    }
  }, [myBusiness]);

  // Load products from Supabase when business is available
  useEffect(() => {
    if (!myBusiness || !session?.supabaseBusinessId) return;
    setProductsLoading(true);
    getBusinessOwnProducts(session.supabaseBusinessId, myBusiness)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, [myBusiness, session?.supabaseBusinessId]);

  if (!session) return null;

  function handleLogout() {
    clearBusinessSession();
    onLogout();
  }

  function resetForm() {
    setEditing(null);
    setShowForm(false);
    setFname(""); setFdesc(""); setFcat(""); setFprice("");
    setFstatus("disponible"); setFerror("");
  }

  function startEdit(p: CatalogProduct) {
    setEditing(p);
    setFname(p.name); setFdesc(p.description);
    setFcat(p.category); setFprice(String(p.price));
    setFstatus(p.status);
    setShowForm(true);
  }

  async function handleToggle(p: CatalogProduct) {
    if (!myBusiness) return;
    const nextStatus: CatalogProductStatus = p.status === "disponible" ? "pausado" : "disponible";
    const updated: CatalogProduct = { ...p, status: nextStatus, available: nextStatus === "disponible" };
    try {
      await upsertBusinessProduct(updated);
      setProducts((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    } catch {
      // silent – keep UI unchanged
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!session?.supabaseBusinessId || !myBusiness) return;
    const trimName = fname.trim();
    const parsed = Number(fprice);
    if (!trimName || !fcat.trim() || !Number.isFinite(parsed) || parsed < 0) {
      setFerror("Completa nombre, categoría y precio.");
      return;
    }
    setFerror("");
    setFsaving(true);

    const product: CatalogProduct = {
      id: editing?.id ?? `prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      businessId: session.supabaseBusinessId,
      businessName: myBusiness.name,
      businessZone: myBusiness.zone ?? "",
      businessBaseText: myBusiness.baseText ?? "",
      businessLat: myBusiness.lat ?? null,
      businessLng: myBusiness.lng ?? null,
      sector: myBusiness.category ?? "Otro",
      name: trimName,
      description: fdesc.trim(),
      category: fcat as ProductCategory,
      price: parsed,
      available: fstatus === "disponible",
      status: fstatus,
      availability: myBusiness.availability ?? "",
      availabilityInherited: true,
      searchTags: ""
    };

    try {
      const savedId = await upsertBusinessProduct(product);
      const savedProduct = { ...product, id: savedId };
      setProducts((prev) => {
        const idx = prev.findIndex((x) => x.id === product.id || x.id === savedId);
        if (idx >= 0) return prev.map((x, i) => (i === idx ? savedProduct : x));
        return [savedProduct, ...prev];
      });
      setFmsg(editing ? "Producto actualizado." : "Producto guardado en catálogo.");
      resetForm();
    } catch (err) {
      setFerror(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setFsaving(false);
    }
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) return;
    setPfGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPfLoc(point);
        setPfLocSet(true);
        try {
          const geo = await reverseGeocodePoint(point);
          setPfZone((prev) => prev.trim() || geo.zone);
          setPfDesc((prev) => prev.trim() || geo.baseText);
        } catch { /* silencioso */ }
        setPfGeoLoading(false);
      },
      () => setPfGeoLoading(false),
      { timeout: 8000 }
    );
  }

  async function handleProfileSave(e: FormEvent) {
    e.preventDefault();
    if (!session?.supabaseBusinessId) return;

    const missing: string[] = [];
    if (!pfName.trim()) missing.push("nombre");
    if (!pfCat.trim()) missing.push("categoría");
    if (!pfZone.trim()) missing.push("zona");
    if (!pfStart) missing.push("hora de apertura");
    if (!pfEnd) missing.push("hora de cierre");
    if (!pfLocSet) missing.push("ubicación en el mapa");
    if (missing.length) {
      setPfError(`Faltan datos: ${missing.join(", ")}.`);
      return;
    }

    setPfSaving(true);
    setPfError("");
    try {
      await updateBusinessProfile(session.supabaseBusinessId, {
        name: pfName.trim(),
        category: pfCat.trim(),
        zone: pfZone.trim(),
        baseText: pfDesc.trim() || pfZone.trim(),
        lat: pfLoc.lat,
        lng: pfLoc.lng,
        availabilityStart: pfStart,
        availabilityEnd: pfEnd
      });
      const all = await getCatalogBusinessesWithOptions({ includeDemo: false });
      const found = all.find((b) => b.id === session.supabaseBusinessId);
      if (found) {
        setMyBusiness(found);
        setShowProfile(false);
        setFmsg("Perfil guardado. Tus productos ya pueden aparecer en el catálogo.");
      }
    } catch (err) {
      setPfError(err instanceof Error ? err.message : "Error al guardar perfil.");
    } finally {
      setPfSaving(false);
    }
  }

  // ── Header ───────────────────────────────────────────────────────────────────
  const header = (
    <div className="flex items-center justify-between rounded-md border border-orbi-cyan/15 bg-white/[0.04] px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
          <Store aria-hidden="true" className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-black text-orbi-text">{session.name}</p>
          <p className="text-xs text-orbi-muted">
            {session.email}{session.phone ? ` · ${session.phone}` : ""}
          </p>
        </div>
      </div>
      <button type="button" onClick={handleLogout}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-orbi-muted transition hover:bg-white/10 hover:text-orbi-text">
        <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
        Salir
      </button>
    </div>
  );

  // ── No match ─────────────────────────────────────────────────────────────────
  if (noMatch) {
    return (
      <section className="space-y-4">
        {header}
        <p className="rounded-md border border-yellow-300/20 bg-yellow-300/[0.06] px-4 py-3 text-xs font-semibold text-yellow-200">
          Tu negocio aún no está vinculado al catálogo. Contacta a Orbi para activarlo.
        </p>
      </section>
    );
  }

  // ── Panel de negocio ─────────────────────────────────────────────────────────
  return (
    <section className="space-y-5">
      {header}

      {/* Business subtitle + edit profile button */}
      {myBusiness ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-orbi-muted">
            Catálogo de{" "}
            <span className="font-bold text-orbi-cyan">{myBusiness.name}</span>
            {" "}· {myBusiness.zone || "Sin zona asignada"}
          </p>
          {!showProfile ? (
            <button type="button" onClick={() => setShowProfile(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-orbi-muted transition hover:bg-white/10 hover:text-orbi-text">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
              Editar perfil
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── Pedidos pendientes ─────────────────────────────────────────────── */}
      {myBusiness ? <PendingOrders businessName={myBusiness.name} /> : null}

      {/* Profile form */}
      {showProfile ? (
        <form onSubmit={handleProfileSave}
          className="grid gap-4 rounded-md border border-orbi-cyan/20 bg-orbi-panel/72 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-orbi-text">Perfil del negocio</p>
            {myBusiness?.lat !== null ? (
              <button type="button" onClick={() => setShowProfile(false)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-orbi-muted">
                <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Cancelar
              </button>
            ) : null}
          </div>

          {myBusiness?.lat === null ? (
            <p className="rounded-md border border-yellow-300/20 bg-yellow-300/[0.06] px-3 py-2 text-xs font-semibold text-yellow-200">
              Completa tu perfil para que tus productos aparezcan en el catálogo público.
            </p>
          ) : null}

          {/* Nombre + Categoría */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nombre del negocio *">
              <input type="text" value={pfName} onChange={(e) => setPfName(e.target.value)}
                placeholder="Café La Órbita" required
                className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none" />
            </FormField>

            {/* Combobox: select from list OR type custom */}
            <FormField label="Categoría *">
              <input
                list="biz-sectors-list"
                value={pfCat}
                onChange={(e) => setPfCat(e.target.value)}
                placeholder="Selecciona o escribe…"
                required
                className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none"
              />
              <datalist id="biz-sectors-list">
                {businessSectors.map((s) => <option key={s} value={s} />)}
              </datalist>
            </FormField>
          </div>

          {/* Zona */}
          <FormField label="Zona / Barrio *">
            <input type="text" value={pfZone} onChange={(e) => setPfZone(e.target.value)}
              placeholder="Centro, Col. Roma, Polanco…" required
              className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none" />
          </FormField>

          {/* Descripción */}
          <FormField label="Descripción (opcional)">
            <input type="text" value={pfDesc} onChange={(e) => setPfDesc(e.target.value)}
              placeholder="Cafetería artesanal cerca del parque"
              className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none" />
          </FormField>

          {/* Horario — select con opciones HH:mm cada 30 min, sin "Valor no válido" */}
          <div className="grid gap-4 sm:grid-cols-2">
            <ProfileTimeSelect label="Apertura *" value={pfStart} onChange={setPfStart} />
            <ProfileTimeSelect label="Cierre *" value={pfEnd} onChange={setPfEnd} />
          </div>

          {/* Mapa + ubicación actual */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-semibold text-orbi-muted">
                Ubicación en el mapa *{" "}
                {pfLocSet ? (
                  <span className="text-emerald-300">
                    · {pfLoc.lat.toFixed(5)}, {pfLoc.lng.toFixed(5)}
                  </span>
                ) : (
                  <span className="text-yellow-300">· haz clic en el mapa para fijar tu negocio</span>
                )}
              </label>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={pfGeoLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-orbi-cyan/20 bg-orbi-blue/10 px-2.5 py-1 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/20 disabled:opacity-50"
              >
                <LocateFixed aria-hidden="true" className="h-3.5 w-3.5" />
                {pfGeoLoading ? "Buscando…" : "Usar mi ubicación"}
              </button>
            </div>
            <div className="h-52 w-full overflow-hidden rounded-md border border-white/15">
              <LocationPickerMap
                point={pfLoc}
                onPointChange={async (p: { lat: number; lng: number }) => {
                  setPfLoc(p);
                  setPfLocSet(true);
                  try {
                    const geo = await reverseGeocodePoint(p);
                    setPfZone((prev) => prev.trim() || geo.zone);
                    setPfDesc((prev) => prev.trim() || geo.baseText);
                  } catch { /* silencioso */ }
                }}
              />
            </div>
          </div>

          {pfError ? (
            <p className="rounded-md border border-red-400/20 bg-red-400/[0.08] px-3 py-2 text-xs font-semibold text-red-300">
              {pfError}
            </p>
          ) : null}

          <button type="submit" disabled={pfSaving}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-2 text-sm font-bold text-white transition hover:bg-[#0f7af0] disabled:opacity-50">
            {pfSaving ? "Guardando…" : "Guardar perfil"}
          </button>
        </form>
      ) : null}

      {/* Product list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-muted">Mis productos</p>
          {!showForm ? (
            <button type="button" onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-orbi-cyan/20 bg-orbi-blue/10 px-3 py-1.5 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/20">
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              Agregar producto
            </button>
          ) : null}
        </div>

        {products.length > 0 ? (
          <input
            type="search"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Buscar producto…"
            className="w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted focus:border-orbi-cyan/50 focus:outline-none"
          />
        ) : null}

        {fmsg ? (
          <p className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/10 px-3 py-2 text-xs font-semibold text-orbi-cyan">
            {fmsg}
          </p>
        ) : null}

        {productsLoading ? (
          <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
            Cargando productos…
          </p>
        ) : products.length === 0 && !showForm ? (
          <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
            Aún no tienes productos. Agrega tu primer producto.
          </p>
        ) : null}

        {products
          .filter((p) => {
            if (!searchQ.trim()) return true;
            const q = searchQ.toLowerCase();
            return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
          })
          .map((p) => (
          <article key={p.id} className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-orbi-text">{p.name}</p>
                {p.description ? (
                  <p className="text-xs text-orbi-muted mt-0.5">{p.description}</p>
                ) : null}
                <p className="mt-1 text-xs font-semibold text-orbi-cyan">
                  ${p.price} · {p.category}
                </p>
                <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                  p.status === "disponible"
                    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                    : "border-white/10 bg-white/[0.04] text-orbi-muted"
                }`}>
                  {statusLabel[p.status]}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => startEdit(p)} title="Editar"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-orbi-muted transition hover:border-orbi-cyan/30 hover:text-orbi-cyan">
                  <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => handleToggle(p)}
                  title={p.status === "disponible" ? "Desactivar" : "Activar"}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
                    p.status === "disponible"
                      ? "border-red-300/15 bg-red-400/10 text-red-300 hover:bg-red-400/20"
                      : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                  }`}>
                  <PowerOff aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Product form */}
      {showForm ? (
        <form onSubmit={handleSave} className="grid gap-4 rounded-md border border-orbi-cyan/15 bg-orbi-panel/72 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-orbi-text">
              {editing ? "Editar producto" : "Nuevo producto"}
            </p>
            <button type="button" onClick={resetForm}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-orbi-muted">
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Cancelar
            </button>
          </div>
          <FormField label="Nombre del producto">
            <input type="text" value={fname} onChange={(e) => setFname(e.target.value)}
              placeholder="Frappe moka" required
              className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none" />
          </FormField>
          <FormField label="Descripción (opcional)">
            <input type="text" value={fdesc} onChange={(e) => setFdesc(e.target.value)}
              placeholder="Bebida fría preparada al momento"
              className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Categoría">
              <input
                list="product-cats-list"
                value={fcat}
                onChange={(e) => setFcat(e.target.value)}
                placeholder="Selecciona o escribe…"
                required
                className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none"
              />
              <datalist id="product-cats-list">
                {productCategories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </FormField>
            <FormField label="Precio ($)">
              <input type="number" min="0" step="0.01" value={fprice}
                onChange={(e) => setFprice(e.target.value)} placeholder="65" required
                className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none" />
            </FormField>
          </div>
          <FormField label="Estado">
            <select value={fstatus} onChange={(e) => setFstatus(e.target.value as CatalogProductStatus)}
              className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none">
              <option value="disponible">Disponible</option>
              <option value="agotado">Agotado temporalmente</option>
              <option value="pausado">Pausado</option>
            </select>
          </FormField>
          {ferror ? <p className="text-xs font-semibold text-red-400">{ferror}</p> : null}
          <button type="submit" disabled={fsaving}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-2 text-sm font-bold text-white transition hover:bg-[#0f7af0] disabled:opacity-50">
            <Plus aria-hidden="true" className="h-4 w-4" />
            {fsaving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar producto"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

// ── Pedidos pendientes ────────────────────────────────────────────────────────

const BUSINESS_ALERT_KEY = "business-pending";

function PendingOrders({ businessName }: { businessName: string }) {
  const [orders, setOrders] = useState<ActiveMission[]>([]);
  const [confirming, setConfirming] = useState<Set<string>>(new Set());
  const [audioBlocked, setAudioBlocked] = useState(false);

  // IDs seen on the very first load — never alert for these.
  const initialIds = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const result = await fetchBusinessPendingMissions(businessName);
    setOrders(result);
  }, [businessName]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribeToTableChanges("missions", () => void load()), [load]);

  // Register auto-unlock once on mount — fires silently on first gesture.
  useEffect(() => { enableAutoUnlock(); }, []);

  // Sound detection: run after every orders update.
  useEffect(() => {
    if (initialIds.current === null) {
      // First load: record existing IDs, no sound.
      initialIds.current = new Set(orders.map((o) => o.id));
      return;
    }

    const hasNewUnconfirmed = orders.some(
      (o) => o.status === "esperando_negocio" && !initialIds.current!.has(o.id)
    );

    if (hasNewUnconfirmed) {
      if (!isAudioReady()) {
        // Auto-unlock already registered; show fallback only if gesture never happened.
        setAudioBlocked(true);
      } else {
        setAudioBlocked(false);
        startRepeatingAlert(BUSINESS_ALERT_KEY, playBusinessAlert, 20_000);
      }
    } else {
      setAudioBlocked(false);
      stopRepeatingAlert(BUSINESS_ALERT_KEY);
    }
  }, [orders]);

  // Stop alert when component unmounts.
  useEffect(() => () => stopRepeatingAlert(BUSINESS_ALERT_KEY), []);

  if (orders.length === 0 && !audioBlocked) return null;

  async function handleAction(id: string, status: string) {
    setConfirming((prev) => new Set(prev).add(id));
    if (status === "esperando_negocio") await confirmMissionByBusiness(id);
    else await markOrderReadyByBusiness(id);
    await load();
    setConfirming((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  return (
    <div className="space-y-2">
      {audioBlocked ? (
        <p className="rounded-md border border-yellow-300/20 bg-yellow-300/[0.05] px-3 py-2 text-center text-xs text-yellow-200/80">
          Toca la pantalla para activar alertas de sonido.
        </p>
      ) : null}
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
        Pedidos pendientes · {orders.length}
      </p>
      {orders.map((m) => {
        const isPreparando = m.status === "preparando";
        const isBusy = confirming.has(m.id);
        return (
          <div
            key={m.id}
            className={`rounded-md border p-4 ${isPreparando ? "border-emerald-400/20 bg-emerald-400/[0.06]" : "border-yellow-300/20 bg-yellow-300/[0.06]"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isPreparando ? "bg-emerald-400/15 text-emerald-300" : "bg-yellow-300/15 text-yellow-200"}`}>
                    {isPreparando ? "Preparando" : "Pendiente"}
                  </span>
                </div>
                <p className="truncate text-sm font-bold text-orbi-text">{m.detail.split("\n")[0]}</p>
                <p className="font-mono text-[10px] text-orbi-muted/60">Folio: #{m.id.slice(-8).toUpperCase()}</p>
                <p className="text-xs text-orbi-muted">
                  Solicitante: {m.requester_name} · {m.requester_phone}
                </p>
                <p className="text-xs text-orbi-muted">
                  Agente: {m.selected_agent_name || "—"} · Total: ${m.total_amount ?? 0}
                </p>
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleAction(m.id, m.status)}
                className={`shrink-0 inline-flex min-h-9 items-center justify-center rounded-md px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50 ${isPreparando ? "bg-emerald-600 hover:bg-emerald-500" : "bg-orbi-blue hover:bg-[#0f7af0]"}`}
              >
                {isBusy
                  ? (isPreparando ? "Marcando listo…" : "Confirmando…")
                  : (isPreparando ? "Pedido listo ✓" : "Confirmar pedido")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-orbi-muted">{label}</label>
      {children}
    </div>
  );
}

function buildProfileTimeOptions(): string[] {
  const opts: string[] = [];
  for (let h = 6; h <= 23; h++) {
    opts.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 23) opts.push(`${String(h).padStart(2, "0")}:30`);
  }
  return opts;
}

const profileTimeOptions = buildProfileTimeOptions();

async function reverseGeocodePoint(point: { lat: number; lng: number }) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
      point.lat
    )}&lon=${encodeURIComponent(point.lng)}`
  );
  if (!res.ok) throw new Error("Geocoding failed");
  const data = (await res.json()) as {
    display_name?: string;
    address?: {
      neighbourhood?: string;
      suburb?: string;
      village?: string;
      town?: string;
      city?: string;
      municipality?: string;
      county?: string;
      state?: string;
    };
  };
  const addr = data.address ?? {};
  const zone =
    addr.neighbourhood ||
    addr.suburb ||
    addr.village ||
    addr.town ||
    addr.city ||
    addr.municipality ||
    addr.county ||
    addr.state ||
    "Zona calculada por ubicación";
  const baseText = data.display_name?.trim() || `Punto marcado (${point.lat}, ${point.lng})`;
  return { zone, baseText };
}

function ProfileTimeSelect({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-orbi-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none"
      >
        <option value="">Selecciona hora</option>
        {profileTimeOptions.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  );
}
