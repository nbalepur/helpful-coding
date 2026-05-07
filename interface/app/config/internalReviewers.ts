import { INTERNAL_REVIEWER_IDENTIFIERS } from './tasks';

type ReviewerUserLike = {
  id?: string | number | null;
  email?: string | null;
  username?: string | null;
};

const INTERNAL_REVIEWER_SET: ReadonlySet<string> = new Set(
  INTERNAL_REVIEWER_IDENTIFIERS.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
);

function normalizeToken(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim().toLowerCase();
  return t.length ? t : null;
}

/**
 * Whether this account is configured as an internal reviewer (`INTERNAL_REVIEWER_IDENTIFIERS` in tasks.ts).
 */
export function isInternalReviewerUser(user: ReviewerUserLike | null | undefined): boolean {
  if (!user) return false;
  if (INTERNAL_REVIEWER_SET.size === 0) return false;

  const email = normalizeToken(user.email ?? undefined);
  if (email && INTERNAL_REVIEWER_SET.has(email)) return true;

  const username = normalizeToken(user.username ?? undefined);
  if (username && INTERNAL_REVIEWER_SET.has(username)) return true;

  if (user.id != null && user.id !== '') {
    const idKey = String(user.id).trim().toLowerCase();
    if (idKey && INTERNAL_REVIEWER_SET.has(idKey)) return true;
  }

  return false;
}
