"use client";

import { createContext, useContext, useMemo } from "react";
import type { ActorContext, PermissionKey } from "@/types";

// Frontend copy of the caller's authorization context, supplied by a server
// component after resolving getActorContext(). UX ONLY — every protected
// server action, route handler and page re-checks on the server, and RLS
// guards the database even if the UI is bypassed.
const AuthzContext = createContext<ActorContext | null>(null);

export interface AuthzProviderProps {
  value: ActorContext | null;
  children: React.ReactNode;
}

export function AuthzProvider({ value, children }: AuthzProviderProps) {
  return <AuthzContext.Provider value={value}>{children}</AuthzContext.Provider>;
}

/** The raw actor context, or null for anonymous visitors. */
export function useActor(): ActorContext | null {
  return useContext(AuthzContext);
}

/** UX helper: does the caller hold this permission? Never a security gate. */
export function useCan(permission: PermissionKey): boolean {
  const actor = useContext(AuthzContext);
  return actor?.permissions.includes(permission) ?? false;
}

/**
 * UX helper returning stable callbacks + derived flags. Example:
 *   const { can } = useAuthz();
 *   {can("product.delete") && <DeleteProductButton />}
 */
export function useAuthz() {
  const actor = useContext(AuthzContext);

  return useMemo(
    () => ({
      actor,
      isAuthenticated: actor !== null,
      isActive: actor?.status === "active",
      role: actor?.role ?? null,
      can: (permission: PermissionKey): boolean =>
        actor?.permissions.includes(permission) ?? false,
      canAny: (permissions: PermissionKey[]): boolean =>
        permissions.some((p) => actor?.permissions.includes(p)) ?? false,
    }),
    [actor]
  );
}
