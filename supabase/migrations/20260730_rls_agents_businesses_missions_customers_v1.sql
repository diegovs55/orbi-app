-- RC-01c: Enable RLS on agents, businesses, missions, customers
-- 2026-07-30  (idempotente: DROP POLICY IF EXISTS antes de cada CREATE POLICY)
--
-- ═══════════════════════════════════════════════════════════════
-- DEUDA TÉCNICA DOCUMENTADA — USING (true) para authenticated
-- ═══════════════════════════════════════════════════════════════
--
-- Varias políticas de esta migración usan USING (true) o WITH CHECK (true)
-- para el rol authenticated. Esto NO es un descuido de diseño — es una
-- consecuencia directa de la arquitectura actual del panel admin:
--
--   El panel admin (AdminControlPanel, AdminLiveOperations, AdminAgentsPanel,
--   AdminBusinesses, AdminCustomers, etc.) lee y escribe directamente en
--   Supabase usando el cliente anon (lib/supabase.ts) con una sesión de
--   Supabase Auth. No usa el cliente service_role.
--
-- Consecuencia: a nivel de RLS, la sesión de un administrador y la sesión
-- de un cliente ordinario son indistinguibles (ambas generan tokens authenticated).
-- No existe un rol DB que separe a los administradores del resto de usuarios.
--
-- Por tanto, cualquier política más restrictiva (por ejemplo,
-- missions_select: USING (user_id = auth.uid())) rompería el panel admin,
-- que necesita leer TODAS las misiones, agentes y clientes para sus dashboards.
--
-- IMPACTO ACEPTADO:
--   - Un cliente autenticado puede hacer SELECT de todas las misiones
--     (incluyendo las de otros clientes) mediante llamada directa a la API.
--   - Un cliente autenticado puede hacer SELECT de todos los agentes
--     (incluyendo suspendidos) y de todos los clientes.
--   - Un usuario autenticado puede hacer INSERT/UPDATE en agents y businesses
--     directamente vía API (sin pasar por la UI de ORBI).
--
-- SOLUCIÓN PENDIENTE (deuda técnica RC-01g o equivalente):
--   Migrar todas las lecturas y escrituras del panel admin a rutas API
--   protegidas con assertAdminJWT y service_role. Una vez hecho esto,
--   las políticas USING (true) pueden reemplazarse por políticas
--   por-propietario o por-rol sin romper ningún flujo.
--
-- Esta migración representa el mayor avance de seguridad posible dentro
-- del alcance de RC-01c sin refactorizar el panel admin:
--   - Cierra completamente el acceso anon a missions.
--   - Restringe el acceso anon a agents (solo activos) y businesses (solo activos).
--   - Elimina PII de los SELECT públicos (via lib/agents.ts y lib/businesses.ts).
-- ═══════════════════════════════════════════════════════════════

-- ─── AGENTS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents_select_anon" ON public.agents;
-- Mínimo privilegio real: anon solo ve agentes activos.
-- PII (email, phone, auth_user_id, current_lat/lng) excluida en SELECT_PUBLIC (lib/agents.ts).
-- Base coordinates (lat, lng) incluidas — se muestran públicamente en AgentCards.
CREATE POLICY "agents_select_anon"
  ON public.agents FOR SELECT TO anon
  USING (admin_status = 'activo');

DROP POLICY IF EXISTS "agents_select_authenticated" ON public.agents;
-- DEUDA TÉCNICA: USING (true) necesario porque el panel admin lee agentes
-- suspendidos/pendientes con el cliente anon. Sin rol DB admin no es posible
-- restringir a (admin_status = 'activo' OR auth_user_id = auth.uid())
-- sin cegar la gestión de agentes del panel admin.
CREATE POLICY "agents_select_authenticated"
  ON public.agents FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "agents_insert_authenticated" ON public.agents;
-- DEUDA TÉCNICA: WITH CHECK (true) necesario porque createAgent() (admin panel)
-- usa el cliente anon. La solución correcta es mover createAgent() a una API
-- route con assertAdminJWT + service_role.
CREATE POLICY "agents_insert_authenticated"
  ON public.agents FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "agents_update_authenticated" ON public.agents;
-- DEUDA TÉCNICA: USING (true) necesario porque updateAgent(), setAgentTrustLevel()
-- y setAgentActiveStatus() (admin panel) y updateAgentOrbit() (agente)
-- usan el cliente anon. La política más específica USING (auth_user_id = auth.uid())
-- solo cubriría updateAgentOrbit() y rompería las funciones admin.
CREATE POLICY "agents_update_authenticated"
  ON public.agents FOR UPDATE TO authenticated
  USING (true);

-- DELETE va a través de /api/agents/delete (service_role + assertAdminJWT).
-- No se necesita política anon/authenticated para DELETE.

