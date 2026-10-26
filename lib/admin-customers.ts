import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/authz";
import { isValidUuid } from "@/lib/audit-utils";
import { escapeLikePattern } from "@/lib/search-utils";
import type {
  AccountStatus,
  CustomerFilterParams,
  CustomerQueryResult,
  CustomerSummary,
} from "@/types";

// ---------------------------------------------------------------------------
// Solenne Admin Customer data-access layer (Phase 2, Module B1).
//
// Reads public.profiles strictly using the USER-SCOPED Supabase client
// (never createAdminClient or service-role key) under RLS.
//
// Remediation notes:
//   - F-01: Replaces unbounded order row retrieval with database aggregation RPC
//           public.get_customer_purchase_metrics(p_user_ids).
//   - F-02: Fails closed on customer role resolution; strictly filters role_id
//           to customerRoleId to isolate storefront patrons from staff/admins.
//   - F-03 & F-06: Evaluates order.read; if absent, metrics RPC is never called,
//           and metrics are returned as null (never fabricated 0).
//   - F-04: Removed default shipping address query and exposure (data minimization).
//   - F-05: Enforces MAX_SEARCH_LENGTH (80) and strips PostgREST filter delimiters,
//           operator tokens and quotes; LIKE wildcards are escaped so they match
//           literally.
// ---------------------------------------------------------------------------

let cachedCustomerRoleId: string | null = null;
const MAX_SEARCH_LENGTH = 80;

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role_id: string;
  status: string;
  created_at: string;
  updated_at: string | null;
}

interface PurchaseMetricsRpcRow {
  user_id: string;
  order_count: number | string;
  lifetime_spend: number | string;
}

export interface AdminCustomerDetail {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string | null;
  orderCount: number | null;
  lifetimeSpend: number | null;
}

/**
 * Resolves the customer role ID. Uses the scoped public.customer_role_id()
 * RPC (or direct/RPC fallbacks) and caches in memory.
 * Fails closed by returning null if not found.
 */
async function resolveCustomerRoleId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  if (cachedCustomerRoleId) return cachedCustomerRoleId;

  // 1. Try public.customer_role_id() RPC (defined in 0010)
  try {
    const { data: rpcRoleId, error: rpcError } = await supabase.rpc("customer_role_id");
    if (rpcError) {
      console.warn(
        "resolveCustomerRoleId: customer_role_id RPC error:",
        rpcError.code,
        rpcError.message
      );
    } else if (rpcRoleId && typeof rpcRoleId === "string" && isValidUuid(rpcRoleId)) {
      cachedCustomerRoleId = rpcRoleId;
      return cachedCustomerRoleId;
    }
  } catch (err) {
    console.warn(
      "resolveCustomerRoleId: customer_role_id RPC exception:",
      err instanceof Error ? err.message : err
    );
  }

  // 2. Direct query against public.roles (accessible to manager & admin under RLS)
  try {
    const { data: roleRow, error: roleError } = await supabase
      .from("roles")
      .select("id")
      .eq("name", "customer")
      .maybeSingle();

    if (roleError) {
      console.warn(
        "resolveCustomerRoleId: roles table select error:",
        roleError.code,
        roleError.message
      );
    } else if (roleRow?.id && isValidUuid(roleRow.id)) {
      cachedCustomerRoleId = roleRow.id;
      return cachedCustomerRoleId;
    }
  } catch (err) {
    console.warn(
      "resolveCustomerRoleId: roles table query exception:",
      err instanceof Error ? err.message : err
    );
  }

  // 3. Fallback to existing public.role_id_by_name if available
  try {
    const { data: rpcData, error: nameError } = await supabase.rpc("role_id_by_name", {
      p_name: "customer",
    });
    if (nameError) {
      console.warn(
        "resolveCustomerRoleId: role_id_by_name RPC error:",
        nameError.code,
        nameError.message
      );
    } else if (rpcData && typeof rpcData === "string" && isValidUuid(rpcData)) {
      cachedCustomerRoleId = rpcData;
      return cachedCustomerRoleId;
    }
  } catch (err) {
    console.warn(
      "resolveCustomerRoleId: role_id_by_name RPC exception:",
      err instanceof Error ? err.message : err
    );
  }

  console.error("resolveCustomerRoleId: Failed to resolve customer role ID across all mechanisms");
  return null;
}

