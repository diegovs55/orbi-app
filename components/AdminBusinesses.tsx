"use client";

import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Plus, Trash2, LockKeyhole, LogOut } from "lucide-react";
import {
  AffiliateBusiness,
  BusinessCategory,
  BusinessStatus,
  businessCategories,
  createBusiness,
  deleteBusiness,
  getBusinesses
} from "@/lib/businesses";

const ADMIN_PASSWORD = "orbi2026";
const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

export function AdminBusinesses() {
  const isUnlocked = useSyncExternalStore(subscribeToAdminSession, readAdminSession, () => false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [businesses, setBusinesses] = useState<AffiliateBusiness[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [businessError, setBusinessError] = useState("");

  useEffect(() => {
    let isActive = true;

    getBusinesses()
      .then((nextBusinesses) => {
        if (!isActive) {
          return;
        }

        setBusinesses(nextBusinesses);
        setBusinessError("");
      })
      .catch((caughtError: unknown) => {
        if (!isActive) {
          return;
        }

        setBusinesses([]);
        setBusinessError(
          caughtError instanceof Error
            ? caughtError.message
            : "No fue posible cargar los negocios guardados."
        );
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const sortedBusinesses = useMemo(() => {
    return [...businesses].sort((a, b) => a.category.localeCompare(b.category));
  }, [businesses]);

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.trim() !== ADMIN_PASSWORD) {
      setError("Contraseña incorrecta.");
      return;
    }

    window.sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
    window.dispatchEvent(new Event("orbi-admin-session-change"));
    setPassword("");
    setError("");
  }

  function handleLogout() {
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
    window.dispatchEvent(new Event("orbi-admin-session-change"));
  }

  async function handleSaveBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const newBusiness = {
      name: String(data.get("name") ?? "").trim(),
      category: String(data.get("category")) as BusinessCategory,
      description: String(data.get("description") ?? "").trim(),
      estimatedTime: String(data.get("estimatedTime") ?? "").trim(),
      status: String(data.get("status")) as BusinessStatus,
      rating: String(data.get("rating") ?? "").trim()
    };

    if (!newBusiness.name || !newBusiness.description || !newBusiness.estimatedTime) {
      return;
    }

    setIsSaving(true);
    setBusinessError("");

    try {
      const savedBusiness = await createBusiness(newBusiness);
      setBusinesses((currentBusinesses) => [savedBusiness, ...currentBusinesses]);
      form.reset();
    } catch (caughtError) {
      setBusinessError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible guardar el negocio."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteBusiness(id: string) {
    setBusinessError("");

    try {
      await deleteBusiness(id);
      setBusinesses((currentBusinesses) =>
        currentBusinesses.filter((business) => business.id !== id)
      );
    } catch (caughtError) {
      setBusinessError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible eliminar el negocio."
      );
    }
  }

  if (!isUnlocked) {
    return (
      <form
        onSubmit={handleLogin}
        className="rounded-md border border-orbi-cyan/15 bg-orbi-panel/75 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] backdrop-blur sm:p-6"
      >
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
          <LockKeyhole aria-hidden="true" className="h-6 w-6" />
        </div>
        <label className="block text-sm font-semibold text-orbi-text">
          Contraseña
          <input
            className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Ingresa la contraseña"
            required
          />
        </label>
        {error ? <p className="mt-3 text-sm font-semibold text-red-300">{error}</p> : null}
        <button
          type="submit"
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] focus:outline-none focus:ring-2 focus:ring-orbi-cyan/70 focus:ring-offset-2 focus:ring-offset-orbi-black"
        >
          Entrar al panel
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
        <div>
          <p className="text-sm font-black text-orbi-text">Administrador activo</p>
          <p className="mt-1 text-xs text-orbi-muted">Los cambios se guardan en Supabase.</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-orbi-text transition hover:border-orbi-cyan/35 hover:bg-white/10"
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
          Salir
        </button>
      </div>

      <form
        onSubmit={handleSaveBusiness}
        className="grid gap-4 rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] backdrop-blur sm:grid-cols-2 sm:p-6"
      >
        <Input label="Nombre del negocio" name="name" placeholder="Ej. Café Primavera" />
        <label className="block text-sm font-semibold text-orbi-text">
          Categoría
          <select
            name="category"
            className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
            defaultValue="Café y comida"
          >
            {businessCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Tiempo estimado"
          name="estimatedTime"
          placeholder="15–25 min"
          defaultValue="15–25 min"
        />
        <label className="block text-sm font-semibold text-orbi-text">
          Estado
          <select
            name="status"
            className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
            defaultValue="Disponible"
          >
            <option value="Disponible">Disponible</option>
            <option value="No disponible">No disponible</option>
          </select>
        </label>
        <Input
          label="Rating"
          name="rating"
          type="number"
          min="1"
          max="5"
          step="0.1"
          placeholder="4.8"
          defaultValue="4.8"
        />
        <label className="block text-sm font-semibold text-orbi-text sm:col-span-2">
          Descripción
          <textarea
            className="mt-2 min-h-24 w-full resize-y rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
            name="description"
            placeholder="Describe el beneficio para clientes de Orbi"
            required
          />
        </label>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] focus:outline-none focus:ring-2 focus:ring-orbi-cyan/70 focus:ring-offset-2 focus:ring-offset-orbi-black sm:col-span-2"
        >
          <Plus aria-hidden="true" className="h-5 w-5" />
          {isSaving ? "Guardando..." : "Guardar negocio"}
        </button>
      </form>

      <section className="rounded-md border border-white/10 bg-orbi-panel/70 p-4 shadow-soft backdrop-blur sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-orbi-text">Negocios guardados</h2>
          <span className="rounded-full border border-orbi-cyan/20 bg-orbi-blue/10 px-3 py-1 text-xs font-bold text-orbi-cyan">
            {businesses.length}
          </span>
        </div>

        {businessError ? (
          <p className="mb-4 rounded-md border border-red-300/15 bg-red-400/10 p-4 text-sm font-semibold text-red-200">
            {businessError}
          </p>
        ) : null}

        {isLoading ? (
          <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
            Cargando negocios guardados...
          </p>
        ) : sortedBusinesses.length ? (
          <div className="space-y-3">
            {sortedBusinesses.map((business) => (
              <article
                key={business.id}
                className="rounded-md border border-orbi-cyan/12 bg-white/[0.04] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
                      {business.category}
                    </p>
                    <h3 className="mt-1 font-black text-orbi-text">{business.name}</h3>
                    <p className="mt-1 text-sm leading-6 text-orbi-muted">
                      {business.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteBusiness(business.id)}
                    aria-label={`Eliminar ${business.name}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-red-300/15 bg-red-400/10 text-red-200 transition hover:bg-red-400/20"
                  >
                    <Trash2 aria-hidden="true" className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-orbi-muted">
                    {business.status}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-orbi-muted">
                    {business.estimatedTime}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-orbi-muted">
                    ⭐ {business.rating}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
            Aún no hay negocios guardados en este navegador.
          </p>
        )}
      </section>
    </div>
  );
}

type InputProps = {
  label: string;
  name: string;
  placeholder: string;
  type?: string;
  min?: string;
  max?: string;
  step?: string;
  defaultValue?: string;
};

function Input({ label, name, placeholder, type = "text", min, max, step, defaultValue }: InputProps) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
        name={name}
        type={type}
        min={min}
        max={max}
        step={step}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required
      />
    </label>
  );
}

function readAdminSession() {
  return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
}

function subscribeToAdminSession(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("orbi-admin-session-change", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("orbi-admin-session-change", callback);
  };
}
