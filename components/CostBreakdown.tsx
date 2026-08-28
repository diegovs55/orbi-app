"use client";

/**
 * Renders the canonical cost breakdown used across all mission views.
 *
 * Order is always:
 *   Subtotal productos   (hidden when null — e.g. pure messenger missions)
 *   Servicio / logística
 *   ──────────────────
 *   Total a pagar
 *
 * Pass numbers for known values, null to hide a line.
 */
export function CostBreakdown({
  subtotal,
  serviceFee,
  total,
}: {
  subtotal: number | null;
  serviceFee: number | null;
  total: number;
}) {
  return (
    <div className="rounded-md border border-white/[0.07] bg-white/[0.025] px-4 py-3">
      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-orbi-muted/55">
        Desglose de pago
      </p>
      <div className="space-y-1.5 text-sm">
        {subtotal !== null ? (
          <div className="flex justify-between text-orbi-muted/65">
            <span>Subtotal productos</span>
            <span className="font-medium text-orbi-text/70">${subtotal.toFixed(0)}</span>
          </div>
        ) : null}
        {serviceFee !== null ? (
          <div className="flex justify-between text-orbi-muted/65">
            <span>Servicio / logística</span>
            <span className="font-medium text-orbi-text/70">${serviceFee.toFixed(0)}</span>
          </div>
        ) : null}
        <div className="border-t border-white/[0.08] pt-2.5 mt-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-orbi-text">Total a pagar</span>
            <span className="text-xl font-black text-orbi-cyan">${total.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