/**
 * Sanitizes untrusted search inputs to prevent PostgREST syntax injection
 * and grammar breakage in composite `.or()` filter clauses.
 * Enforces the length bound and strips filter delimiters, operator chars and
 * quotes. SQL wildcards are kept here and escaped by `escapeLikePattern` when
 * the ILIKE pattern is built, so they match literally.
 */
function sanitizeSearchQuery(query: string): string {
  const bounded = query.slice(0, MAX_SEARCH_LENGTH);
  return bounded.replace(/[,().*:"']/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Primary server-side query for the customer directory.
 * Returns paginated customer summaries with bounded metrics aggregation.
 */
export async function getAdminCustomers(
  params: CustomerFilterParams = {}
): Promise<CustomerQueryResult> {
  // 1. Server-side authorization check
  const actor = await requirePermission("customer.read");
  const canReadOrders = actor.permissions.includes("order.read");

  // 2. User-scoped Supabase client under RLS
  const supabase = await createClient();

  // 3. Parameter validation & bounds
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(params.limit) || 25)));
  const offset = (page - 1) * limit;

  // 4. Resolve the customer role ID dynamically — FAIL CLOSED if unavailable
  const customerRoleId = await resolveCustomerRoleId(supabase);
  if (!customerRoleId) {
    console.error("getAdminCustomers: Failed to resolve customer role ID (fail-closed)");
    throw new Error("Failed to load customer records: customer role unavailable");
  }

  // 5. Build query against public.profiles (strictly filtered to customer role)
  let query = supabase
    .from("profiles")
    .select(
      "id, full_name, phone, avatar_url, role_id, status, created_at, updated_at",
      { count: "exact" }
    )
    .eq("role_id", customerRoleId);

  // Filter: Account Status
  if (params.status && typeof params.status === "string" && params.status !== "all") {
    const trimmedStatus = params.status.trim().toLowerCase();
    if (["active", "suspended", "banned", "pending"].includes(trimmedStatus)) {
      query = query.eq("status", trimmedStatus);
    }
  }

  // Filter: Search across verified profile fields
  if (params.search && typeof params.search === "string") {
    const rawSearch = params.search.trim();
    if (rawSearch.length > 0) {
      if (isValidUuid(rawSearch)) {
        // Direct exact match by UUID
        query = query.eq("id", rawSearch);
      } else {
        const cleanSearch = sanitizeSearchQuery(rawSearch);
        if (cleanSearch.length > 0) {
          const pattern = `%${escapeLikePattern(cleanSearch)}%`;
          query = query.or(
            `full_name.ilike.${pattern},phone.ilike.${pattern}`
          );
        }
      }
    }
  }

  // Deterministic ordering: Newest registrations first, secondary by ID
  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  // Bounded pagination fetching limit + 1 items to determine hasMore
  query = query.range(offset, offset + limit);

  const { data, count, error } = await query;

  if (error) {
    console.error("getAdminCustomers: Failed to query profiles:", error.message);
    throw new Error("Failed to load customer records");
  }

  const rows = (data ?? []) as unknown as ProfileRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // 6. Safe & bounded purchase metrics aggregation
  // Restrict to customer IDs on the active page and ONLY query if actor holds order.read
  const pageCustomerIds = pageRows.map((r) => r.id);
  const metricsMap = new Map<string, { orderCount: number; lifetimeSpend: number }>();

  if (canReadOrders && pageCustomerIds.length > 0) {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_customer_purchase_metrics",
        { p_user_ids: pageCustomerIds }
      );

      if (!rpcError && rpcData) {
        for (const row of rpcData as unknown as PurchaseMetricsRpcRow[]) {
          metricsMap.set(row.user_id, {
            orderCount: Number(row.order_count) || 0,
            lifetimeSpend: Number(row.lifetime_spend) || 0,
          });
        }
      } else if (rpcError) {
        console.warn(
          "getAdminCustomers: Metrics RPC warning:",
          rpcError.message
        );
      }
    } catch (metricError) {
      console.warn(
        "getAdminCustomers: Metrics RPC call failed:",
        metricError instanceof Error ? metricError.message : metricError
      );
    }
  }

  // 7. Map customer summaries (metrics are null if order.read is missing or RPC unavailable)
  const customers: CustomerSummary[] = pageRows.map((row) => {
    const metrics = canReadOrders ? metricsMap.get(row.id) : null;
    return {
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      avatarUrl: row.avatar_url,
      status: row.status as AccountStatus,
      roleName: "customer",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      orderCount: metrics ? metrics.orderCount : null,
      lifetimeSpend: metrics ? metrics.lifetimeSpend : null,
    };
  });

  const totalCount = count ?? (hasMore ? offset + limit + 1 : offset + customers.length);

  return {
    customers,
    totalCount,
    page,
    limit,
    hasMore,
  };
}

