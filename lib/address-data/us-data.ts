import type { RegionOption, LocalityOption } from "./types";

// 50 US States + District of Columbia + Puerto Rico
export const US_STATES: RegionOption[] = [
  { countryCode: "US", code: "AL", displayName: "Alabama", administrativeType: "state", defaultPostalCode: "35004" },
  { countryCode: "US", code: "AK", displayName: "Alaska", administrativeType: "state", defaultPostalCode: "99501" },
  { countryCode: "US", code: "AZ", displayName: "Arizona", administrativeType: "state", defaultPostalCode: "85001" },
  { countryCode: "US", code: "AR", displayName: "Arkansas", administrativeType: "state", defaultPostalCode: "72201" },
  { countryCode: "US", code: "CA", displayName: "California", administrativeType: "state", defaultPostalCode: "90001" },
  { countryCode: "US", code: "CO", displayName: "Colorado", administrativeType: "state", defaultPostalCode: "80201" },
  { countryCode: "US", code: "CT", displayName: "Connecticut", administrativeType: "state", defaultPostalCode: "06101" },
  { countryCode: "US", code: "DE", displayName: "Delaware", administrativeType: "state", defaultPostalCode: "19901" },
  { countryCode: "US", code: "DC", displayName: "District of Columbia", administrativeType: "federal_district", defaultPostalCode: "20001" },
  { countryCode: "US", code: "FL", displayName: "Florida", administrativeType: "state", defaultPostalCode: "33101" },
  { countryCode: "US", code: "GA", displayName: "Georgia", administrativeType: "state", defaultPostalCode: "30301" },
  { countryCode: "US", code: "HI", displayName: "Hawaii", administrativeType: "state", defaultPostalCode: "96801" },
  { countryCode: "US", code: "ID", displayName: "Idaho", administrativeType: "state", defaultPostalCode: "83701" },
  { countryCode: "US", code: "IL", displayName: "Illinois", administrativeType: "state", defaultPostalCode: "60601" },
  { countryCode: "US", code: "IN", displayName: "Indiana", administrativeType: "state", defaultPostalCode: "46201" },
  { countryCode: "US", code: "IA", displayName: "Iowa", administrativeType: "state", defaultPostalCode: "50301" },
  { countryCode: "US", code: "KS", displayName: "Kansas", administrativeType: "state", defaultPostalCode: "66101" },
  { countryCode: "US", code: "KY", displayName: "Kentucky", administrativeType: "state", defaultPostalCode: "40201" },
  { countryCode: "US", code: "LA", displayName: "Louisiana", administrativeType: "state", defaultPostalCode: "70112" },
  { countryCode: "US", code: "ME", displayName: "Maine", administrativeType: "state", defaultPostalCode: "04101" },
  { countryCode: "US", code: "MD", displayName: "Maryland", administrativeType: "state", defaultPostalCode: "21201" },
  { countryCode: "US", code: "MA", displayName: "Massachusetts", administrativeType: "state", defaultPostalCode: "02101" },
  { countryCode: "US", code: "MI", displayName: "Michigan", administrativeType: "state", defaultPostalCode: "48201" },
  { countryCode: "US", code: "MN", displayName: "Minnesota", administrativeType: "state", defaultPostalCode: "55401" },
  { countryCode: "US", code: "MS", displayName: "Mississippi", administrativeType: "state", defaultPostalCode: "39201" },
  { countryCode: "US", code: "MO", displayName: "Missouri", administrativeType: "state", defaultPostalCode: "63101" },
  { countryCode: "US", code: "MT", displayName: "Montana", administrativeType: "state", defaultPostalCode: "59601" },
  { countryCode: "US", code: "NE", displayName: "Nebraska", administrativeType: "state", defaultPostalCode: "68101" },
  { countryCode: "US", code: "NV", displayName: "Nevada", administrativeType: "state", defaultPostalCode: "89101" },
  { countryCode: "US", code: "NH", displayName: "New Hampshire", administrativeType: "state", defaultPostalCode: "03101" },
  { countryCode: "US", code: "NJ", displayName: "New Jersey", administrativeType: "state", defaultPostalCode: "07101" },
  { countryCode: "US", code: "NM", displayName: "New Mexico", administrativeType: "state", defaultPostalCode: "87101" },
  { countryCode: "US", code: "NY", displayName: "New York", administrativeType: "state", defaultPostalCode: "10001" },
  { countryCode: "US", code: "NC", displayName: "North Carolina", administrativeType: "state", defaultPostalCode: "27601" },
  { countryCode: "US", code: "ND", displayName: "North Dakota", administrativeType: "state", defaultPostalCode: "58102" },
  { countryCode: "US", code: "OH", displayName: "Ohio", administrativeType: "state", defaultPostalCode: "43201" },
  { countryCode: "US", code: "OK", displayName: "Oklahoma", administrativeType: "state", defaultPostalCode: "73101" },
  { countryCode: "US", code: "OR", displayName: "Oregon", administrativeType: "state", defaultPostalCode: "97201" },
  { countryCode: "US", code: "PA", displayName: "Pennsylvania", administrativeType: "state", defaultPostalCode: "19101" },
  { countryCode: "US", code: "RI", displayName: "Rhode Island", administrativeType: "state", defaultPostalCode: "02901" },
  { countryCode: "US", code: "SC", displayName: "South Carolina", administrativeType: "state", defaultPostalCode: "29201" },
  { countryCode: "US", code: "SD", displayName: "South Dakota", administrativeType: "state", defaultPostalCode: "57101" },
  { countryCode: "US", code: "TN", displayName: "Tennessee", administrativeType: "state", defaultPostalCode: "37201" },
  { countryCode: "US", code: "TX", displayName: "Texas", administrativeType: "state", defaultPostalCode: "75201" },
  { countryCode: "US", code: "UT", displayName: "Utah", administrativeType: "state", defaultPostalCode: "84101" },
  { countryCode: "US", code: "VT", displayName: "Vermont", administrativeType: "state", defaultPostalCode: "05401" },
  { countryCode: "US", code: "VA", displayName: "Virginia", administrativeType: "state", defaultPostalCode: "23219" },
  { countryCode: "US", code: "WA", displayName: "Washington", administrativeType: "state", defaultPostalCode: "98101" },
  { countryCode: "US", code: "WV", displayName: "West Virginia", administrativeType: "state", defaultPostalCode: "25301" },
  { countryCode: "US", code: "WI", displayName: "Wisconsin", administrativeType: "state", defaultPostalCode: "53201" },
  { countryCode: "US", code: "WY", displayName: "Wyoming", administrativeType: "state", defaultPostalCode: "82001" },
  { countryCode: "US", code: "PR", displayName: "Puerto Rico", administrativeType: "territory", defaultPostalCode: "00901" },
];

