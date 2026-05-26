import { supabase } from "@/lib/supabase";

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
    .select("id,name,category,description,estimated_time,status,rating")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapBusinessRow);
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

  const { error } = await client.from("businesses").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
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

function getSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return supabase;
}