export interface CustomerCountParams {
  /** Restrict the count to one or more account statuses. Omit for all. */
  status?: AccountStatus | AccountStatus[];
}

/**
 * Exact count of storefront customers (profiles joined to the customer role).
 *
 * Same role isolation and fail-closed role resolution as getAdminCustomers,
 * but without the per-row purchase-metrics aggregation — the management
 * overview needs a number, not a page of records, so it asks the database for
 * an exact COUNT instead of fetching rows and measuring them.
 *
 * Enforces requirePermission("customer.read"); RLS applies the same rule.
 */
export async function countAdminCustomers(
  params: CustomerCountParams = {}
): Promise<number> {
  await requirePermission("customer.read");

  const supabase = await createClient();

  const customerRoleId = await resolveCustomerRoleId(supabase);
  if (!customerRoleId) {
    console.error("countAdminCustomers: Failed to resolve customer role ID (fail-closed)");
    throw new Error("Failed to count customers: customer role unavailable");
  }

  let query = supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", customerRoleId);

  const statuses = Array.isArray(params.status)
    ? params.status
    : params.status
      ? [params.status]
      : [];

  if (statuses.length > 0) {
    query = query.in("status", statuses);
  }

  const { count, error } = await query;

  if (error) {
    console.error("countAdminCustomers: Failed to count profiles:", error.message);
    throw new Error("Failed to count customers");
  }

  return count ?? 0;
}

/**
 * Retrieves a single customer's profile and purchase metrics for detail view.
 * Fails closed if the ID does not belong to a customer role.
 */
