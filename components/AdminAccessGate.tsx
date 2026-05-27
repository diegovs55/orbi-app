"use client";

import { FormEvent, ReactNode, useState, useSyncExternalStore } from "react";
import { LockKeyhole, LogOut } from "lucide-react";

const ADMIN_PASSWORD = "orbi2026";
const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

export function AdminAccessGate({ children }: { children: ReactNode }) {
  const isUnlocked = useSyncExternalStore(subscribeToAdminSession, readAdminSession, () => false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

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

  if (!isUnlocked) {
    return (
      <form
        onSubmit={handleLogin}
        className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] backdrop-blur sm:p-6"
      >
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
          <LockKeyhole aria-hidden="true" className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-black text-orbi-text">Acceso operativo</h2>
        <p className="mt-2 text-sm leading-6 text-orbi-muted">
          Ingresa la contraseña para ver métricas, misiones, catálogo, negocios, agentes y estadísticas.
        </p>
        <label className="mt-5 block text-sm font-semibold text-orbi-text">
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
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
        <div>
          <p className="text-sm font-black text-orbi-text">Administrador activo</p>
          <p className="mt-1 text-xs text-orbi-muted">
            Panel completo listo para operar la red, aun cuando algunos datos estén vacíos.
          </p>
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
      {children}
    </div>
  );
}

function readAdminSession() {
  if (typeof window === "undefined") {
    return false;
  }

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
