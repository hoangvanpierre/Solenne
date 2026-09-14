"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProfileAction } from "@/app/actions/profile";

interface ProfileFormProps {
  defaultName: string;
  defaultPhone: string;
}

export function ProfileForm({ defaultName, defaultPhone }: ProfileFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const errorFor = (key: string) => fieldErrors[key]?.[0];

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await updateProfileAction({ fullName, phone });

      if (result.success) {
        router.push("/account");
        return;
      }

      setSubmitError(result.error ?? "Something went wrong. Please try again.");
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <Input
        label="Full Name"
        name="fullName"
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        error={errorFor("fullName")}
        placeholder="Your full name"
        autoComplete="name"
        required
      />
      <Input
        label="Phone (optional)"
        name="phone"
        type="tel"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        error={errorFor("phone")}
        placeholder="Your phone number"
        autoComplete="tel"
      />

      {submitError && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {submitError}
        </p>
      )}

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Changes"
        )}
      </Button>
    </form>
  );
}
