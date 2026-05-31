import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)

export function subscribeToTableChanges(
  table: string,
  callback: () => void,
  options?: { schema?: string }
) {
  const schema = options?.schema ?? "public";
  const channelName = `realtime-${table}-${Math.random().toString(36).slice(2)}`;
  const channel = supabase.channel(channelName);
  const postgresEvents = ["INSERT", "UPDATE", "DELETE"] as const;

  postgresEvents.forEach((event) => {
    channel.on("postgres_changes", { event, schema, table }, () => {
      try {
        callback();
      } catch {
        // Ignore callback failures to keep realtime subscription stable.
      }
    });
  });

  void channel.subscribe();

  return () => {
    void channel.unsubscribe();
  };
}

export function subscribeToAgents(callback: () => void) {
  return subscribeToTableChanges("agents", callback);
}

export function subscribeToBusinesses(callback: () => void) {
  return subscribeToTableChanges("businesses", callback);
}

export function subscribeToProducts(callback: () => void) {
  return subscribeToTableChanges("products", callback);
}

export function subscribeToCustomers(callback: () => void) {
  return subscribeToTableChanges("customers", callback);
}

export function subscribeToMissions(callback: () => void) {
  return subscribeToTableChanges("missions", callback);
}
