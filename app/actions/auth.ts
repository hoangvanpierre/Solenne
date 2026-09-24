"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/redirect";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type ActionState,
} from "@/lib/validations/auth";

export type { ActionState };

export async function loginAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawData = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const validated = loginSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      error: "Please check your inputs.",
      fieldErrors: validated.error.flatten().fieldErrors,
    };
  }

  const next = sanitizeNextPath(formData.get("next") as string | null);
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: validated.data.email,
    password: validated.data.password,
  });

  if (error) {
    return {
      error:
        error.message === "Invalid login credentials"
          ? "Invalid email or password. Please try again."
          : error.message,
    };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function registerAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawData = {
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  };

  const validated = registerSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      error: "Please correct the errors in the form.",
      fieldErrors: validated.error.flatten().fieldErrors,
    };
  }

  const next = sanitizeNextPath(formData.get("next") as string | null);
  const supabase = await createClient();

  const headerList = await headers();
  const origin =
    headerList.get("origin") ||
    (headerList.get("host") ? `https://${headerList.get("host")}` : "http://localhost:3000");
  const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const { data, error } = await supabase.auth.signUp({
    email: validated.data.email,
    password: validated.data.password,
    options: {
      data: {
        full_name: validated.data.fullName,
      },
      emailRedirectTo,
    },
  });

  if (error) {
    let friendlyMessage = error.message;

    // Map common Supabase Auth error patterns to clear, elegant messages
    const lower = error.message.toLowerCase();
    if (
      lower.includes("weak") ||
      lower.includes("pwned") ||
      lower.includes("compromised") ||
      lower.includes("least 8")
    ) {
      friendlyMessage =
        "The password provided is too weak or has been exposed in a data breach. Please choose a stronger, unique password.";
    } else if (
      lower.includes("already registered") ||
      lower.includes("user already exists")
    ) {
      friendlyMessage =
        "An account with this email address already exists. Please sign in instead.";
    } else if (lower.includes("rate limit") || lower.includes("too many requests")) {
      friendlyMessage =
        "Too many registration attempts. Please wait a few moments before trying again.";
    }

    return {
      error: friendlyMessage,
    };
  }

  // Handle Supabase email enumeration protection:
  // When an existing user signs up, Supabase may return user with empty identities instead of an error.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return {
      error: "An account with this email address already exists. Please sign in instead.",
    };
  }

  // If email verification is disabled in Supabase, session is established immediately
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(next);
  }

  // Email confirmation is required by Supabase
  return {
    success: true,
    email: validated.data.email,
    message:
      "A verification link has been sent to your email. Please check your inbox to activate your Solenne account before signing in.",
  };
}

export async function forgotPasswordAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawData = {
    email: formData.get("email"),
  };

  const validated = forgotPasswordSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      error: "Please enter a valid email address.",
      fieldErrors: validated.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const headerList = await headers();
  const origin =
    headerList.get("origin") ||
    (headerList.get("host") ? `https://${headerList.get("host")}` : "");
  const redirectTo = origin
    ? `${origin}/auth/callback?next=/reset-password`
    : undefined;

  const { error } = await supabase.auth.resetPasswordForEmail(
    validated.data.email,
    {
      redirectTo,
    }
  );

  if (error) {
    return {
      error: error.message,
    };
  }

  return {
    success: true,
    message:
      "If an account exists with this email, you will receive a password reset link shortly.",
  };
}

export async function resetPasswordAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawData = {
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  };

  const validated = resetPasswordSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      error: "Please check your passwords.",
      fieldErrors: validated.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password: validated.data.password,
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  revalidatePath("/", "layout");
  redirect("/account?message=password_updated");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
