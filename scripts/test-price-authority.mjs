/**
 * ORBI — Prueba E2E: Autoridad del servidor sobre precios
 *
 * Verifica que el servidor ignore completamente los valores financieros
 * enviados por el cliente y recalcule todos los importes desde cero.
 *
 * Uso:
 *   node scripts/test-price-authority.mjs
 *
 * Requiere que el servidor de desarrollo esté corriendo en localhost:3000.
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local
 * (el script los lee vía el servidor — no los necesita directamente aquí).
 */

const BASE_URL = "http://localhost:3000";

// ── Valores reales esperados según ORBI_MOTOR_1.0 ─────────────────────────────
// Misión de catálogo con:
//   - origin → destination: Monterrey centro (~4.2 km haversine)
//   - subtotal_productos: 1 ítem × $56 = $56
//   - tramo de distancia: hasta 5 km → tarifa base $35
//   - recargo por subtotal: subtotal $56 < $300 → sin recargo
//   - service_fee esperado: $35
//   - total_amount esperado: $56 + $35 = $91
//   - costo_agente esperado: $35 × 0.70 = $24.50
//   - ganancia_orbi esperada: $35 × 0.30 = $10.50

const EXPECTED = {
  subtotal_productos: 56,
  service_fee: 35,
  total_amount: 91,
  costo_agente: 24.5,
  ganancia_orbi: 10.5,
  pricing_rule: "ORBI_MOTOR_1.0",
};

// ── Payload con valores financieros deliberadamente falsos ────────────────────
// El cliente envía números completamente inventados para service_fee, total_amount,
// costo_agente y ganancia_orbi. El servidor debe ignorarlos todos.

const FAKE_FINANCIALS = {
  service_fee: 1,
  total_amount: 1,
  costo_agente: 0.50,
  ganancia_orbi: 0.50,
  subtotal_productos: 999, // también falso — el servidor recalcula desde items[]
};

const payload = {
  id: crypto.randomUUID(),
  mission_type: "compra_negocio",
  service_type: "Compra local",
  status: "esperando_negocio",
  detail: "Test E2E — autoridad de precios",
  estimated_orbit: "~15 min",

  // Identidad
  guest_id: crypto.randomUUID(),
  requester_name: "Test E2E",
  requester_phone: "5210000000",

  // Coordenadas reales de Monterrey (origen → destino ~4.2 km)
  origin_lat: 25.6866,
  origin_lng: -100.3161,
  origin_text: "Macroplaza, Monterrey",
  destination_lat: 25.7214,
  destination_lng: -100.3139,
  destination_text: "San Jerónimo, Monterrey",

  // Negocio
  business_id: "00000000-0000-0000-0000-000000000001",
  business_name: "Negocio Test",
  business_lat: 25.6866,
  business_lng: -100.3161,

  // El cliente envía SOLO product_id y quantity — el servidor obtiene
  // price, product_name, business_id y category desde public.catalog.
  items: [
    {
      product_id: "00000000-0000-0000-0000-000000000002",
      quantity: 1,
      // price, product_name, subtotal, business_name → ignorados por el servidor
    },
  ],

  // Agente placeholder (sin coordenadas para esta prueba)
  selected_agent_id: "00000000-0000-0000-0000-000000000003",
  selected_agent_name: "Agente Test",

  payment_status: "pendiente",
  payment_method: "efectivo",

  // ── VALORES FINANCIEROS FALSOS ENVIADOS POR EL CLIENTE ────────────────────
  // El servidor debe ignorar todos estos y recalcular con sus propios motores.
  ...FAKE_FINANCIALS,
};

// ── Ejecución ─────────────────────────────────────────────────────────────────

console.log("ORBI — Prueba E2E: Autoridad del servidor sobre precios");
console.log("─".repeat(60));
console.log("\nValores FALSOS enviados por el cliente:");
for (const [k, v] of Object.entries(FAKE_FINANCIALS)) {
  console.log(`  ${k.padEnd(22)} $${v}`);
}
console.log("\nValores REALES esperados del servidor:");
for (const [k, v] of Object.entries(EXPECTED)) {
  console.log(`  ${k.padEnd(22)} ${typeof v === "number" ? "$" + v : v}`);
}

console.log("\nEnviando misión al servidor...\n");

let response;
try {
  response = await fetch(`${BASE_URL}/api/missions/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
} catch (err) {
  console.error("❌  No se pudo conectar al servidor. ¿Está corriendo en localhost:3000?");
  console.error("    Inicia el servidor con: npm run dev");
  process.exit(1);
}

if (!response.ok) {
  const body = await response.json().catch(() => ({}));
  console.error(`❌  El servidor devolvió HTTP ${response.status}:`);
  console.error("   ", JSON.stringify(body, null, 2));
  process.exit(1);
}

const { mission } = await response.json();

console.log(`Misión creada: ${mission.id}`);
console.log("\nValores persistidos por el servidor:");

const FIELDS = [
  "subtotal_productos",
  "service_fee",
  "total_amount",
  "costo_agente",
  "ganancia_orbi",
  "pricing_rule",
];

let passed = 0;
let failed = 0;

for (const field of FIELDS) {
  const actual = mission[field];
  const expected = EXPECTED[field];
  const fakeValue = FAKE_FINANCIALS[field];
  const ok = actual === expected;

  const symbol = ok ? "✅" : "❌";
  const fakeNote = fakeValue !== undefined ? ` (cliente envió: ${fakeValue})` : "";
  console.log(`  ${symbol} ${field.padEnd(22)} ${typeof actual === "number" ? "$" + actual : actual}${fakeNote}`);

  if (ok) passed++;
  else failed++;
}

// Verificación adicional: ningún valor falso llegó a la DB
const noFakeLeaked = FIELDS.every((f) => {
  const fake = FAKE_FINANCIALS[f];
  if (fake === undefined) return true;
  return mission[f] !== fake;
});

console.log("\n─".repeat(60));

if (failed === 0 && noFakeLeaked) {
  console.log(`\n✅  PRUEBA PASADA — ${passed}/${passed} campos correctos.`);
  console.log("    El servidor ignoró todos los valores falsos del cliente.");
  console.log("    Los campos financieros en DB son 100% autoritativos del servidor.");
} else {
  console.log(`\n❌  PRUEBA FALLIDA — ${failed} campo(s) incorrectos.`);
  if (!noFakeLeaked) {
    console.log("    CRÍTICO: al menos un valor falso del cliente llegó a la base de datos.");
  }
  process.exit(1);
}

// Limpieza: eliminar la misión de prueba de Supabase
// (requiere SERVICE_ROLE_KEY — se omite aquí para no exponer credenciales en el script)
console.log(`\nℹ️   Misión de prueba creada con ID: ${mission.id}`);
console.log("    Puedes eliminarla manualmente en Supabase:");
console.log(`    DELETE FROM public.missions WHERE id = '${mission.id}';`);
console.log("    También elimina las entradas del ledger si la misión fue completada.");
