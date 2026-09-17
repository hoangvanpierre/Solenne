import type {
  CountryCode,
  CountryOption,
  RegionOption,
  LocalityOption,
} from "./types";
import { VN_REGIONS, VN_LOCALITIES } from "./vn-data";
import { US_STATES, US_MAJOR_CITIES } from "./us-data";

export * from "./types";

export const SUPPORTED_COUNTRIES: CountryOption[] = [
  {
    code: "VN",
    name: "Vietnam",
    nameVi: "Việt Nam",
    phoneCode: "+84",
  },
  {
    code: "US",
    name: "United States",
    nameVi: "Hoa Kỳ",
    phoneCode: "+1",
  },
];

export function getCountries(): CountryOption[] {
  return SUPPORTED_COUNTRIES;
}

export function getCountryByCode(code?: string): CountryOption | undefined {
  if (!code) return undefined;
  const upper = code.toUpperCase().trim();
  return SUPPORTED_COUNTRIES.find(
    (c) => c.code === upper || c.name.toLowerCase() === code.toLowerCase() || c.nameVi.toLowerCase() === code.toLowerCase()
  );
}

export function getRegions(countryCode: CountryCode): RegionOption[] {
  if (countryCode === "VN") {
    return VN_REGIONS;
  }
  if (countryCode === "US") {
    return US_STATES;
  }
  return [];
}

export function getLocalities(
  countryCode: CountryCode,
  regionCode: string
): LocalityOption[] {
  if (!regionCode) return [];

  if (countryCode === "VN") {
    return VN_LOCALITIES.filter((item) => item.regionCode === regionCode);
  }

  if (countryCode === "US") {
    return US_MAJOR_CITIES.filter((item) => item.regionCode === regionCode);
  }

  return [];
}

export function findRegion(
  countryCode: CountryCode,
  codeOrName: string
): RegionOption | undefined {
  if (!codeOrName) return undefined;
  const query = codeOrName.trim().toLowerCase();
  const regions = getRegions(countryCode);

  return regions.find(
    (r) =>
      r.code.toLowerCase() === query ||
      r.displayName.toLowerCase() === query ||
      r.displayNameVi?.toLowerCase() === query ||
      r.alias?.some((a) => a.toLowerCase() === query)
  );
}

export function findLocality(
  countryCode: CountryCode,
  regionCode: string,
  codeOrName: string
): LocalityOption | undefined {
  if (!codeOrName || !regionCode) return undefined;
  const query = codeOrName.trim().toLowerCase();
  const localities = getLocalities(countryCode, regionCode);

  return localities.find(
    (l) =>
      l.code.toLowerCase() === query ||
      l.displayName.toLowerCase() === query ||
      l.displayNameVi?.toLowerCase() === query ||
      l.alias?.some((a) => a.toLowerCase() === query)
  );
}

export function formatAdministrativeType(
  type?: string,
  locale = "vi"
): string {
  if (!type) return "";
  const isVi = locale === "vi";

  switch (type) {
    case "centrally_run_city":
      return isVi ? "Thành phố trực thuộc TƯ" : "Municipality";
    case "province":
      return isVi ? "Tỉnh" : "Province";
    case "ward":
      return isVi ? "Phường" : "Ward";
    case "commune":
      return isVi ? "Xã" : "Commune";
    case "special_zone":
      return isVi ? "Đặc khu hành chính" : "Special Zone";
    case "state":
      return isVi ? "Tiểu bang" : "State";
    case "federal_district":
      return isVi ? "Đặc khu liên bang" : "Federal District";
    case "territory":
      return isVi ? "Vùng lãnh thổ" : "Territory";
    case "city":
      return isVi ? "Thành phố" : "City";
    default:
      return type;
  }
}
