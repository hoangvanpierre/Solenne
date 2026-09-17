export type CountryCode = "VN" | "US";

export type AdministrativeType =
  | "centrally_run_city" // Thành phố trực thuộc trung ương
  | "province"           // Tỉnh
  | "ward"               // Phường
  | "commune"            // Xã
  | "special_zone"       // Đặc khu hành chính
  | "state"              // US State
  | "federal_district"   // US Federal District (DC)
  | "territory"          // US Territory (PR)
  | "city";              // US City

export interface CountryOption {
  code: CountryCode;
  name: string;
  nameVi: string;
  phoneCode: string;
}

export interface RegionOption {
  countryCode: CountryCode;
  code: string;            // e.g. "VN-SG", "VN-HN", "US-CA"
  displayName: string;      // e.g. "TP. Hồ Chí Minh", "Hà Nội", "California"
  displayNameVi?: string;
  administrativeType: AdministrativeType;
  defaultPostalCode?: string;
  alias?: string[];
}

export interface LocalityOption {
  countryCode: CountryCode;
  regionCode: string;      // References RegionOption.code
  code: string;            // e.g. "VN-SG-BN"
  displayName: string;      // e.g. "Phường Bến Nghé"
  displayNameVi?: string;
  administrativeType: AdministrativeType;
  postalCode?: string;
  alias?: string[];
}

export interface StructuredAddress {
  country: string;         // "Vietnam" | "United States"
  countryCode: CountryCode;
  line1: string;           // Street address
  line2?: string;          // Apt, suite, unit
  city: string;            // Ward name (VN) or City (US)
  state?: string;          // Province name (VN) or State (US)
  postalCode: string;      // Postal / ZIP code
  provinceCode?: string;   // Administrative region code (e.g. "VN-SG", "US-CA")
  wardCode?: string;       // Locality code (e.g. "VN-SG-BN")
  administrativeType?: AdministrativeType;
}
