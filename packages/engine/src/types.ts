import type { ISODate } from './dateutil.js';

export type { ISODate };

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type TripType =
  | 'beach'
  | 'city-break'
  | 'road-trip'
  | 'adventure'
  | 'luxury'
  | 'camping'
  | 'skiing'
  | 'walking'
  | 'cruise';

export type HolidayType = 'bank' | 'company' | 'custom' | 'regional';

export interface Holiday {
  date: ISODate;
  name: string;
  type: HolidayType;
  /** Optional region code for regional bank holidays. */
  region?: string;
}

export interface DateRangeSpec {
  start: ISODate;
  end: ISODate;
  label?: string;
}

/**
 * Why someone might book time off — beyond travel. Drives how a break is
 * described and whether the engine suggests a destination for it.
 */
export type OccasionKind =
  | 'birthday'
  | 'anniversary'
  | 'wedding'
  | 'festival'
  | 'concert'
  | 'sport'
  | 'event'
  | 'family'
  | 'medical'
  | 'admin'
  | 'moving'
  | 'study'
  | 'rest';

/** A named personal date the user wants to protect, celebrate, or book off. */
export interface PersonalDate {
  date: ISODate;
  label: string;
  kind: OccasionKind;
  /** When true, the engine builds a break anchored around this date. */
  bookAround?: boolean;
  /** Preferred length (calendar days off) of that anchored break. */
  daysAround?: number;
}

/** The reason a break exists — a trip, a staycation, or a non-travel commitment. */
export type BreakPurpose = 'getaway' | 'staycation' | 'event' | 'family' | 'admin' | 'rest';

export interface LeaveConfig {
  /** Total statutory allowance in days. */
  allowance: number;
  /** Days already remaining/available to book. */
  remaining: number;
  /** Carried-over days from the previous year. */
  carryOver: number;
  /** Days reserved for emergencies — the engine will never spend these. */
  reserveDays: number;
  /** Extra days purchased. */
  purchasedDays: number;
  /** Days sold back. */
  soldDays: number;
  /** Company shutdown periods where leave is auto-deducted. */
  shutdowns: DateRangeSpec[];
  /** Dates the user must take as leave. */
  mandatoryDates: ISODate[];
  /** Whether half-days are permitted. */
  allowHalfDays: boolean;
}

/** Climate record for a candidate destination, per month. */
export interface ClimateMonth {
  month: number; // 1-12
  avgTempC: number;
  rainfallMm: number;
  sunshineHours: number;
  beachScore: number; // 0-1
  skiScore: number; // 0-1
  /** True during monsoon/hurricane season — engine avoids these. */
  hazard: boolean;
}

export interface Destination {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  domestic: boolean;
  /** One-way-ish nominal flight time in hours (0 for domestic drive). */
  flightHours: number;
  /** Nominal return flight cost in the plan currency. */
  flightCost: number;
  /** Nominal nightly accommodation cost. */
  accommodationPerNight: number;
  /** Nominal daily spend. */
  dailySpend: number;
  tripTypes: TripType[];
  climate: ClimateMonth[];
}

/** Weights are 0..5; 0 means "ignore this objective". */
export interface Weights {
  maximiseConsecutive: number;
  minimiseLeave: number;
  warmWeather: number;
  budget: number;
  spreadEvenly: number;
  preferenceMatch: number;
  longWeekends: number;
}

export interface Preferences {
  weights: Weights;
  preferredMonths: number[]; // 1-12, empty = any
  preferredSeasons: Season[];
  /** Ideal single-trip length in calendar days off. */
  preferredTripLength: number;
  /** Ideal minimum temperature for "warm" scoring. */
  minPreferredTempC: number;
  /** True → favour many short breaks; false → favour one long holiday. */
  preferShortBreaks: boolean;
  tripTypes: TripType[];
  avoidSchoolHolidays: boolean;
  personalDates: PersonalDate[];
  // --- Travel preferences (all optional; absent ⇒ no constraint) -----------
  /** Restrict suggestions to domestic-only, international-only, or anywhere. */
  travelScope?: TravelScope;
  /** If non-empty, only suggest destinations in these ISO country codes. */
  preferredCountries?: string[];
  /** Never suggest destinations in these ISO country codes. */
  avoidCountries?: string[];
  /** Exclude destinations whose flight time exceeds this many hours. */
  maxFlightHours?: number;
}

