import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import enMessages from "@/messages/en.json";

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const output: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const sVal = source[key];
    const tVal = target[key];
    if (sVal !== null && typeof sVal === "object" && !Array.isArray(sVal)) {
      if (tVal !== null && typeof tVal === "object" && !Array.isArray(tVal)) {
        output[key] = deepMerge(
          tVal as Record<string, unknown>,
          sVal as Record<string, unknown>
        );
      } else {
        output[key] = sVal;
      }
    } else if (sVal !== undefined && sVal !== "") {
      output[key] = sVal;
    }
  }
  return output;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = rawLocale === "vi" ? "vi" : "en";

  const rawMessages = (await import(`../messages/${locale}.json`)).default;
  const messages = locale === "vi" ? deepMerge(enMessages, rawMessages) : rawMessages;

  return {
    locale,
    timeZone: DEFAULT_TIMEZONE,
    messages,
  };
});

