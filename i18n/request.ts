import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_TIMEZONE } from "@/lib/constants";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = rawLocale === "vi" ? "vi" : "en";

  return {
    locale,
    timeZone: DEFAULT_TIMEZONE,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