// Major cities per key US states to provide instant searchable suggestions
export const US_MAJOR_CITIES: LocalityOption[] = [
  // California
  { countryCode: "US", regionCode: "CA", code: "US-CA-LA", displayName: "Los Angeles", administrativeType: "city", postalCode: "90001" },
  { countryCode: "US", regionCode: "CA", code: "US-CA-SF", displayName: "San Francisco", administrativeType: "city", postalCode: "94102" },
  { countryCode: "US", regionCode: "CA", code: "US-CA-SD", displayName: "San Diego", administrativeType: "city", postalCode: "92101" },
  { countryCode: "US", regionCode: "CA", code: "US-CA-SJ", displayName: "San Jose", administrativeType: "city", postalCode: "95101" },
  { countryCode: "US", regionCode: "CA", code: "US-CA-SAC", displayName: "Sacramento", administrativeType: "city", postalCode: "95814" },

  // New York
  { countryCode: "US", regionCode: "NY", code: "US-NY-NYC", displayName: "New York", administrativeType: "city", postalCode: "10001" },
  { countryCode: "US", regionCode: "NY", code: "US-NY-BUF", displayName: "Buffalo", administrativeType: "city", postalCode: "14201" },
  { countryCode: "US", regionCode: "NY", code: "US-NY-ROC", displayName: "Rochester", administrativeType: "city", postalCode: "14604" },
  { countryCode: "US", regionCode: "NY", code: "US-NY-ALB", displayName: "Albany", administrativeType: "city", postalCode: "12207" },

  // Texas
  { countryCode: "US", regionCode: "TX", code: "US-TX-HOU", displayName: "Houston", administrativeType: "city", postalCode: "77002" },
  { countryCode: "US", regionCode: "TX", code: "US-TX-DAL", displayName: "Dallas", administrativeType: "city", postalCode: "75201" },
  { countryCode: "US", regionCode: "TX", code: "US-TX-AUS", displayName: "Austin", administrativeType: "city", postalCode: "78701" },
  { countryCode: "US", regionCode: "TX", code: "US-TX-SA", displayName: "San Antonio", administrativeType: "city", postalCode: "78201" },

  // Washington
  { countryCode: "US", regionCode: "WA", code: "US-WA-SEA", displayName: "Seattle", administrativeType: "city", postalCode: "98101" },
  { countryCode: "US", regionCode: "WA", code: "US-WA-SPO", displayName: "Spokane", administrativeType: "city", postalCode: "99201" },
  { countryCode: "US", regionCode: "WA", code: "US-WA-TAC", displayName: "Tacoma", administrativeType: "city", postalCode: "98402" },

  // Florida
  { countryCode: "US", regionCode: "FL", code: "US-FL-MIA", displayName: "Miami", administrativeType: "city", postalCode: "33101" },
  { countryCode: "US", regionCode: "FL", code: "US-FL-ORL", displayName: "Orlando", administrativeType: "city", postalCode: "32801" },
  { countryCode: "US", regionCode: "FL", code: "US-FL-TAM", displayName: "Tampa", administrativeType: "city", postalCode: "33602" },

  // Illinois
  { countryCode: "US", regionCode: "IL", code: "US-IL-CHI", displayName: "Chicago", administrativeType: "city", postalCode: "60601" },

  // Massachusetts
  { countryCode: "US", regionCode: "MA", code: "US-MA-BOS", displayName: "Boston", administrativeType: "city", postalCode: "02108" },
  { countryCode: "US", regionCode: "MA", code: "US-MA-CAM", displayName: "Cambridge", administrativeType: "city", postalCode: "02138" },

  // District of Columbia
  { countryCode: "US", regionCode: "DC", code: "US-DC-WAS", displayName: "Washington", administrativeType: "city", postalCode: "20001" },
];
