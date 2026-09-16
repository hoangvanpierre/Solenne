"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitContactAction } from "@/app/actions/contact";

interface ContactFormValues {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const INITIAL_VALUES: ContactFormValues = {
  name: "",
  email: "",
  subject: "",
  message: "",
};

export function ContactForm() {
  const t = useTranslations("contact");
  const [values, setValues] = useState<ContactFormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<Partial<ContactFormValues>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof ContactFormValues]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);

    const nextErrors: Partial<ContactFormValues> = {};
    if (!values.name.trim()) nextErrors.name = t("errorName");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      nextErrors.email = t("errorEmail");
    }
    if (!values.message.trim()) {
      nextErrors.message = t("errorMessage");
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const res = await submitContactAction(values);
      if (res.success) {
        setIsSent(true);
        setValues(INITIAL_VALUES);
      } else {
        if (res.fieldErrors) {
          const fieldMap: Partial<ContactFormValues> = {};
          for (const [k, v] of Object.entries(res.fieldErrors)) {
            if (v && v.length > 0) {
              fieldMap[k as keyof ContactFormValues] = v[0];
            }
          }
          setErrors(fieldMap);
        }
        setServerError(res.error ?? "Failed to send message. Please try again.");
      }
    } catch {
      setServerError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSent) {
    return (
      <div className="rounded-2xl border border-border p-10 text-center">
        <h3 className="font-serif text-2xl font-semibold text-foreground">
          {t("thankYou")}
        </h3>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          {t("thankYouDescription")}
        </p>
        <Button
          className="mt-6"
          variant="outline"
          onClick={() => setIsSent(false)}
        >
          {t("sendAnother")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Input
          label={t("name")}
          name="name"
          value={values.name}
          onChange={handleChange}
          error={errors.name}
          placeholder={t("namePlaceholder")}
          autoComplete="name"
        />
        <Input
          label={t("email")}
          name="email"
          type="email"
          value={values.email}
          onChange={handleChange}
          error={errors.email}
          placeholder={t("emailPlaceholder")}
          autoComplete="email"
        />
      </div>
      <Input
        label={t("subject")}
        name="subject"
        value={values.subject}
        onChange={handleChange}
        placeholder={t("subjectPlaceholder")}
      />
      <div className="space-y-1.5">
        <label
          htmlFor="message"
          className="text-sm font-medium text-foreground"
        >
          {t("message")}
        </label>
        <textarea
          id="message"
          name="message"
          rows={6}
          value={values.message}
          onChange={handleChange}
          placeholder={t("messagePlaceholder")}
          className="flex w-full rounded-lg border border-border bg-transparent px-4 py-2 text-sm transition-colors duration-200 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
        />
        {errors.message && (
          <p className="text-xs text-destructive">{errors.message}</p>
        )}
      </div>
      {serverError && (
        <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
          {serverError}
        </div>
      )}
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
