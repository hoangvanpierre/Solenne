"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  getCountries,
  getRegions,
  getLocalities,
  findRegion,
  findLocality,
  formatAdministrativeType,
  type CountryCode,
} from "@/lib/address-data";

export interface AddressFieldValues {
  country: string;
  countryCode?: "VN" | "US" | string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  provinceCode?: string;
  wardCode?: string;
  administrativeType?: string;
  provinceName?: string;
  wardName?: string;
}

export interface ShippingAddressFieldsProps {
  values: AddressFieldValues;
  onChange: (updated: AddressFieldValues) => void;
  errorFor: (fieldName: string) => string | undefined;
  disabled?: boolean;
  locale?: string;
  className?: string;
}

export function ShippingAddressFields({
  values,
  onChange,
  errorFor,
  disabled = false,
  locale = "en",
  className,
}: ShippingAddressFieldsProps) {
  const isVi = locale === "vi";

  // Derive active CountryCode (default to VN if Vietnam or VN, US if US, etc.)
  const activeCountryCode: CountryCode = useMemo(() => {
    if (values.countryCode === "US" || values.country === "United States" || values.country === "Hoa Kỳ") {
      return "US";
    }
    return "VN";
  }, [values.countryCode, values.country]);

  // Available countries
  const countries = useMemo(() => getCountries(), []);

  // Available regions (Provinces / States) for selected country
  const regions = useMemo(() => getRegions(activeCountryCode), [activeCountryCode]);

  // Convert regions to Combobox options
  const regionOptions: ComboboxOption[] = useMemo(() => {
    return regions.map((r) => ({
      value: r.code,
      label: isVi && r.displayNameVi ? r.displayNameVi : r.displayName,
      sublabel: formatAdministrativeType(r.administrativeType, locale),
      badge: r.administrativeType === "centrally_run_city"
        ? (isVi ? "Thành phố" : "City")
        : r.administrativeType === "federal_district"
        ? "DC"
        : undefined,
    }));
  }, [regions, isVi, locale]);

  // Available localities (Wards/Communes for VN, major cities for US)
  const [localitiesLoading, setLocalitiesLoading] = useState(false);
  const localities = useMemo(() => {
    if (!values.provinceCode) return [];
    return getLocalities(activeCountryCode, values.provinceCode);
  }, [activeCountryCode, values.provinceCode]);

  // Convert localities to Combobox options
  const localityOptions: ComboboxOption[] = useMemo(() => {
    return localities.map((l) => ({
      value: l.code,
      label: isVi && l.displayNameVi ? l.displayNameVi : l.displayName,
      sublabel: formatAdministrativeType(l.administrativeType, locale),
      badge: l.administrativeType === "special_zone"
        ? (isVi ? "Đặc khu" : "Special Zone")
        : l.administrativeType === "ward"
        ? (isVi ? "Phường" : "Ward")
        : l.administrativeType === "commune"
        ? (isVi ? "Xã" : "Commune")
        : undefined,
    }));
  }, [localities, isVi, locale]);

  const reconciledRef = useRef(false);

  // Auto-reconcile prefilled legacy text address on mount or defaultAddress load
  useEffect(() => {
    if (reconciledRef.current) return;
    if (!values.provinceCode && (values.state || values.city)) {
      reconciledRef.current = true;
      const match = findRegion(activeCountryCode, values.state || values.city);
      if (match) {
        const update: AddressFieldValues = {
          ...values,
          provinceCode: match.code,
          countryCode: activeCountryCode,
          country: activeCountryCode === "VN" ? "Vietnam" : "United States",
          state: match.displayName,
        };

        if (activeCountryCode === "VN" && values.city) {
          const locMatch = findLocality("VN", match.code, values.city);
          if (locMatch) {
            update.wardCode = locMatch.code;
            update.city = locMatch.displayName;
            update.administrativeType = locMatch.administrativeType;
          }
        }
        onChange(update);
      }
    }
  }, [activeCountryCode, values, onChange]);

  // Handle Country Change
  const handleCountryChange = (newCountryCode: CountryCode) => {
    if (newCountryCode === activeCountryCode) return;

    const countryObj = countries.find((c) => c.code === newCountryCode);
    const countryName = countryObj ? countryObj.name : newCountryCode === "VN" ? "Vietnam" : "United States";

    onChange({
      ...values,
      country: countryName,
      countryCode: newCountryCode,
      line1: values.line1,
      line2: values.line2,
      provinceCode: "",
      wardCode: "",
      city: "",
      state: "",
      postalCode: "",
      administrativeType: newCountryCode === "US" ? "state" : undefined,
    });
  };

  // Handle Province / State Change
  const handleProvinceChange = (newProvinceCode: string) => {
    setLocalitiesLoading(true);
    const region = regions.find((r) => r.code === newProvinceCode);

    if (!region) {
      onChange({
        ...values,
        provinceCode: "",
        state: "",
        wardCode: "",
        city: activeCountryCode === "VN" ? "" : values.city,
        administrativeType: undefined,
      });
      setLocalitiesLoading(false);
      return;
    }

    const defaultPostal = region.defaultPostalCode || values.postalCode;
    const regionName = region.displayName;

    setTimeout(() => {
      onChange({
        ...values,
        provinceCode: region.code,
        state: regionName,
        provinceName: regionName,
        // Reset dependent locality
        wardCode: "",
        city: activeCountryCode === "VN" ? "" : values.city,
        administrativeType: region.administrativeType,
        postalCode: activeCountryCode === "VN" && !values.postalCode ? defaultPostal : (values.postalCode || defaultPostal),
      });
      setLocalitiesLoading(false);
    }, 50);
  };

  // Handle Ward / Locality Change (VN)
  const handleWardChange = (newWardCode: string) => {
    const loc = localities.find((l) => l.code === newWardCode);

    if (!loc) {
      onChange({
        ...values,
        wardCode: "",
        city: "",
        wardName: "",
        administrativeType: values.administrativeType,
      });
      return;
    }

    onChange({
      ...values,
      wardCode: loc.code,
      city: loc.displayName,
      wardName: loc.displayName,
      administrativeType: loc.administrativeType,
      postalCode: loc.postalCode || values.postalCode,
    });
  };

  // Handle City Change (US)
  const handleCityChange = (cityName: string, option?: ComboboxOption) => {
    onChange({
      ...values,
      city: cityName,
      wardCode: option?.value,
      postalCode: option?.badge || values.postalCode,
    });
  };

  return (
    <div className={className}>
      {/* Country Selection (Pill Toggle) */}
      <div className="space-y-2 mb-6">
        <label className="text-xs font-medium uppercase tracking-wider text-foreground/80">
          {isVi ? "Quốc gia điểm đến" : "Destination Country"} <span className="text-amber">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3 p-1 rounded-xl bg-muted/30 border border-border/70">
          {countries.map((c) => {
            const isSelected = activeCountryCode === c.code;
            return (
              <button
                key={c.code}
                type="button"
                disabled={disabled}
                onClick={() => handleCountryChange(c.code)}
                className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
                  isSelected
                    ? "bg-background text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                }`}
              >
                <span>{isVi ? c.nameVi : c.name}</span>
                <span className="text-[10px] font-mono opacity-60 uppercase">({c.code})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Address Form Fields Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Street Address Line 1 */}
        <div className="sm:col-span-2">
          <Input
            label={
              activeCountryCode === "VN"
                ? isVi
                  ? "Số nhà, tên đường phố"
                  : "Street Address (House number & street)"
                : isVi
                ? "Địa chỉ đường phố"
                : "Street Address"
            }
            name="line1"
            value={values.line1}
            onChange={(e) => onChange({ ...values, line1: e.target.value })}
            error={errorFor("line1")}
            placeholder={
              activeCountryCode === "VN"
                ? isVi
                  ? "Ví dụ: 123 Đường Lê Lợi"
                  : "e.g. 123 Le Loi Street"
                : "e.g. 123 Market Street"
            }
            autoComplete="address-line1"
            disabled={disabled}
            required
          />
        </div>

        {/* Street Address Line 2 (Optional) */}
        <div className="sm:col-span-2">
          <Input
            label={
              isVi
                ? "Tòa nhà, căn hộ, số phòng (tùy chọn)"
                : "Apartment, suite, unit, floor (optional)"
            }
            name="line2"
            value={values.line2 || ""}
            onChange={(e) => onChange({ ...values, line2: e.target.value })}
            error={errorFor("line2")}
            placeholder={
              isVi
                ? "Ví dụ: Tòa Orchid, Căn hộ 12B"
                : "e.g. Apt 4B, Suite 200"
            }
            autoComplete="address-line2"
            disabled={disabled}
          />
        </div>

        {/* =========================================================
            VIETNAM REGION & LOCALITY CASCADING SELECTION
            Province / Municipality -> Ward / Commune / Special Zone
           ========================================================= */}
        {activeCountryCode === "VN" && (
          <>
            {/* Province / Municipality Combobox */}
            <div className="sm:col-span-1">
              <Combobox
                label={isVi ? "Tỉnh / Thành phố trực thuộc TƯ" : "Province / Municipality"}
                value={values.provinceCode || ""}
                onChange={handleProvinceChange}
                options={regionOptions}
                placeholder={isVi ? "Chọn Tỉnh / Thành phố..." : "Select Province / City..."}
                searchPlaceholder={isVi ? "Tìm theo tên Tỉnh / Thành phố..." : "Search province or city..."}
                emptyText={isVi ? "Không tìm thấy Tỉnh / Thành phố phù hợp." : "No province or municipality found."}
                error={errorFor("provinceCode") || errorFor("state")}
                disabled={disabled}
                required
              />
            </div>

            {/* Ward / Commune / Special Zone Dependent Combobox */}
            <div className="sm:col-span-1">
              <Combobox
                label={isVi ? "Phường / Xã / Đặc khu hành chính" : "Ward / Commune / Special Zone"}
                value={values.wardCode || ""}
                onChange={handleWardChange}
                options={localityOptions}
                placeholder={
                  !values.provinceCode
                    ? isVi
                      ? "Chọn Tỉnh / Thành phố trước..."
                      : "Select Province first..."
                    : isVi
                    ? "Chọn Phường / Xã / Đặc khu..."
                    : "Select Ward, Commune or Special Zone..."
                }
                searchPlaceholder={isVi ? "Tìm Phường, Xã, Đặc khu..." : "Search ward or commune..."}
                emptyText={
                  !values.provinceCode
                    ? isVi
                      ? "Vui lòng chọn Tỉnh / Thành phố trước."
                      : "Please select a Province first."
                    : isVi
                    ? "Không tìm thấy Phường / Xã phù hợp."
                    : "No matching ward or commune found."
                }
                error={errorFor("wardCode") || errorFor("city")}
                disabled={disabled || !values.provinceCode}
                loading={localitiesLoading}
                required
              />
            </div>

            {/* Postal Code for Vietnam */}
            <div className="sm:col-span-2">
              <Input
                label={isVi ? "Mã bưu chính (Postal Code)" : "Postal Code"}
                name="postalCode"
                value={values.postalCode}
                onChange={(e) => onChange({ ...values, postalCode: e.target.value })}
                error={errorFor("postalCode")}
                placeholder={isVi ? "Mã bưu chính 6 chữ số (ví dụ: 700000)" : "Postal code (e.g. 700000)"}
                autoComplete="postal-code"
                disabled={disabled}
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {isVi
                  ? "Tự động điền theo Tỉnh / Thành phố đã chọn, quý khách có thể tùy chỉnh nếu cần."
                  : "Pre-filled according to selected province, editable if necessary."}
              </p>
            </div>
          </>
        )}

        {/* =========================================================
            UNITED STATES REGION & LOCALITY SELECTION
            State -> City -> ZIP Code
           ========================================================= */}
        {activeCountryCode === "US" && (
          <>
            {/* US State Searchable Combobox */}
            <div className="sm:col-span-1">
              <Combobox
                label={isVi ? "Tiểu bang (State)" : "State"}
                value={values.provinceCode || values.state || ""}
                onChange={(val, opt) => {
                  onChange({
                    ...values,
                    provinceCode: val,
                    state: opt?.label || val,
                    administrativeType: "state",
                  });
                }}
                options={regionOptions}
                placeholder={isVi ? "Chọn Tiểu bang..." : "Select State..."}
                searchPlaceholder={isVi ? "Tìm Tiểu bang (tên hoặc mã)..." : "Search state name or code..."}
                emptyText={isVi ? "Không tìm thấy tiểu bang." : "No state found."}
                error={errorFor("state") || errorFor("provinceCode")}
                disabled={disabled}
                required
              />
            </div>

            {/* US City (Combobox with suggestions & custom typing support) */}
            <div className="sm:col-span-1">
              <Combobox
                label={isVi ? "Thành phố (City)" : "City"}
                value={values.city}
                onChange={handleCityChange}
                options={localityOptions}
                allowCustomValue={true}
                placeholder={
                  !values.provinceCode
                    ? isVi
                      ? "Nhập hoặc chọn thành phố..."
                      : "Type or select city..."
                    : isVi
                    ? "Nhập hoặc chọn thành phố..."
                    : "Select or type city..."
                }
                searchPlaceholder={isVi ? "Nhập tên thành phố..." : "Search or type city name..."}
                emptyText={isVi ? "Gõ để nhập tên thành phố." : "Type your city name."}
                error={errorFor("city")}
                disabled={disabled}
                required
              />
            </div>

            {/* US ZIP Code */}
            <div className="sm:col-span-2">
              <Input
                label={isVi ? "Mã ZIP (5 chữ số)" : "ZIP Code"}
                name="postalCode"
                value={values.postalCode}
                onChange={(e) => onChange({ ...values, postalCode: e.target.value })}
                error={errorFor("postalCode")}
                placeholder="e.g. 94102 or 90001"
                autoComplete="postal-code"
                disabled={disabled}
                required
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
