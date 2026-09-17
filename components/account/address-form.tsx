"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppLocale } from "@/hooks/use-locale";
import { updateAddressAction } from "@/app/actions/addresses";
import {
  ShippingAddressFields,
  type AddressFieldValues,
} from "@/components/address";

export type AddressFormValues = AddressFieldValues;

interface AddressFormProps {
  defaultValues?: Partial<AddressFormValues>;
}

export function AddressForm({ defaultValues }: AddressFormProps) {
  const router = useRouter();
  const locale = useAppLocale();
  const isVi = locale === "vi";

  const initialCountryCode =
    defaultValues?.country === "United States" ||
    defaultValues?.country === "Hoa Kỳ" ||
    defaultValues?.country === "US"
      ? "US"
      : "VN";

  const initialCountry =
    initialCountryCode === "VN" ? "Vietnam" : "United States";

  const [values, setValues] = useState<AddressFormValues>({
    country: defaultValues?.country || initialCountry,
    countryCode: initialCountryCode,
    line1: defaultValues?.line1 ?? "",
    line2: defaultValues?.line2 ?? "",
    city: defaultValues?.city ?? "",
    state: defaultValues?.state ?? "",
    postalCode: defaultValues?.postalCode ?? "",
    provinceCode: defaultValues?.provinceCode ?? "",
    wardCode: defaultValues?.wardCode ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddressChange = useCallback((updated: AddressFieldValues) => {
    setValues((prev) => ({
      ...prev,
      ...updated,
    }));
  }, []);

  const errorFor = (key: string) => fieldErrors[key]?.[0];

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await updateAddressAction({
        line1: values.line1,
        line2: values.line2 || undefined,
        city: values.city,
        state: values.state || undefined,
        postalCode: values.postalCode,
        country: values.country,
        countryCode: (values.countryCode as "VN" | "US") || undefined,
        provinceCode: values.provinceCode || undefined,
        wardCode: values.wardCode || undefined,
        administrativeType: values.administrativeType || undefined,
        provinceName: values.provinceName || undefined,
        wardName: values.wardName || undefined,
      });

      if (result.success) {
        router.push("/account");
        return;
      }

      setSubmitError(
        result.error ??
          (isVi
            ? "Đã xảy ra lỗi khi lưu địa chỉ. Xin vui lòng thử lại."
            : "Something went wrong. Please try again.")
      );
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
    } catch {
      setSubmitError(
        isVi
          ? "Đã xảy ra lỗi khi lưu địa chỉ. Xin vui lòng thử lại."
          : "Something went wrong. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <ShippingAddressFields
        values={values}
        onChange={handleAddressChange}
        errorFor={errorFor}
        disabled={isSubmitting}
        locale={locale}
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
            {isVi ? "Đang lưu địa chỉ..." : "Saving..."}
          </>
        ) : (
          isVi ? "Lưu địa chỉ" : "Save Address"
        )}
      </Button>
    </form>
  );
}
