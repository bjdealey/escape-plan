import type {
  BudgetConfig,
  ClimateMonth,
  DateRangeSpec,
  Destination,
  EngineInput,
  Holiday,
  LeaveConfig,
  Preferences,
  Weights,
} from './types.js';
import type {
  Group,
  Invite,
  LeaveRequestRecord,
  Membership,
  PlanShareRecord,
  PrivacySetting,
} from './groups.js';

export const DEFAULT_WEIGHTS: Weights = {
  maximiseConsecutive: 4,
  minimiseLeave: 3,
  warmWeather: 2,
  budget: 3,
  spreadEvenly: 2,
  preferenceMatch: 2,
  longWeekends: 2,
};

/** UK (England & Wales) bank holidays for 2026, from the seeded dataset. */
export const UK_HOLIDAYS_2026: Holiday[] = [
  { date: '2026-01-01', name: "New Year's Day", type: 'bank' },
  { date: '2026-04-03', name: 'Good Friday', type: 'bank' },
  { date: '2026-04-06', name: 'Easter Monday', type: 'bank' },
  { date: '2026-05-04', name: 'Early May bank holiday', type: 'bank' },
  { date: '2026-05-25', name: 'Spring bank holiday', type: 'bank' },
  { date: '2026-08-31', name: 'Summer bank holiday', type: 'bank' },
  { date: '2026-12-25', name: 'Christmas Day', type: 'bank' },
  { date: '2026-12-28', name: 'Boxing Day (substitute)', type: 'bank' },
];

function climate(
  temps: number[],
  rain: number[],
  sun: number[],
  beach: number[],
  ski: number[],
  hazard: boolean[],
): ClimateMonth[] {
  return temps.map((_, i) => ({
    month: i + 1,
    avgTempC: temps[i],
    rainfallMm: rain[i],
    sunshineHours: sun[i],
    beachScore: beach[i],
    skiScore: ski[i],
    hazard: hazard[i],
  }));
}

const NO_HAZARD = Array<boolean>(12).fill(false);