export async function getAdminCustomerById(
  customerId: string
): Promise<AdminCustomerDetail | null> {
  const actor = await requirePermission("customer.read");
  const canReadOrders = actor.permissions.includes("order.read");

  if (!isValidUuid(customerId)) {
    return null;
  }

  const supabase = await createClient();

  // 1. Resolve customer role ID — FAIL CLOSED
  const customerRoleId = await resolveCustomerRoleId(supabase);
  if (!customerRoleId) {
    console.error("getAdminCustomerById: Failed to resolve customer role ID (fail-closed)");
    throw new Error("Failed to load customer profile: customer role unavailable");
  }

  // 2. Fetch customer profile strictly filtered by customer role
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, phone, avatar_url, role_id, status, created_at, updated_at")
    .eq("id", customerId)
    .eq("role_id", customerRoleId)
    .maybeSingle();

  // Case A — Supabase query error: log sanitized diagnostics and throw controlled error
  if (profileError) {
    console.error(
      "getAdminCustomerById: Failed to query customer profile:",
      profileError.code,
      profileError.message,
      profileError.details || ""
    );
    throw new Error("Failed to load customer profile");
  }

  // Case B — Successful query, no matching row: legitimate 404
  if (!profileData) {
    return null;
  }

  // Case C — Successful query, matching row: proceed with profile mapping
  const profile = profileData as unknown as ProfileRow;

  // 3. Retrieve single customer email via Auth Admin API after customer.read check
  let email: string | null = null;
  try {
    const admin = createAdminClient();
    const { data: authUser, error: authError } =
      await admin.auth.admin.getUserById(customerId);
    if (!authError && authUser?.user?.email) {
      email = authUser.user.email;
    } else if (authError) {
      console.warn(
        "getAdminCustomerById: Auth user lookup warning:",
        authError.message
      );
    }
  } catch (authErr) {
    console.warn(
      "getAdminCustomerById: Auth user lookup exception:",
      authErr instanceof Error ? authErr.message : authErr
    );
  }

  // 4. Compute customer metrics via bounded database aggregation RPC if actor has order.read
  let orderCount: number | null = null;
  let lifetimeSpend: number | null = null;

  if (canReadOrders) {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_customer_purchase_metrics",
        { p_user_ids: [customerId] }
      );

      if (!rpcError && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
        const row = rpcData[0] as unknown as PurchaseMetricsRpcRow;
        orderCount = Number(row.order_count) || 0;
        lifetimeSpend = Number(row.lifetime_spend) || 0;
      } else if (rpcError) {
        console.warn(
          "getAdminCustomerById: Metrics RPC warning:",
          rpcError.code,
          rpcError.message
        );
      }
    } catch (metricError) {
      console.warn(
        "getAdminCustomerById: Metrics RPC error:",
        metricError instanceof Error ? metricError.message : metricError
      );
    }
  }

  return {
    id: profile.id,
    fullName: profile.full_name,
    email,
    phone: profile.phone,
    avatarUrl: profile.avatar_url,
    status: profile.status as AccountStatus,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
    orderCount,
    lifetimeSpend,
  };
}

/**
 * Mutates a customer's account status using the atomic database RPC.
 * Invoked on the user-scoped client under staff.manage authorization.
 */
export async function manageCustomerStatus(
  customerId: string,
  targetStatus: AccountStatus,
  reason: string
): Promise<{
  success: boolean;
  customerId: string;
  oldStatus: AccountStatus;
  newStatus: AccountStatus;
}> {
  await requirePermission("staff.manage");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("manage_customer_status", {
    p_customer_id: customerId,
    p_target_status: targetStatus,
    p_reason: reason.trim(),
  });

  if (error) {
    throw error;
  }

  const result = data as {
    success: boolean;
    customer_id: string;
    old_status: AccountStatus;
    new_status: AccountStatus;
  };

  return {
    success: result.success,
    customerId: result.customer_id,
    oldStatus: result.old_status,
    newStatus: result.new_status,
  };
}

/**
 * Reinstates a banned customer's account using the dedicated atomic database RPC.
 * Invoked on the user-scoped client under staff.manage authorization.
 */
export async function reinstateCustomer(
  customerId: string,
  reason: string
): Promise<{
  success: boolean;
  customerId: string;
  oldStatus: AccountStatus;
  newStatus: AccountStatus;
}> {
  await requirePermission("staff.manage");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reinstate_banned_customer", {
    p_customer_id: customerId,
    p_reason: reason.trim(),
  });

  if (error) {
    throw error;
  }

  const result = data as {
    success: boolean;
    customer_id: string;
    old_status: AccountStatus;
    new_status: AccountStatus;
  };

  return {
    success: result.success,
    customerId: result.customer_id,
    oldStatus: result.old_status,
    newStatus: result.new_status,
  };
}
