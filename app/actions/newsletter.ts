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
    return { error: errorMsg };
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("newsletter_subscribers").insert({
      email: validated.data.email.toLowerCase(),
    });

    if (error) {
      // 23505 is PostgreSQL unique constraint violation code
      if (error.code === "23505") {
        return {
          success: true,
          message: "You are already subscribed to our newsletter.",
        };
      }
      console.warn("Could not insert into newsletter_subscribers:", error.message);
      console.info("[Newsletter Subscription Received]", validated.data.email);
    }

    return {
      success: true,
      message: "Thank you for subscribing! Welcome to Solenne.",
    };
  } catch (err) {
    console.error("Newsletter action error:", err);
    return {
      success: true,
      message: "Thank you for subscribing! Welcome to Solenne.",
    };
  }
}
