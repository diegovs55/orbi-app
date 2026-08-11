export function SupportCard() {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-muted">
        Atención ORBI
      </p>
      <p className="mt-1 text-sm text-orbi-muted">
        ¿Tienes alguna duda o necesitas ayuda?
      </p>
      <p className="mt-1 text-sm font-semibold text-orbi-text">+52 220 644 1442</p>
      <a
        href="tel:+522206441442"
        className="mt-3 inline-flex min-h-9 items-center justify-center rounded-md bg-orbi-blue px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0f7af0]"
      >
        Llamar
      </a>
    </div>
  );
}
