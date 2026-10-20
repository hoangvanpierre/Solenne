import { z } from "zod";

export const newsletterSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;

/**
 * Machine-readable outcome reason. The UI maps these onto localized copy
 * (`newsletter.*` in messages/en.json + messages/vi.json) so subscription
 * feedback stays bilingual.
 */
export type NewsletterErrorCode =
  | "validation"
  | "already_subscribed"
  | "persist_failed";

export type NewsletterActionState = {
  success?: boolean;
  /** English developer-facing detail (server logs). Not rendered directly. */
  error?: string;
  message?: string;
  code?: NewsletterErrorCode;
};
