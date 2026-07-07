/**
 * scripts/test-p1-complete-mission-e2e.mjs
 *
 * E2E para P1-1: verifica que completeMissionWithLedger envía Authorization
 * Bearer correctamente y que el endpoint /api/missions/complete:
 *   1. Rechaza llamadas sin token (401)
 *   2. Acepta llamadas con token de agente válido
 *   3. Escribe las entradas del ledger con SUM(monto) = 0
 *
 * Requiere: dev server corriendo en localhost:3000
 *
 * Setup: crea un agente de prueba con Supabase Auth, crea una misión en
 * estado "en_mision", llama al endpoint, verifica ledger.
 * Cleanup: elimina la misión y el agente de prueba.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");

function parseEnv(content) {
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    vars[key] = val;
  }
  return vars;
}

const env = parseEnv(envContent);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = "http://localhost:3000";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_AGENT_EMAIL = `test-p1-agent-${Date.now()}@orbi-test.internal`;
const TEST_AGENT_PASSWORD = "TestP1Password!2026";

let testAgentAuthId = null;
let testAgentRowId = null;
let testMissionId = null;
let agentAccessToken = null;

const pass = (msg) => console.log(`  ✅ PASS — ${msg}`);
const fail = (msg) => { console.error(`  ❌ FAIL — ${msg}`); process.exitCode = 1; };

async function setup() {
  console.log("\n─── SETUP ───────────────────────────────────────────");

  // 1. Crear usuario Auth para el agente de prueba
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: TEST_AGENT_EMAIL,
    password: TEST_AGENT_PASSWORD,
    email_confirm: true,
  });
  if (authErr || !authData.user) throw new Error(`Auth createUser: ${authErr?.message}`);
  testAgentAuthId = authData.user.id;
  console.log(`  Agente Auth creado: ${testAgentAuthId}`);

  // 2. Insertar row en public.agents vinculado al auth user
  const { data: agentRow, error: agentErr } = await admin
    .from("agents")
    .insert({
      name: "Agente Test P1",
      email: TEST_AGENT_EMAIL,
      auth_user_id: testAgentAuthId,
      status: "Disponible",
      service_type: "Todos los servicios",
      trust_level: "Verificado",
      lat: 18.8566,
      lng: -99.5674,
    })
    .select("id")
    .single();
  if (agentErr || !agentRow) throw new Error(`Insert agent: ${agentErr?.message}`);
  testAgentRowId = agentRow.id;
  console.log(`  Agente row creado: ${testAgentRowId}`);

  // 3. Crear misión de prueba en estado "en_mision"
  const { data: missionRow, error: missionErr } = await admin
    .from("missions")
    .insert({
      status: "en_mision",
      service_type: "Traslado",
      detail: "Test E2E P1-1",
      requester_name: "Test User",
      requester_phone: "5500000000",
      selected_agent_id: testAgentRowId,
      selected_agent_name: "Agente Test P1",
      origin_text: "Origen test",
      destination_text: "Destino test",
      origin_lat: 18.85,
      origin_lng: -99.56,
      destination_lat: 18.86,
      destination_lng: -99.57,
      total_amount: 100,
      service_fee: 100,
      costo_agente: 70,
      ganancia_orbi: 30,
      distance_km: 2.5,
      payment_method: "efectivo",
      payment_status: "pendiente",
      pricing_rule: "v2_distance_base",
      mission_type: "directa",
    })
    .select("id")
    .single();
  if (missionErr || !missionRow) throw new Error(`Insert mission: ${missionErr?.message}`);
  testMissionId = missionRow.id;
  console.log(`  Misión de prueba creada: ${testMissionId}`);

  // 4. Obtener token de acceso del agente (simula login del agente)
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
    email: TEST_AGENT_EMAIL,
    password: TEST_AGENT_PASSWORD,
  });
  if (loginErr || !loginData.session) throw new Error(`Agent login: ${loginErr?.message}`);
  agentAccessToken = loginData.session.access_token;
  console.log(`  Token del agente obtenido (${agentAccessToken.slice(0, 20)}...)`);
}

async function runTests() {
  console.log("\n─── TEST 1: Sin token → debe retornar 401 ──────────");
  const res401 = await fetch(`${BASE_URL}/api/missions/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mission_id: testMissionId, agent_id: testAgentRowId }),
  });
  if (res401.status === 401) {
    pass("Endpoint rechaza request sin Authorization header (401)");
  } else {
    fail(`Esperaba 401, recibió ${res401.status}`);
  }

  console.log("\n─── TEST 2: Con token válido → debe retornar 200 ───");
  const res200 = await fetch(`${BASE_URL}/api/missions/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${agentAccessToken}`,
    },
    body: JSON.stringify({ mission_id: testMissionId, agent_id: testAgentRowId }),
  });
  const body200 = await res200.json().catch(() => ({}));

  if (res200.ok) {
    pass(`Endpoint acepta request con token válido (${res200.status})`);
  } else {
    fail(`Esperaba 2xx, recibió ${res200.status}: ${JSON.stringify(body200)}`);
    return; // sin ledger que verificar
  }

  // Verificar que la misión cambió a "cumplida"
  const { data: missionAfter } = await admin
    .from("missions")
    .select("status")
    .eq("id", testMissionId)
    .single();
  if (missionAfter?.status === "cumplida") {
    pass("Misión cambió a status='cumplida'");
  } else {
    fail(`Misión tiene status='${missionAfter?.status}', esperaba 'cumplida'`);
  }

  console.log("\n─── TEST 3: Ledger escrito con SUM = 0 ─────────────");
  const { data: ledgerRows, error: ledgerErr } = await admin
    .from("ledger_entries")
    .select("monto")
    .eq("mission_id", testMissionId);

  if (ledgerErr || !ledgerRows) {
    fail(`Error leyendo ledger: ${ledgerErr?.message}`);
    return;
  }

  if (ledgerRows.length === 0) {
    fail("No se encontraron entradas en el ledger");
    return;
  }

  const sum = ledgerRows.reduce((acc, row) => acc + Number(row.monto), 0);
  const sumFixed = Math.round(sum * 100) / 100;

  pass(`Ledger tiene ${ledgerRows.length} entradas`);

  if (sumFixed === 0) {
    pass(`SUM(monto) = 0 ✓ (invariante contable cumplida)`);
  } else {
    fail(`SUM(monto) = ${sumFixed}, esperaba 0`);
  }

  console.log("\n─── TEST 4: Idempotencia — segunda llamada segura ──");
  const res2 = await fetch(`${BASE_URL}/api/missions/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${agentAccessToken}`,
    },
    body: JSON.stringify({ mission_id: testMissionId, agent_id: testAgentRowId }),
  });
  if (res2.ok) {
    pass("Segunda llamada idempotente — no duplica el ledger");
    const { data: ledgerAfter } = await admin
      .from("ledger_entries")
      .select("id")
      .eq("mission_id", testMissionId);
    if (ledgerAfter?.length === ledgerRows.length) {
      pass(`Ledger sigue con ${ledgerRows.length} entradas (sin duplicados)`);
    } else {
      fail(`Ledger tiene ${ledgerAfter?.length} entradas después del retry (esperaba ${ledgerRows.length})`);
    }
  } else {
    fail(`Segunda llamada retornó ${res2.status}`);
  }
}

async function cleanup() {
  console.log("\n─── CLEANUP ─────────────────────────────────────────");
  if (testMissionId) {
    await admin.from("ledger_entries").delete().eq("mission_id", testMissionId);
    await admin.from("missions").delete().eq("id", testMissionId);
    console.log(`  Misión y ledger eliminados: ${testMissionId}`);
  }
  if (testAgentRowId) {
    await admin.from("agents").delete().eq("id", testAgentRowId);
    console.log(`  Agente row eliminado: ${testAgentRowId}`);
  }
  if (testAgentAuthId) {
    await admin.auth.admin.deleteUser(testAgentAuthId);
    console.log(`  Auth user eliminado: ${testAgentAuthId}`);
  }
}

(async () => {
  console.log("═══════════════════════════════════════════════════");
  console.log("  P1-1 E2E — completeMissionWithLedger + JWT Auth");
  console.log("═══════════════════════════════════════════════════");

  try {
    await setup();
    await runTests();
  } catch (err) {
    console.error("\n  SETUP/TEST ERROR:", err.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }

  const status = process.exitCode === 1 ? "FAIL" : "PASS";
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  RESULTADO FINAL: ${status}`);
  console.log(`═══════════════════════════════════════════════════\n`);
})();
