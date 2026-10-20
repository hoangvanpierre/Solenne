import { z } from "zod";

export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your name")
    .max(100, "Name is too long"),
  email: z.string().trim().email("Please enter a valid email address"),
  subject: z.string().trim().max(150, "Subject is too long").optional(),
  message: z
    .string()
    .trim()
    .min(5, "Message must be at least 5 characters")
    .max(2000, "Message cannot exceed 2000 characters"),
});

export type ContactInput = z.infer<typeof contactSchema>;

/**
 * Machine-readable reason for a non-success outcome. The UI maps these onto
 * localized copy (`contact.*` in messages/en.json + messages/vi.json) rather
 * than rendering the English `error` string, so failure text stays bilingual.
 */
export type ContactErrorCode = "validation" | "persist_failed";

export type ContactActionState = {
  success?: boolean;
  /** English developer-facing detail (server logs). Not rendered directly. */
  error?: string;
  code?: ContactErrorCode;
  fieldErrors?: Record<string, string[] | undefined>;
};