export const DEMO_DESTINATIONS: Destination[] = [
  {
    id: 'cornwall',
    name: 'Cornwall',
    country: 'United Kingdom',
    countryCode: 'GB',
    domestic: true,
    flightHours: 0,
    flightCost: 0,
    accommodationPerNight: 95,
    dailySpend: 55,
    tripTypes: ['beach', 'walking', 'road-trip'],
    climate: climate(
      [8, 8, 10, 12, 15, 18, 20, 20, 18, 14, 11, 9],
      [110, 85, 75, 60, 55, 50, 60, 70, 80, 110, 120, 120],
      [70, 95, 130, 190, 220, 230, 230, 210, 160, 110, 75, 60],
      [0.2, 0.2, 0.3, 0.5, 0.7, 0.85, 0.95, 0.95, 0.75, 0.4, 0.2, 0.2],
      Array(12).fill(0),
      NO_HAZARD,
    ),
  },
  {
    id: 'edinburgh',
    name: 'Edinburgh',
    country: 'United Kingdom',
    countryCode: 'GB',
    domestic: true,
    flightHours: 0,
    flightCost: 40,
    accommodationPerNight: 110,
    dailySpend: 60,
    tripTypes: ['city-break', 'walking'],
    climate: climate(
      [4, 5, 7, 9, 12, 15, 17, 17, 14, 11, 7, 5],
      [65, 50, 55, 45, 50, 55, 65, 70, 65, 75, 70, 65],
      [55, 85, 115, 150, 185, 170, 165, 155, 120, 95, 65, 45],
      Array(12).fill(0.1),
      Array(12).fill(0),
      NO_HAZARD,
    ),
  },
  {
    id: 'lake-district',
    name: 'Lake District',
    country: 'United Kingdom',
    countryCode: 'GB',
    domestic: true,
    flightHours: 0,
    flightCost: 0,
    accommodationPerNight: 85,
    dailySpend: 45,
    tripTypes: ['walking', 'camping', 'adventure'],
    climate: climate(
      [5, 5, 7, 9, 13, 15, 17, 17, 14, 11, 7, 5],
      [200, 140, 150, 110, 95, 110, 130, 150, 170, 190, 210, 210],
      [45, 75, 100, 140, 175, 165, 160, 150, 110, 85, 55, 40],
      Array(12).fill(0.05),
      Array(12).fill(0),
      NO_HAZARD,
    ),
  },
  {
    id: 'barcelona',
    name: 'Barcelona',
    country: 'Spain',
    countryCode: 'ES',
    domestic: false,
    flightHours: 2,
    flightCost: 130,
    accommodationPerNight: 120,
    dailySpend: 70,
    tripTypes: ['city-break', 'beach', 'luxury'],
    climate: climate(
      [11, 12, 14, 16, 19, 23, 26, 26, 23, 19, 14, 12],
      [40, 35, 40, 45, 50, 40, 25, 55, 75, 90, 55, 45],
      [150, 165, 200, 230, 260, 290, 320, 290, 230, 200, 155, 140],
      [0.2, 0.2, 0.3, 0.5, 0.7, 0.9, 1, 1, 0.85, 0.6, 0.3, 0.2],
      Array(12).fill(0),
      NO_HAZARD,
    ),
  },
  {
    id: 'algarve',
    name: 'Algarve',
    country: 'Portugal',
    countryCode: 'PT',
    domestic: false,
    flightHours: 2.5,
    flightCost: 145,
    accommodationPerNight: 105,
    dailySpend: 60,
    tripTypes: ['beach', 'luxury', 'road-trip'],
    climate: climate(
      [12, 13, 15, 17, 20, 23, 26, 26, 24, 20, 16, 13],
      [70, 55, 45, 40, 25, 10, 3, 5, 25, 60, 80, 90],
      [180, 195, 230, 270, 310, 350, 370, 350, 270, 220, 180, 165],
      [0.3, 0.3, 0.45, 0.6, 0.8, 0.95, 1, 1, 0.9, 0.65, 0.4, 0.3],
      Array(12).fill(0),
      NO_HAZARD,
    ),
  },
  {
    id: 'amalfi',
    name: 'Amalfi Coast',
    country: 'Italy',
    countryCode: 'IT',
    domestic: false,
    flightHours: 3,
    flightCost: 175,
    accommodationPerNight: 190,
    dailySpend: 90,
    tripTypes: ['luxury', 'beach', 'cruise'],
    climate: climate(
      [10, 11, 13, 16, 20, 24, 27, 27, 24, 19, 15, 12],
      [95, 85, 75, 65, 45, 30, 20, 30, 70, 110, 130, 110],
      [130, 150, 185, 220, 270, 300, 330, 310, 250, 195, 140, 120],
      [0.2, 0.2, 0.35, 0.55, 0.75, 0.95, 1, 1, 0.85, 0.6, 0.3, 0.2],
      Array(12).fill(0),
      NO_HAZARD,
    ),
  },
  {
    id: 'crete',
    name: 'Crete',
    country: 'Greece',
    countryCode: 'GR',
    domestic: false,
    flightHours: 4,
    flightCost: 210,
    accommodationPerNight: 110,
    dailySpend: 65,
    tripTypes: ['beach', 'luxury', 'walking'],
    climate: climate(
      [12, 12, 14, 18, 22, 26, 29, 29, 26, 22, 18, 14],
      [90, 70, 50, 30, 15, 3, 1, 1, 15, 55, 75, 95],
      [150, 165, 210, 250, 310, 360, 380, 360, 300, 230, 175, 150],
      [0.25, 0.25, 0.4, 0.65, 0.85, 1, 1, 1, 0.9, 0.7, 0.4, 0.3],
      Array(12).fill(0),
      NO_HAZARD,
    ),
  },
  {
    id: 'reykjavik',
    name: 'Reykjavik',
    country: 'Iceland',
    countryCode: 'IS',
    domestic: false,
    flightHours: 3,
    flightCost: 220,
    accommodationPerNight: 160,
    dailySpend: 85,
    tripTypes: ['adventure', 'road-trip', 'walking'],
    climate: climate(
      [0, 1, 2, 4, 8, 11, 13, 12, 9, 5, 2, 0],
      [80, 70, 65, 55, 45, 45, 50, 60, 70, 85, 80, 85],
      [30, 70, 110, 155, 200, 190, 170, 155, 110, 75, 40, 20],
      Array(12).fill(0),
      [0.4, 0.5, 0.5, 0.3, 0.1, 0, 0, 0, 0, 0.1, 0.3, 0.4],
      NO_HAZARD,
    ),
  },
  {
    id: 'chamonix',
    name: 'Chamonix',
    country: 'France',
    countryCode: 'FR',
    domestic: false,
    flightHours: 2,
    flightCost: 150,
    accommodationPerNight: 175,
    dailySpend: 95,
    tripTypes: ['skiing', 'adventure', 'walking'],
    climate: climate(
      [-2, -1, 3, 7, 12, 15, 18, 17, 13, 8, 2, -1],
      [90, 80, 85, 90, 110, 120, 100, 105, 95, 100, 110, 100],
      [110, 130, 160, 175, 190, 210, 230, 210, 175, 135, 100, 95],
      Array(12).fill(0),
      [1, 1, 0.95, 0.7, 0.2, 0, 0, 0, 0, 0.2, 0.7, 1],
      NO_HAZARD,
    ),
  },
];

