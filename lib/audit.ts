import { createAdminClient } from "@/lib/supabase/admin";

export interface AuditEntry {
  actorId: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

// Security-sensitive events always flow through the admin client (the
// audit_logs INSERT policy deliberately grants nothing to `authenticated`).
// Best-effort: logging must never break the operation it records.
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      actor_id: entry.actorId,
      action: entry.action,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      metadata: entry.metadata ?? {},
    });
    if (error) {
      console.warn("Failed to write audit log:", error.message);
    }
  } catch (error) {
    console.warn(
      "Failed to write audit log:",
      error instanceof Error ? error.message : error
    );
  }
}
