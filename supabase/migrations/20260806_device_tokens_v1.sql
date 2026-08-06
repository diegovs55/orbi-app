-- PUSH-01b: tabla de device tokens para notificaciones push FCM
-- No toca ninguna tabla existente.
-- Rollback: DROP TABLE IF EXISTS public.device_tokens;

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  uuid        NOT NULL,
  role          text        NOT NULL CHECK (role IN ('customer', 'agent', 'business')),
  platform      text        NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios', 'android')),
  token_type    text        NOT NULL DEFAULT 'fcm' CHECK (token_type IN ('fcm', 'apns')),
  token         text        NOT NULL,
  device_id     text,
  enabled       boolean     NOT NULL DEFAULT true,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token),
  UNIQUE (auth_user_id, device_id)
);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_tokens_select_own"
  ON public.device_tokens FOR SELECT
  USING (auth.uid() = auth_user_id);

CREATE POLICY "device_tokens_insert_own"
  ON public.device_tokens FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

CREATE POLICY "device_tokens_update_own"
  ON public.device_tokens FOR UPDATE
  USING (auth.uid() = auth_user_id);

CREATE POLICY "device_tokens_delete_own"
  ON public.device_tokens FOR DELETE
  USING (auth.uid() = auth_user_id);
