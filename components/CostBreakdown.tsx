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
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
        Desglose de pago
      </p>
      <div className="space-y-2 text-sm">
        {subtotal !== null ? (
          <div className="flex justify-between text-orbi-muted">
            <span>Subtotal productos</span>
            <span className="font-semibold text-orbi-text">${subtotal.toFixed(0)}</span>
          </div>
        ) : null}
        {serviceFee !== null ? (
          <div className="flex justify-between text-orbi-muted">
            <span>Servicio / logística</span>
            <span className="font-semibold text-orbi-text">${serviceFee.toFixed(0)}</span>
          </div>
        ) : null}
        <div className="border-t border-white/15 pt-2">
          <div className="flex justify-between">
            <span className="font-bold text-orbi-text">Total a pagar</span>
            <span className="font-black text-orbi-cyan">${total.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
