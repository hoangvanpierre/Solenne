"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  newsletterSchema,
  type NewsletterActionState,
  type NewsletterInput,
} from "@/lib/validations/newsletter";

export type { NewsletterActionState };

export async function subscribeNewsletterAction(
  input: NewsletterInput
): Promise<NewsletterActionState> {
  const validated = newsletterSchema.safeParse(input);
  if (!validated.success) {
    const errorMsg =
      validated.error.flatten().fieldErrors.email?.[0] ??
      "Please enter a valid email address.";
    return { code: "validation", error: errorMsg };
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("newsletter_subscribers").insert({
      email: validated.data.email.toLowerCase(),
    });

    if (error) {
      // 23505 is PostgreSQL unique constraint violation code: the address is
      // already on the list, which is a benign, idempotent outcome.
      if (error.code === "23505") {
        return {
          success: true,
          code: "already_subscribed",
          message: "You are already subscribed to our newsletter.",
        };
      }
      // Any other failure means the address was NOT stored — do not claim
      // the subscription succeeded.
      console.error(
        "Could not insert into newsletter_subscribers table:",
        error.message
      );
      return {
        code: "persist_failed",
        error:
          "We couldn't complete your subscription. Please try again in a moment.",
      };
    }

    return {
      success: true,
      message: "Thank you for subscribing! Welcome to Solenne.",
    };
  } catch (err) {
    console.error("Newsletter action error:", err);
    return {
      code: "persist_failed",
      error:
        "We couldn't complete your subscription. Please try again in a moment.",
    };
  }
}
