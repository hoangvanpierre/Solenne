import { z } from "zod";

export const newsletterSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;

export type NewsletterActionState = {
  success?: boolean;
  error?: string;
  message?: string;
};