export type TravelScope = 'domestic' | 'international' | 'any';

export interface BudgetConfig {
  currency: string; // ISO 4217
  /** Total money available across the whole year. */
  holidayFund: number;
  monthlySavings: number;
  /** Hard cap on any single trip; plans never exceed this per trip. */
  maxTripBudget: number;
}

export interface EngineInput {
  year: number;
  leave: LeaveConfig;
  holidays: Holiday[];
  /** Ranges where leave is forbidden (company blackout / busy periods). */
  blackouts: DateRangeSpec[];
  /** School-holiday ranges (used when avoidSchoolHolidays is on). */
  schoolHolidays: DateRangeSpec[];
  weekendDays: number[]; // e.g. [0,6]
  preferences: Preferences;
  budget: BudgetConfig;
  destinations: Destination[];
  /** How many distinct ranked plans to return. */
  planCount?: number;
  /**
   * Group constraint (optional). Absent ⇒ single-user behaviour is unchanged.
   * Colleague absence ranges used to enforce "max colleagues off simultaneously".
   */
  colleagueLeave?: DateRangeSpec[];
  /** Max colleagues (incl. the user) allowed off on any working day. */
  maxSimultaneous?: number;
  /**
   * The user's home location + climate (optional). When present, staycation
   * breaks are annotated with the local weather for that month. Absent ⇒
   * single-user behaviour is unchanged.
   */
  home?: { countryCode: string; label: string; climate: ClimateMonth[] };
}

export interface WeatherSummary {
  avgTempC: number;
  sunshineHours: number;
  hazard: boolean;
  label: string;
}

export interface TripSuggestion {
  destinationId: string;
  destinationName: string;
  country: string;
  tripType: TripType;
  estimatedCost: number;
  weather: WeatherSummary;
  weatherScore: number; // 0-1
}

export interface Break {
  start: ISODate;
  end: ISODate;
  /** Working days on which leave is actually spent. */
  leaveDatesUsed: ISODate[];
  leaveDaysUsed: number;
  /** Total contiguous calendar days off (incl. weekends & holidays). */
  totalDaysOff: number;
  /** Names of holidays this break bridges. */
  bridgedHolidays: string[];
  month: number;
  season: Season;
  suggestion?: TripSuggestion;
  /** Estimated cost of this break (0 if no travel suggested / staycation). */
  estimatedCost: number;
  /** Working days in this break that overlap a colleague's leave (group mode). */
  colleagueOverlapDays?: number;
  /** Local weather for a staycation break (present only when no trip suggested). */
  homeWeather?: WeatherSummary;
  /** Why this break exists (trip, staycation, or a non-travel commitment). */
  purpose?: BreakPurpose;
  /** Label of the personal date this break is anchored around, if any. */
  anchorLabel?: string;
}

export interface ScoreBreakdown {
  criterion: string;
  weight: number;
  score: number; // 0-1
  contribution: number; // weight * score, before normalisation
}

export interface Plan {
  id: string;
  strategy: string;
  strategyLabel: string;
  breaks: Break[];
  totalLeaveUsed: number;
  totalDaysOff: number;
  longestBreak: number;
  tripCount: number;
  /** days off / leave spent. */
  efficiency: number;
  totalEstimatedCost: number;
  score: number; // 0-100
  scoreBreakdown: ScoreBreakdown[];
  explanation: string;
  tradeoffs: string[];
}

export interface EngineResult {
  input: EngineInput;
  availableLeave: number;
  bookableLeave: number; // available minus reserve
  plans: Plan[];
  generatedAt: string;
}
