import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_CATEGORIES,
  AUDIT_RESOURCE_TYPES,
  redactSensitiveText,
} from "@/lib/audit-utils";
import type {
  AuditDatePreset,
  AuditFilterParams,
  AuditLog,
  AuditQueryResult,
} from "@/types";

export {
  AUDIT_ACTIONS,
  AUDIT_ACTION_CATEGORIES,
  AUDIT_RESOURCE_TYPES,
  formatAuditSummary,
  isValidUuid,
  UUID_REGEX,
  redactSensitiveText,
} from "@/lib/audit-utils";

// ---------------------------------------------------------------------------
// Solenne Admin Audit Log data-access layer.
//
// Reads public.audit_logs strictly using the USER-SCOPED Supabase client
// (never createAdminClient or service-role key).
// Authorization is dual-enforced:
//   1. requirePermission("audit.read") server-side guard;
//   2. PostgreSQL RLS policy `audit_logs_select_with_audit_read`.
// ---------------------------------------------------------------------------

/**
 * Explicit allowlist of metadata keys allowed to be exposed in UI summaries
 * or expandable inspection disclosures. Supports verified snake_case keys
 * from SQL RPCs (0006-0009) alongside camelCase keys from TypeScript handlers.
 */
const APPROVED_METADATA_KEYS = new Set([
  // Orders
  "orderNumber",
  "order_number",
  "itemCount",
  "item_count",
  "subtotal",
  "shippingFee",
  "shipping_fee",
  "total",
  "old_status",
  "new_status",
  "previousStatus",
  "previous_status",
  "status",
  "tracking_code",
  "trackingCode",
  "tracking_code_before",
  "tracking_code_after",
  "items_restored",
  "reason",
  // Inventory
  "delta",
  "quantity_before",
  "quantity_after",
  "previous_stock",
  "new_stock",
  "initialStock",
  "stockQuantity",
  // Products & Variants
  "name",
  "slug",
  "category",
  "basePrice",
  "price",
  "variantCount",
  "productId",
  "product_id",
  "product_name",
  "variant_name",
  "sku",
  // Users
  "role",
  "old_role",
  "new_role",
  // Reviews (metadata written by the 0015 guard triggers)
  "review_id",
  "report_reason",
  "resolution_note",
  "actor_role",
]);

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|cookie|auth|credential|session|hash|salt|bearer/i;
const INTERNAL_ERROR_PATTERN = /stack|sql|exception|internal/i;

const MAX_STRING_LENGTH = 200;

/**
 * Recursively sanitizes primitive values, arrays, and objects within bounded depth.
 */
function sanitizeValue(val: unknown, depth = 0): unknown {
  if (depth > 3) {
    return "[Max Depth Reached]";
  }

  if (typeof val === "string") {
    let str = val;
    if (str.length > MAX_STRING_LENGTH) {
      str = str.slice(0, MAX_STRING_LENGTH - 3) + "…";
    }
    return redactSensitiveText(str);
  }

  if (typeof val === "number" || typeof val === "boolean") {
    return val;
  }

  if (val === null || val === undefined) {
    return null;
  }

  if (Array.isArray(val)) {
    return val.slice(0, 10).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof val === "object") {
    const cleanObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k) || INTERNAL_ERROR_PATTERN.test(k)) {
        continue;
      }
      cleanObj[k] = sanitizeValue(v, depth + 1);
    }
    return cleanObj;
  }

  return String(val);
}

/**
 * Filter and sanitize metadata using an explicit allowlist and sensitive-data redaction.
 */
export function sanitizeAuditMetadata(
  rawMetadata: unknown
): Record<string, unknown> {
  if (!rawMetadata || typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(rawMetadata as Record<string, unknown>)) {
    // 1. Redact any key matching sensitive or internal debug patterns
    if (SENSITIVE_KEY_PATTERN.test(key) || INTERNAL_ERROR_PATTERN.test(key)) {
      continue;
    }

    // 2. Enforce explicit allowlist
    if (!APPROVED_METADATA_KEYS.has(key)) {
      continue;
    }

    // 3. Process value recursively (scalars preserved, strings length-limited and PII-redacted)
    sanitized[key] = sanitizeValue(val, 0);
  }

  return sanitized;
}

interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * Primary server-side data access function for querying audit logs.
 * Dual-gates authorization via requirePermission("audit.read") and RLS.
 */
export async function getAdminAuditLogs(
  params: AuditFilterParams = {}
): Promise<AuditQueryResult> {
  // 1. Server-side authorization barrier
  await requirePermission("audit.read");

  // 2. User-scoped Supabase client under RLS
  const supabase = await createClient();

  // 3. Parameter validation
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(params.limit) || 25)));
  const offset = (page - 1) * limit;

  // 4. Query construction
  let query = supabase
    .from("audit_logs")
    .select(
      "id, actor_id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at",
      { count: "exact" }
    );

  // Filter: Action / Category
  if (params.action && typeof params.action === "string") {
    const trimmedAction = params.action.trim();
    if (
      AUDIT_ACTIONS.includes(trimmedAction as (typeof AUDIT_ACTIONS)[number])
    ) {
      query = query.eq("action", trimmedAction);
    } else if (
      AUDIT_ACTION_CATEGORIES.includes(
        trimmedAction as (typeof AUDIT_ACTION_CATEGORIES)[number]
      )
    ) {
      query = query.like("action", `${trimmedAction}.%`);
    }
  }

  // Filter: Resource Type
  if (params.resourceType && typeof params.resourceType === "string") {
    const trimmedType = params.resourceType.trim();
    if (
      AUDIT_RESOURCE_TYPES.includes(
        trimmedType as (typeof AUDIT_RESOURCE_TYPES)[number]
      )
    ) {
      query = query.eq("resource_type", trimmedType);
    }
  }

  // Filter: Date Preset
  const datePreset: AuditDatePreset = params.datePreset ?? "all";
  if (datePreset === "today") {
    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
    ).toISOString();
    query = query.gte("created_at", startOfToday);
  } else if (datePreset === "7d") {
    const past7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", past7d);
  } else if (datePreset === "30d") {
    const past30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", past30d);
  }

  // Ordering: Newest first (created_at DESC), deterministic secondary order (id DESC)
  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  // Range-based pagination fetching limit + 1 items to determine hasMore
  query = query.range(offset, offset + limit);

  const { data, count, error } = await query;

  if (error) {
    console.error("getAdminAuditLogs: Database query error:", error.message);
    throw new Error("Failed to load audit logs");
  }

  const rows = (data ?? []) as AuditLogRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // 5. Actor identity resolution (user-scoped under RLS, non-fatal fallback)
  const actorIds = Array.from(
    new Set(
      pageRows
        .map((r) => r.actor_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );

  const actorNameMap = new Map<string, string>();

  if (actorIds.length > 0) {
    try {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);

      if (!profileError && profiles) {
        for (const p of profiles) {
          if (p.full_name) {
            actorNameMap.set(p.id, p.full_name);
          }
        }
      }
    } catch (profileErr) {
      // Non-fatal display limitation: proceed with fallback IDs
      console.warn(
        "getAdminAuditLogs: Profile lookup non-fatal failure:",
        profileErr instanceof Error ? profileErr.message : profileErr
      );
    }
  }

  // 6. Map and sanitize audit records
  const logs: AuditLog[] = pageRows.map((row) => {
    let actorName: string | null = null;
    if (row.actor_id) {
      actorName = actorNameMap.get(row.actor_id) ?? null;
    }

    return {
      id: row.id,
      actorId: row.actor_id,
      actorName,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: sanitizeAuditMetadata(row.metadata),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    };
  });

  const totalCount = count ?? (hasMore ? offset + limit + 1 : offset + logs.length);

  return {
    logs,
    totalCount,
    page,
    limit,
    hasMore,
  };
}
