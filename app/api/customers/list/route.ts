import { NextRequest, NextResponse } from "next/server";
import { getAdmin, assertAdminJWT } from "@/lib/supabase-admin";


export async function GET(req: NextRequest) {
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);

  // Stats-only mode: ?stats=1
  if (searchParams.get("stats") === "1") {
    const { data, error } = await admin
      .from("customers")
      .select("is_registered,total_orders,total_spent");
    if (error || !data) {
      console.error("[api/customers/list] stats error:", error?.message);
      return NextResponse.json({ total: 0, registered: 0, totalOrders: 0, totalSpent: 0 });
    }
    const rows = data as { is_registered: boolean | null; total_orders: unknown; total_spent: unknown }[];
    return NextResponse.json({
      total:       rows.length,
      registered:  rows.filter((r) => r.is_registered).length,
      totalOrders: rows.reduce((s, r) => s + Number(r.total_orders ?? 0), 0),
      totalSpent:  rows.reduce((s, r) => s + Number(r.total_spent  ?? 0), 0),
    });
  }

  // Paginated list
  const page     = Math.max(0, Number(searchParams.get("page") ?? 0));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 25)));
  const search     = searchParams.get("search")?.trim() ?? "";
  const registered = searchParams.get("registered");        // "true" | "false" | null
  const status     = searchParams.get("status") ?? "";      // "activo" | "inactivo" | ""

  let query = admin
    .from("customers")
    .select(
      "id,name,phone,email,is_registered,auth_user_id,created_at,updated_at,last_order_at,total_orders,total_spent,status",
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (search)                 query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  if (registered === "true")  query = query.eq("is_registered", true);
  if (registered === "false") query = query.eq("is_registered", false);
  if (status && status !== "todos") query = query.eq("status", status);

  const { data, error, count } = await query;

  if (error) {
    console.error("[api/customers/list] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    customers: data ?? [],
    total:     count ?? 0,
    hasMore:   (page + 1) * pageSize < (count ?? 0),
  });
}
