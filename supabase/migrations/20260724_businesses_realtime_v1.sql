-- Habilitar Realtime para la tabla businesses.
-- La condición impide error si la tabla ya pertenece a la publicación (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'businesses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.businesses;
  END IF;
END
$$;
