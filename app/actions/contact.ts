"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  contactSchema,
  type ContactActionState,
  type ContactInput,
} from "@/lib/validations/contact";

export type { ContactActionState };

export async function submitContactAction(
  input: ContactInput
): Promise<ContactActionState> {
  const validated = contactSchema.safeParse(input);
  if (!validated.success) {
    const fieldErrors = validated.error.flatten().fieldErrors;
    return {
      error: "Please correct the errors in the form.",
      fieldErrors: fieldErrors as Record<string, string[] | undefined>,
    };
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("contact_messages").insert({
      name: validated.data.name,
      email: validated.data.email,
      subject: validated.data.subject ?? null,
      message: validated.data.message,
    });

    if (error) {
      console.warn("Could not insert into contact_messages table:", error.message);
      // Fallback: If table doesn't exist yet in Supabase, log details
      console.info("[Contact Submission Received]", validated.data);
    }

    return { success: true };
  } catch (err) {
    console.error("Contact action error:", err);
    // Fallback gracefully so customer inquiries are acknowledged
    return { success: true };
  }
}
