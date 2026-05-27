import { supabase } from "@/lib/supabase";

const DELETED_BUSINESSES_KEY = "orbi_deleted_business_ids";

export const businessCategories = [
  "Café y comida",
  "Farmacia",
  "Papelería",
  "Regalos",
  "Mandados"
] as const;

export type BusinessCategory = (typeof businessCategories)[number];

export type BusinessStatus = "Disponible" | "No disponible";

export type AffiliateBusiness = {
  id: string;
  name: string;
  category: BusinessCategory;
  description: string;
  estimatedTime: string;
  status: BusinessStatus;
  rating: string;
};

export type CreateBusinessInput = Omit<AffiliateBusiness, "id">;

type BusinessRow = {
  id: string;
  name: string;
  category: BusinessCategory;
  description: string;
  estimated_time: string;
  status: BusinessStatus;
  rating: string | number;
  is_active?: boolean | null;
  deleted_at?: string | null;
};

type BusinessInsert = {
  name: string;
  category: BusinessCategory;
  description: string;
  estimated_time: string;
  status: BusinessStatus;
  rating: string;
};

export async function getBusinesses() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("businesses")
    .select("id,name,category,description,estimated_time,status,rating,is_active,deleted_at")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (isMissingSoftDeleteColumnError(error)) {
      const fallback = await client
        .from("businesses")
        .select("id,name,category,description,estimated_time,status,rating")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (fallback.error) {
        throw new Error(fallback.error.message);
      }

      return (fallback.data ?? []).filter(isNotLocallyDeleted).map(mapBusinessRow);
    }

    throw new Error(error.message);
  }

  return (data ?? []).filter(isActiveBusinessRow).filter(isNotLocallyDeleted).map(mapBusinessRow);
}

export async function createBusiness(business: CreateBusinessInput) {
  const client = getSupabaseClient();

  const payload: BusinessInsert = {
    name: business.name,
    category: business.category,
    description: business.description,
    estimated_time: business.estimatedTime,
    status: business.status,
    rating: business.rating
  };

  const { data, error } = await client
    .from("businesses")
    .insert(payload)
    .select("id,name,category,description,estimated_time,status,rating")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapBusinessRow(data);
}

export async function deleteBusiness(id: string) {
  const client = getSupabaseClient();
  markBusinessDeletedLocally(id);

  const { error } = await client.from("businesses").delete().eq("id", id);

  if (error) {
    const softDelete = await client
      .from("businesses")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (softDelete.error) {
      throw new Error(error.message);
    }
  }
}

function mapBusinessRow(row: BusinessRow): AffiliateBusiness {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    estimatedTime: row.estimated_time,
    status: row.status,
    rating: String(row.rating)
  };
}

function isActiveBusinessRow(row: BusinessRow) {
  return row.deleted_at === null && row.is_active !== false;
}

function isNotLocallyDeleted(row: BusinessRow) {
  return !getLocallyDeletedBusinessIds().includes(row.id);
}

function markBusinessDeletedLocally(id: string) {
  if (typeof window === "undefined") {
    return;
  }

  const deletedIds = new Set(getLocallyDeletedBusinessIds());
  deletedIds.add(id);
  window.localStorage.setItem(DELETED_BUSINESSES_KEY, JSON.stringify(Array.from(deletedIds)));
}

function getLocallyDeletedBusinessIds() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = JSON.parse(window.localStorage.getItem(DELETED_BUSINESSES_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function isMissingSoftDeleteColumnError(error: { message?: string; code?: string } | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42703" ||
    /is_active|deleted_at|column|schema cache/i.test(error.message ?? "")
  );
}

function getSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return supabase;
}
