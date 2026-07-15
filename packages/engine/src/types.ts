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

/** A named personal date the user wants to protect or celebrate. */
export interface PersonalDate {
  date: ISODate;
  label: string;
  kind: 'birthday' | 'anniversary' | 'festival' | 'sport' | 'concert' | 'event';
}

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
}

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
