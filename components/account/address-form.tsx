"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppLocale } from "@/hooks/use-locale";
import { updateAddressAction } from "@/app/actions/addresses";

interface AddressFormValues {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface AddressFormProps {
  defaultValues?: Partial<AddressFormValues>;
}

const COUNTRIES = ["United States", "Vietnam"] as const;

export function AddressForm({ defaultValues }: AddressFormProps) {
  const router = useRouter();
  const locale = useAppLocale();
  const isVi = locale === "vi";

  const [values, setValues] = useState<AddressFormValues>({
    line1: defaultValues?.line1 ?? "",
    line2: defaultValues?.line2 ?? "",
    city: defaultValues?.city ?? "",
    state: defaultValues?.state ?? "",
    postalCode: defaultValues?.postalCode ?? "",
    country:
      defaultValues?.country &&
      (COUNTRIES as readonly string[]).includes(defaultValues.country)
        ? defaultValues.country
        : COUNTRIES[0],
  });
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

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
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Input
          label={isVi ? "Địa chỉ nhà / Tên đường" : "Street Address"}
          name="line1"
          value={values.line1}
          onChange={handleChange}
          error={errorFor("line1")}
          placeholder={isVi ? "Số nhà, tên đường phố" : "House number and street"}
          autoComplete="address-line1"
          required
        />
      </div>
      <Input
        label={isVi ? "Căn hộ, số phòng, tòa nhà (tùy chọn)" : "Apartment, suite, etc. (optional)"}
        name="line2"
        value={values.line2}
        onChange={handleChange}
        error={errorFor("line2")}
        placeholder={isVi ? "Tòa nhà, tầng, số phòng" : "Apartment, suite, unit"}
        autoComplete="address-line2"
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Input
          label={isVi ? "Thành phố / Tỉnh" : "City"}
          name="city"
          value={values.city}
          onChange={handleChange}
          error={errorFor("city")}
          placeholder={isVi ? "Tỉnh / Thành phố" : "City"}
          autoComplete="address-level2"
          required
        />
        <Input
          label={isVi ? "Quận / Huyện / Bang" : "State / Province"}
          name="state"
          value={values.state}
          onChange={handleChange}
          error={errorFor("state")}
          placeholder={isVi ? "Quận / Huyện" : "State / Province"}
          autoComplete="address-level1"
        />
        <Input
          label={isVi ? "Mã bưu chính" : "Postal Code"}
          name="postalCode"
          value={values.postalCode}
          onChange={handleChange}
          error={errorFor("postalCode")}
          placeholder={isVi ? "Mã bưu chính (ZIP)" : "Postal code"}
          autoComplete="postal-code"
          required
        />
        <div className="space-y-1.5">
          <label
            htmlFor="country"
            className="text-sm font-medium text-foreground"
          >
            {isVi ? "Quốc gia" : "Country"}
          </label>
          <select
            id="country"
            name="country"
            value={values.country}
            onChange={handleChange}
            className="flex h-11 w-full rounded-lg border border-border bg-transparent px-4 py-2 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            required
          >
            {COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {isVi && country === "Vietnam"
                  ? "Việt Nam"
                  : isVi && country === "United States"
                  ? "Hoa Kỳ"
                  : country}
              </option>
            ))}
          </select>
          {errorFor("country") && (
            <p className="text-xs text-destructive">{errorFor("country")}</p>
          )}
        </div>
      </div>

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
