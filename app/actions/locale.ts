"use server";

import { cookies } from "next/headers";

export async function setLocaleAction(locale: "en" | "vi") {
  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });
  return { success: true, locale };
}