export const DEFAULT_PREFERENCES: Preferences = {
  weights: DEFAULT_WEIGHTS,
  preferredMonths: [],
  preferredSeasons: ['summer'],
  preferredTripLength: 7,
  minPreferredTempC: 20,
  preferShortBreaks: false,
  tripTypes: ['beach', 'city-break'],
  avoidSchoolHolidays: false,
  personalDates: [
    { date: '2026-06-14', label: 'Anniversary', kind: 'anniversary' },
    { date: '2026-09-02', label: 'Birthday', kind: 'birthday' },
  ],
};

export const DEFAULT_LEAVE: LeaveConfig = {
  allowance: 28,
  remaining: 25,
  carryOver: 3,
  reserveDays: 3,
  purchasedDays: 0,
  soldDays: 0,
  shutdowns: [{ start: '2026-12-24', end: '2026-12-31', label: 'Company shutdown' }],
  mandatoryDates: [],
  allowHalfDays: true,
};

export const DEFAULT_BUDGET: BudgetConfig = {
  currency: 'GBP',
  holidayFund: 4000,
  monthlySavings: 250,
  maxTripBudget: 2500,
};

export interface ColleagueLeave {
  colleague: string;
  start: string;
  end: string;
  status: 'approved' | 'pending' | 'rejected';
}

/** Seeded colleague availability for the calendar's "colleague leave" layer. */
export const DEMO_COLLEAGUES: ColleagueLeave[] = [
  { colleague: 'Priya', start: '2026-02-16', end: '2026-02-20', status: 'approved' },
  { colleague: 'Marcus', start: '2026-04-06', end: '2026-04-10', status: 'approved' },
  { colleague: 'Sofia', start: '2026-05-25', end: '2026-05-29', status: 'pending' },
  { colleague: 'Tom', start: '2026-07-27', end: '2026-08-07', status: 'approved' },
  { colleague: 'Aisha', start: '2026-08-31', end: '2026-09-04', status: 'approved' },
  { colleague: 'Liam', start: '2026-10-26', end: '2026-10-30', status: 'rejected' },
];

export const DEMO_TEAM = { maxSimultaneous: 2, teamSize: 8 };

// ---------------------------------------------------------------------------
// Multi-user seed data (Phase 3). Used by the web group store and server seed.
// The engine's demoInput() intentionally does NOT reference these, so the solo
// journey stays byte-identical.
// ---------------------------------------------------------------------------

export interface DemoUser {
  id: number;
  name: string;
  email: string;
}

export const DEMO_USERS: DemoUser[] = [
  { id: 1, name: 'Demo User', email: 'demo@escape-plan.app' },
  { id: 2, name: 'Sam Rivera', email: 'sam@escape-plan.app' },
  { id: 3, name: 'Priya Shah', email: 'priya@escape-plan.app' },
  { id: 4, name: 'Marcus Bell', email: 'marcus@escape-plan.app' },
  { id: 5, name: 'Sofia Marin', email: 'sofia@escape-plan.app' },
];

export const DEMO_GROUPS: Group[] = [
  { id: 'g-house', name: 'Rivera Household', type: 'household' },
  { id: 'g-team', name: 'Product Team', type: 'team' },
];

/** Max colleagues off simultaneously, per group (teams only). */
export const DEMO_GROUP_MAX: Record<string, number> = { 'g-team': 2 };

export const DEMO_MEMBERSHIPS: Membership[] = [
  { groupId: 'g-house', userId: 1, role: 'owner' },
  { groupId: 'g-house', userId: 2, role: 'member' },
  { groupId: 'g-team', userId: 3, role: 'owner' },
  { groupId: 'g-team', userId: 5, role: 'approver' },
  { groupId: 'g-team', userId: 1, role: 'member' },
  { groupId: 'g-team', userId: 4, role: 'member' },
];

// Timestamps are anchored around the app's reference "today" of 2026-07-15.
export const DEMO_INVITES: Invite[] = [
  {
    id: 'inv-1',
    groupId: 'g-house',
    email: 'alex@example.com',
    role: 'member',
    token: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    status: 'pending',
    invitedBy: 1,
    createdAt: '2026-07-10T09:00:00.000Z',
    expiresAt: '2026-07-17T09:00:00.000Z',
  },
  {
    id: 'inv-2',
    groupId: 'g-team',
    email: 'newhire@example.com',
    role: 'member',
    token: 'ffee0011223344556677889900aabbcc',
    status: 'pending',
    invitedBy: 3,
    createdAt: '2026-07-01T09:00:00.000Z',
    expiresAt: '2026-07-08T09:00:00.000Z', // already expired relative to 2026-07-15
  },
];

