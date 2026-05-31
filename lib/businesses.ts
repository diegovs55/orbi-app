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
  status: BusinessStatus;
  rating: string | number;
};

type BusinessInsert = {
  name: string;
  category: BusinessCategory;
  description: string;
  status: BusinessStatus;
  rating: number | null;
};

export async function getBusinesses() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("businesses")
    .select("id,name,category,description,status,rating")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).filter(isActiveBusinessRow).filter(isNotLocallyDeleted).map(mapBusinessRow);
}

export async function createBusiness(business: CreateBusinessInput) {
  const client = getSupabaseClient();

  const parsedRating = (() => {
    if (business.rating == null) return null;
    const n = typeof business.rating === "number" ? business.rating : Number(business.rating as unknown as number);
    return Number.isFinite(n) ? n : null;
  })();

  const payload: BusinessInsert = {
    name: business.name,
    category: business.category,
    description: business.description,
    status: business.status,
    rating: parsedRating
  };

  const { data, error } = await client
    .from("businesses")
    .insert(payload)
    .select("id,name,category,description,status,rating")
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
      .update({ status: "No disponible" })
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
    estimatedTime: "",
    status: row.status,
    rating: String(row.rating)
  };
}

function isActiveBusinessRow(row: BusinessRow) {
  return row.status !== "No disponible";
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

function getSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return supabase;
}
