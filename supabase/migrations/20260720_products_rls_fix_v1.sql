-- =============================================================================
-- Migración: Corregir RLS de public.products — eliminar policies peligrosas
-- Fecha:     2026-07-20
-- Alcance:   Solo elimina 3 policies inseguras. No crea policies nuevas.
--            products_update_own_business y products_insert_own_business ya
--            existen, son correctas y quedan intactas.
--
-- Policies eliminadas:
--   "Authenticated update products"         — UPDATE USING (auth.uid() IS NOT NULL)
--     Permite a cualquier usuario autenticado modificar cualquier producto.
--     Anula products_update_own_business por combinación OR de policies.
--
--   "Authenticated delete products"         — DELETE USING (auth.uid() IS NOT NULL)
--     Permite a cualquier usuario autenticado borrar físicamente cualquier
--     producto. El MVP no expone ningún flujo de DELETE desde clientes.
--
--   "Allow insert products for anon temporarily" — INSERT WITH CHECK (true)
--     Permitía INSERT anónimo. La FK products_business_id_fkey lo limitaba
--     accidentalmente, no por diseño. products_insert_own_business cubre
--     el caso legítimo (negocio propietario autenticado).
--
-- Policies conservadas (sin modificación):
--   products_update_own_business   — UPDATE al negocio propietario
--   products_insert_own_business   — INSERT al negocio propietario
--   "Public read products"         — SELECT público
--   "products_select_anon"         — SELECT anon
--   "products_select_authenticated"— SELECT authenticated
--
-- Rollback:
--   Ver sección al final de este archivo.
--
-- Verificación post-ejecución:
--   SELECT policyname, cmd, roles::text
--   FROM pg_policies WHERE tablename = 'products'
--   ORDER BY cmd, policyname;
--   -- Resultado esperado: exactamente 5 filas.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "Authenticated update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated delete products" ON public.products;
DROP POLICY IF EXISTS "Allow insert products for anon temporarily" ON public.products;

COMMIT;

-- =============================================================================
-- ROLLBACK (ejecutar solo para revertir):
-- BEGIN;
-- CREATE POLICY "Authenticated update products"
--   ON public.products FOR UPDATE TO public
--   USING (auth.uid() IS NOT NULL)
--   WITH CHECK (auth.uid() IS NOT NULL);
-- CREATE POLICY "Authenticated delete products"
--   ON public.products FOR DELETE TO public
--   USING (auth.uid() IS NOT NULL);
-- CREATE POLICY "Allow insert products for anon temporarily"
--   ON public.products FOR INSERT TO public
--   WITH CHECK (true);
-- COMMIT;
-- =============================================================================
