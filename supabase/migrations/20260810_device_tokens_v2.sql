-- PUSH-03: corrige la identidad canónica de device_tokens.
--
-- Semántica anterior (incorrecta):
--   UNIQUE(token)                    → token como identidad de fila
--   UNIQUE(auth_user_id, device_id)  → instalación ligada al usuario
--
-- Semántica nueva (correcta):
--   UNIQUE(device_id)                → device_id identifica la instalación
--   auth_user_id, role, token        → atributos mutables de la instalación
--
-- Efectos:
--   - Un mismo device_id puede cambiar de auth_user_id y role (cambio de sesión).
--   - El token FCM puede rotar sin crear una nueva fila.
--   - Las filas legacy con device_id = NULL coexisten sin conflicto
--     (PostgreSQL permite múltiples NULL en columnas UNIQUE por estándar SQL).
--
-- No toca: RLS, datos existentes, otras tablas, otros schemas.
-- No hace UPDATE ni DELETE de filas.
--
-- Rollback conceptual:
--   ALTER TABLE public.device_tokens DROP CONSTRAINT device_tokens_device_id_key;
--   ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_auth_user_id_device_id_key UNIQUE (auth_user_id, device_id);
--   ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_token_key UNIQUE (token);

BEGIN;

ALTER TABLE public.device_tokens
  DROP CONSTRAINT device_tokens_token_key;

ALTER TABLE public.device_tokens
  DROP CONSTRAINT device_tokens_auth_user_id_device_id_key;

ALTER TABLE public.device_tokens
  ADD CONSTRAINT device_tokens_device_id_key UNIQUE (device_id);

COMMIT;
