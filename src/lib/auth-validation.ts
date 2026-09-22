import { z } from "zod";

/**
 * Sign-up password complexity, enforced client-side (inline errors) and
 * server-side (defense in depth — a client can always be bypassed).
 */
export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[a-z]/, "At least one lowercase letter")
  .regex(/[A-Z]/, "At least one uppercase letter")
  .regex(/[0-9]/, "At least one number")
  .regex(/[^A-Za-z0-9]/, "At least one special character");

/**
 * Returns every unmet complexity rule's message (Zod doesn't stop at the
 * first failing check for a chained string schema), for rendering an inline
 * checklist under the password field. Empty array means the password is
 * valid.
 */
export function getPasswordRequirementErrors(password: string): string[] {
  const result = passwordSchema.safeParse(password);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.message);
}
