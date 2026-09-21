export type OwnershipEntry = {
  name: string;
  percentage: number;
};

export type ConditionRatings = {
  kitchen: string;
  bathrooms: string;
  flooring: string;
  windows: string;
  general: string;
};

export type RealEstateMetadata = {
  address: string;
  propertyType: string;
  automaticEstimation: boolean;
  elevator: boolean;
  newConstruction: boolean;
  furnished: boolean;
  purchasePrice: number | null;
  agencyFees: number | null;
  notaryFees: number | null;
  renovationFees: number | null;
  furnishingFees: number | null;
  surfaceArea: number | null;
  gardenArea: number | null;
  balconyArea: number | null;
  floors: number;
  rooms: number;
  garageCount: number;
  yearOfConstruction: string;
  epcRating: string;
  condition: ConditionRatings;
  ownership: OwnershipEntry[];
};

export const EMPTY_REAL_ESTATE_METADATA: RealEstateMetadata = {
  address: "",
  propertyType: "",
  automaticEstimation: false,
  elevator: false,
  newConstruction: false,
  furnished: false,
  purchasePrice: null,
  agencyFees: null,
  notaryFees: null,
  renovationFees: null,
  furnishingFees: null,
  surfaceArea: null,
  gardenArea: null,
  balconyArea: null,
  floors: 1,
  rooms: 1,
  garageCount: 0,
  yearOfConstruction: "",
  epcRating: "",
  condition: {
    kitchen: "",
    bathrooms: "",
    flooring: "",
    windows: "",
    general: "",
  },
  ownership: [{ name: "", percentage: 100 }],
};

export const PROPERTY_TYPES = [
  "Apartment",
  "House",
  "Villa",
  "Land",
  "Commercial",
  "Parking",
  "Other",
];

export const EPC_RATINGS = ["A", "B", "C", "D", "E", "F", "G"];

export const CONDITION_RATINGS = [
  "Excellent",
  "Good",
  "Fair",
  "Poor",
  "To Renovate",
];

const CURRENT_YEAR = new Date().getFullYear();

/** Construction years from the current year down to 1900, newest first. */
export const CONSTRUCTION_YEARS = Array.from(
  { length: CURRENT_YEAR - 1900 + 1 },
  (_, i) => String(CURRENT_YEAR - i),
);