-- ─── BUSINESSES ───────────────────────────────────────────────────────────────

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "businesses_select_anon" ON public.businesses;
-- Mínimo privilegio real: anon solo ve negocios activos.
-- email y auth_user_id excluidos en getBusinesses() (lib/businesses.ts).
CREATE POLICY "businesses_select_anon"
  ON public.businesses FOR SELECT TO anon
  USING (status = 'activo');

DROP POLICY IF EXISTS "businesses_select_authenticated" ON public.businesses;
-- DEUDA TÉCNICA: USING (true) necesario porque el panel admin lee negocios
-- inactivos/pendientes con el cliente anon. Sin rol DB admin no es posible
-- restringir a (status = 'activo' OR auth_user_id = auth.uid()) sin romper
-- la gestión de negocios del panel admin.
CREATE POLICY "businesses_select_authenticated"
  ON public.businesses FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "businesses_insert_authenticated" ON public.businesses;
-- DEUDA TÉCNICA: WITH CHECK (true) — misma causa que agents_insert.
-- createBusiness() usa cliente anon; solución: mover a API route con assertAdminJWT.
CREATE POLICY "businesses_insert_authenticated"
  ON public.businesses FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "businesses_update_authenticated" ON public.businesses;
-- DEUDA TÉCNICA: USING (true) — setBusinessStatus() y updateBusinessProfile()
-- usan cliente anon. La política más específica USING (auth_user_id = auth.uid())
-- rompería las actualizaciones admin sobre negocios ajenos.
CREATE POLICY "businesses_update_authenticated"
  ON public.businesses FOR UPDATE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "businesses_delete_authenticated" ON public.businesses;
-- DEUDA TÉCNICA: USING (true) — deleteBusiness() usa cliente anon con
-- assertAuthenticated() pero sin verificación de ownership en RLS.
-- Solución: mover a API route con assertAdminJWT.
CREATE POLICY "businesses_delete_authenticated"
  ON public.businesses FOR DELETE TO authenticated
  USING (true);

-- ─── MISSIONS ─────────────────────────────────────────────────────────────────

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

-- Sin política anon: cierra la exposición pública completa de missions.
-- Mayor ganancia de RC-01c. El Realtime anon deja de recibir eventos de missions.
-- Después de que el cliente se autentica, el cliente JS actualiza el JWT
-- en el websocket y los eventos fluyen bajo la política authenticated.

DROP POLICY IF EXISTS "missions_select_authenticated" ON public.missions;
-- DEUDA TÉCNICA: USING (true) necesario porque el panel admin (loadActiveMissions,
-- fetchMissionsForRankings, fetchMissionsForDistribution, fetchMissionsForEconomy)
-- necesita todas las misiones con el cliente anon.
-- Impacto aceptado: un cliente autenticado puede hacer SELECT de misiones ajenas
-- mediante llamada directa a la API de Supabase.
-- Solución: migrar lecturas admin a API routes con assertAdminJWT + service_role.
CREATE POLICY "missions_select_authenticated"
  ON public.missions FOR SELECT TO authenticated
  USING (true);

-- Todas las escrituras de missions van a través de /api/missions/* (service_role).
-- No se necesitan políticas INSERT/UPDATE/DELETE para anon/authenticated.

-- ─── CUSTOMERS ────────────────────────────────────────────────────────────────

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_anon" ON public.customers;
-- USING (true) para anon es funcionalmente necesario (no es deuda técnica):
-- El flujo de registro y login ejecuta tres consultas antes de tener sesión:
--   1. Verificación de unicidad de email antes de signUp (lib/customers.ts:58)
--   2. Lookup phone → email para login (lib/customers.ts:122)
--   3. Verificación is_registered (lib/customers.ts:332)
-- Restringir filas para anon rompería el registro y el login.
-- Impacto aceptado y documentado: la anon key (pública en el bundle JS)
-- permite enumerar clientes. Mitigación futura: mover estos lookups a
-- API routes que expongan solo los campos necesarios.
CREATE POLICY "customers_select_anon"
  ON public.customers FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "customers_select_authenticated" ON public.customers;
-- DEUDA TÉCNICA: USING (true) necesario porque el panel admin (getCustomers,
-- fetchCustomersPage) necesita todos los clientes con el cliente anon.
-- Impacto aceptado: un cliente autenticado puede leer registros de otros clientes.
-- Solución: migrar lecturas admin a API routes con assertAdminJWT + service_role.
CREATE POLICY "customers_select_authenticated"
  ON public.customers FOR SELECT TO authenticated
  USING (true);

-- Todas las escrituras de customers van a través de /api/customers/upsert (service_role).
-- No se necesitan políticas INSERT/UPDATE/DELETE para anon/authenticated.
