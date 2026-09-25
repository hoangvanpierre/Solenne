"use client";

import { createContext, useContext, useMemo } from "react";
import type { ActorContext, PermissionKey } from "@/types";

// Frontend copy of the caller's authorization context, supplied by a server
// component after resolving getActorContext(). UX ONLY — every protected
// server action, route handler and page re-checks on the server, and RLS
// guards the database even if the UI is bypassed.
//
// The context value distinguishes four states so an unexpected server-side
// failure can never masquerade as "this user has no permissions":
//   - "anonymous"    no session.
//   - "active"       session with status "active".
//   - "restricted"   session, but suspended/banned/pending, or no resolvable
//                    profile — legitimately holds zero permissions.
//   - "unavailable"  the server lookup itself FAILED — the actor is unknown,
//                    not permission-less. Gating helpers fail closed (never
//                    assume a granted permission on an unknown state), but
//                    consumers can observe the difference via `unavailable`
//                    and `state`.
export type AuthzClientState =
  | "unavailable"
  | "anonymous"
  | "restricted"
  | "active";

export interface AuthzContextValue {
  actor: ActorContext | null;
  unavailable: boolean;
}

const AuthzContext = createContext<AuthzContextValue>({
  actor: null,
  unavailable: false,
});

export interface AuthzProviderProps {
  value: ActorContext | null;
  /** True only when the server-side authz lookup failed (unknown actor). */
  unavailable?: boolean;
  children: React.ReactNode;
}

export function AuthzProvider({
  value,
  unavailable = false,
  children,
}: AuthzProviderProps) {
  const context = useMemo<AuthzContextValue>(
    () => ({ actor: value, unavailable }),
    [value, unavailable]
  );

  return <AuthzContext.Provider value={context}>{children}</AuthzContext.Provider>;
}

/**
 * The raw actor context, or null for anonymous visitors and unknown
 * (unavailable) lookups. Use `useAuthz().state` when the distinction matters.
 */
export function useActor(): ActorContext | null {
  return useContext(AuthzContext).actor;
}

/** UX helper: does the caller hold this permission? Never a security gate. */
export function useCan(permission: PermissionKey): boolean {
  const { actor, unavailable } = useContext(AuthzContext);
  return !unavailable && (actor?.permissions.includes(permission) ?? false);
}

/**
 * UX helper returning stable callbacks + derived flags. Example:
 *   const { can, state } = useAuthz();
 *   {state === "active" && can("product.delete") && <DeleteProductButton />}
 */
export function useAuthz() {
  const { actor, unavailable } = useContext(AuthzContext);

  return useMemo(() => {
    const state: AuthzClientState = unavailable
      ? "unavailable"
      : actor === null
        ? "anonymous"
        : actor.status === "active"
          ? "active"
          : "restricted";

    return {
      actor,
      unavailable,
      state,
      isAuthenticated: actor !== null,
      isActive: actor?.status === "active",
      role: actor?.role ?? null,
      can: (permission: PermissionKey): boolean =>
        !unavailable && (actor?.permissions.includes(permission) ?? false),
      canAny: (permissions: PermissionKey[]): boolean =>
        !unavailable && permissions.some((p) => actor?.permissions.includes(p)),
    };
  }, [actor, unavailable]);
}
