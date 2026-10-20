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
      code: "validation",
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
      // Persistence failed. The inquiry is NOT stored, so the visitor must not
      // be told it was received — report the failure instead of silently
      // dropping the message.
      console.error("Could not insert into contact_messages table:", error.message);
      return {
        code: "persist_failed",
        error:
          "We couldn't send your message. Please try again, or email us directly.",
      };
    }

    return { success: true };
  } catch (err) {
    console.error("Contact action error:", err);
    return {
      code: "persist_failed",
      error:
        "We couldn't send your message. Please try again, or email us directly.",
    };
  }
}
