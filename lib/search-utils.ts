/** Shared bound for management search terms. */
export const ADMIN_SEARCH_MAX_LENGTH = 80;

/**
 * Escape the characters that have meaning inside a SQL LIKE/ILIKE pattern.
 *
 * PostgREST forwards `ilike` patterns to PostgreSQL, where `%` and `_` are
 * wildcards and `\` is the default escape character. User text must match
 * literally, so each one is escaped before the surrounding `%…%` is added.
 *
 * Callers remain responsible for stripping PostgREST filter syntax characters
 * (commas, parentheses, quotes) before interpolating a value into `.or()`.
 */
export function escapeLikePattern(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}
