import type {AuthUser} from "./auth";

export type AccountAccess = {
  kind: "internal" | "legacy";
  expiresAt: null;
};

/** Called only after legacy authentication, never with a client-supplied identity.
 * A revoked grant is kept as a tombstone so loading the app cannot restore it.
 * "legacy" is the current pre-registration access, NOT a trial/subscription.
 */
export async function ensureLegacyAccount(db: D1Database, user: AuthUser): Promise<AccountAccess> {
  const now = new Date().toISOString();
  const statements = [db.prepare(
    "INSERT INTO accounts (id, created_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING"
  ).bind(user.userId, now)];
  if (user.userId === "owner" || user.userId === "sofia") {
    statements.push(db.prepare(
      "INSERT INTO internal_access (user_id, granted_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING"
    ).bind(user.userId, now));
  }
  await db.batch(statements);
  const grant = await db.prepare(
    "SELECT revoked_at FROM internal_access WHERE user_id = ?"
  ).bind(user.userId).first<{revoked_at: string | null}>();
  return {kind: grant && grant.revoked_at === null ? "internal" : "legacy", expiresAt: null};
}