export const DEMO_LEAVE_REQUESTS: LeaveRequestRecord[] = [
  {
    id: 'lr-1',
    groupId: 'g-team',
    userId: 1,
    start: '2026-06-15',
    end: '2026-06-19',
    state: 'pending',
    history: [
      { state: 'requested', at: '2026-05-01T10:00:00.000Z', by: 1 },
      { state: 'pending', at: '2026-05-01T10:00:01.000Z', by: 1 },
    ],
  },
  {
    id: 'lr-2',
    groupId: 'g-team',
    userId: 4,
    start: '2026-04-06',
    end: '2026-04-10',
    state: 'approved',
    decidedBy: 3,
    decidedAt: '2026-03-02T12:00:00.000Z',
    history: [
      { state: 'requested', at: '2026-03-01T10:00:00.000Z', by: 4 },
      { state: 'approved', at: '2026-03-02T12:00:00.000Z', by: 3 },
    ],
  },
  {
    id: 'lr-3',
    groupId: 'g-team',
    userId: 5,
    start: '2026-05-25',
    end: '2026-05-29',
    state: 'rejected',
    reason: 'Team already at capacity that week',
    decidedBy: 3,
    decidedAt: '2026-04-20T12:00:00.000Z',
    history: [
      { state: 'requested', at: '2026-04-19T10:00:00.000Z', by: 5 },
      { state: 'rejected', at: '2026-04-20T12:00:00.000Z', by: 3, reason: 'Team already at capacity that week' },
    ],
  },
  {
    id: 'lr-4',
    groupId: 'g-team',
    userId: 1,
    start: '2026-09-07',
    end: '2026-09-11',
    state: 'draft',
    history: [{ state: 'draft', at: '2026-07-12T10:00:00.000Z', by: 1 }],
  },
  {
    id: 'lr-5',
    groupId: 'g-house',
    userId: 2,
    start: '2026-08-03',
    end: '2026-08-07',
    state: 'approved',
    decidedBy: 2,
    decidedAt: '2026-06-01T10:00:00.000Z',
    history: [
      { state: 'requested', at: '2026-06-01T09:59:00.000Z', by: 2 },
      { state: 'approved', at: '2026-06-01T10:00:00.000Z', by: 2 },
    ],
  },
];

export const DEMO_PLAN_SHARES: PlanShareRecord[] = [
  { id: 'sh-1', planId: 'plan-1', ownerUserId: 1, groupId: 'g-house', level: 'coedit' },
  { id: 'sh-2', planId: 'plan-2', ownerUserId: 3, groupId: 'g-team', level: 'view' },
];

export interface DemoPrivacy {
  userId: number;
  groupId: string;
  setting: PrivacySetting;
}

export const DEMO_PRIVACY: DemoPrivacy[] = [
  { userId: 1, groupId: 'g-team', setting: 'busy' },
  { userId: 4, groupId: 'g-team', setting: 'full' },
  { userId: 5, groupId: 'g-team', setting: 'private' },
];

/**
 * Derive engine group constraints for `userId` in `groupId`: the approved leave
 * of *other* members becomes colleague absences, plus the group's max-off cap.
 */
export function groupConstraint(
  groupId: string,
  userId: number,
): { colleagueLeave: DateRangeSpec[]; maxSimultaneous: number | undefined } {
  const colleagueLeave = DEMO_LEAVE_REQUESTS.filter(
    (r) => r.groupId === groupId && r.userId !== userId && r.state === 'approved',
  ).map((r) => ({ start: r.start, end: r.end, label: 'Colleague leave' }));
  return { colleagueLeave, maxSimultaneous: DEMO_GROUP_MAX[groupId] };
}

/** A ready-to-run demo input so the app is explorable on first load. */
export function demoInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    year: 2026,
    leave: DEFAULT_LEAVE,
    holidays: UK_HOLIDAYS_2026,
    blackouts: [{ start: '2026-11-23', end: '2026-11-30', label: 'Year-end freeze' }],
    schoolHolidays: [
      { start: '2026-07-22', end: '2026-09-01', label: 'Summer school holidays' },
      { start: '2026-02-14', end: '2026-02-22', label: 'February half-term' },
    ],
    weekendDays: [0, 6],
    preferences: DEFAULT_PREFERENCES,
    budget: DEFAULT_BUDGET,
    destinations: DEMO_DESTINATIONS,
    planCount: 5,
    ...overrides,
  };
}
