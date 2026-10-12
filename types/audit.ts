export interface AuditLog {
  id: string;
  actorId: string | null;
  actorName?: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export type AuditDatePreset = "all" | "today" | "7d" | "30d";

export interface AuditFilterParams {
  page?: number;
  limit?: number;
  action?: string;
  resourceType?: string;
  datePreset?: AuditDatePreset;
}

export interface AuditQueryResult {
  logs: AuditLog[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
