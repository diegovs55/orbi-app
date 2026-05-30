import { BrandMark } from "@/components/BrandMark";
import { FormField } from "@/components/FormField";
import { OrbiButton } from "@/components/OrbiButton";

export default function AgentLoginPage() {
  return (
    <div className="min-h-screen bg-orbi-black text-orbi-text">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <BrandMark />
          <span className="rounded-full border border-orbi-cyan/25 px-3 py-1 text-xs font-semibold text-orbi-cyan">
            Agentes
          </span>
        </header>

        <main className="mt-16 flex flex-1 flex-col justify-center gap-12 lg:flex-row lg:items-center lg:gap-20">
          <section className="max-w-xl space-y-6 lg:shrink-0">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
              Acceso de agente
            </p>
            <h1 className="text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
              Bienvenido a tu panel de operaciones.
            </h1>
            <p className="max-w-lg text-base leading-7 text-orbi-muted sm:text-lg">
              Inicia sesión para ver misiones disponibles, aceptar encargos y atender nuevas solicitudes desde la Red Orbi.
            </p>
            <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
                ¿Aún no tienes cuenta?
              </p>
              <p className="text-sm leading-6 text-orbi-muted">
                Contacta a tu coordinador Orbi para activar tu acceso o hazlo desde el panel de administración cuando seas un agente autorizado.
              </p>
            </div>
          </section>

          <section className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-orbi-black/70 p-8 shadow-glow sm:p-10">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
                Login de agente
              </p>
              <h2 className="text-2xl font-black tracking-tight text-white">
                Ingresa con tu correo y contraseña
              </h2>
              <p className="text-sm leading-6 text-orbi-muted">
                Tus credenciales te permitirán conectarte al flujo de solicitudes y misiones en tiempo real.
              </p>
            </div>

            <form className="mt-8 space-y-6">
              <FormField
                label="Correo electrónico"
                name="email"
                type="email"
                placeholder="tu@correo.com"
              />

              <FormField
                label="Contraseña"
                name="password"
                type="password"
                placeholder="Contraseña segura"
              />

              <div className="flex items-center justify-between text-sm font-semibold text-orbi-muted">
                <span>¿Olvidaste tu clave?</span>
                <a href="#" className="text-orbi-cyan hover:text-white">
                  Recuperar acceso
                </a>
              </div>

              <OrbiButton type="submit" className="w-full text-base">
                Entrar
              </OrbiButton>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
