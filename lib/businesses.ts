import { supabase } from "@/lib/supabase";
import { assertAuthenticated } from "@/lib/auth";

export const businessCategories = [
  "Café y comida",
  "Farmacia",
  "Papelería",
  "Regalos",
  "Mandados"
] as const;

export type BusinessCategory = (typeof businessCategories)[number];

export type BusinessStatus = "activo" | "inactivo";

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
  status: string;
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

  return (data ?? []).filter(isActiveBusinessRow).map(mapBusinessRow);
}

export async function createBusiness(business: CreateBusinessInput) {
  await assertAuthenticated();
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

export async function setBusinessStatus(id: string, status: BusinessStatus): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from("businesses").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteBusiness(id: string) {
  await assertAuthenticated();
  const client = getSupabaseClient();

  const { error } = await client.from("businesses").delete().eq("id", id);

  if (error) {
    const softDelete = await client
      .from("businesses")
      .update({ status: "inactivo" })
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
    status: row.status === "activo" ? "activo" : "inactivo",
    rating: String(row.rating)
  };
}

function isActiveBusinessRow(row: BusinessRow) {
  return row.status === "activo";
}

function getSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return supabase;
}
