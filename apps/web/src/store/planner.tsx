import * as React from 'react';
import {
  type BudgetConfig,
  type EngineInput,
  type EngineResult,
  type GuessedLocation,
  type LeaveConfig,
  type Preferences,
  type TripType,
  type Weights,
  DEMO_DESTINATIONS,
  currencyForCountry,
  demoInput,
  holidaysForCountry,
  homeProfileForCountry,
  localiseBudget,
  localiseDestinations,
  optimise,
} from '@escape-plan/engine';
import { DEMO_COLLEAGUES, DEMO_TEAM, type ColleagueLeave } from '@escape-plan/engine';
import { detectLocaleLocation, detectServerLocation } from '@/lib/detectLocation';

const INPUT_KEY = 'escape-plan-input';
const ONBOARD_KEY = 'escape-plan-onboarded';
const SELECTED_KEY = 'escape-plan-selected';

const DEFAULT_PLAN_ID = 'plan-1';

interface PlannerContextValue {
  input: EngineInput;
  result: EngineResult;
  colleagues: ColleagueLeave[];
  team: typeof DEMO_TEAM;
  onboarded: boolean;
  selectedPlanId: string;
  aiEnabled: boolean;
  /** Best-effort location guess from the device locale (overridable). */
  detectedLocation: GuessedLocation;
  /** The home country currently driving currency + local (staycation) weather. */
  homeCountry: string;
  setHomeCountry: (countryCode: string) => void;
  /** Change the plan currency, converting all amounts (not just the symbol). */
  setCurrency: (currency: string) => void;
  setSelectedPlanId: (id: string) => void;
  setOnboarded: (v: boolean) => void;
  setAiEnabled: (v: boolean) => void;
  updateLeave: (patch: Partial<LeaveConfig>) => void;
  updateBudget: (patch: Partial<BudgetConfig>) => void;
  updatePreferences: (patch: Partial<Preferences>) => void;
  updateWeights: (patch: Partial<Weights>) => void;
  toggleTripType: (t: TripType) => void;
  reset: () => void;
}

const PlannerContext = React.createContext<PlannerContextValue | null>(null);

const detected = detectLocaleLocation();

/** Ensure an input carries a home profile (feature migration for old data). */
function withHome(input: EngineInput, countryCode = detected.countryCode): EngineInput {
  return input.home ? input : { ...input, home: homeProfileForCountry(countryCode) };
}

/**
 * Re-denominate an input into `toCurrency`. Budget amounts convert from their
 * current currency (preserving user edits); destination costs are re-derived
 * from the canonical GBP fixtures so the numbers can never drift or compound.
 */
function applyCurrency(input: EngineInput, toCurrency: string): EngineInput {
  return {
    ...input,
    budget: localiseBudget(input.budget, toCurrency),
    destinations: localiseDestinations(DEMO_DESTINATIONS, 'GBP', toCurrency),
  };
}

/**
 * Re-home an input to a country: swap the local climate, the public holidays
 * that drive bridging, and the currency (converting amounts). Holidays follow
 * the *resolved* home country so they always match the home shown in the UI.
 */
function applyHome(input: EngineInput, countryCode: string): EngineInput {
  const home = homeProfileForCountry(countryCode);
  return {
    ...applyCurrency(input, currencyForCountry(countryCode)),
    home,
    holidays: holidaysForCountry(home.countryCode),
  };
}

function loadInput(): { input: EngineInput; fresh: boolean } {
  try {
    const raw = localStorage.getItem(INPUT_KEY);
    if (raw) {
      const parsed = withHome(JSON.parse(raw) as EngineInput);
      // Self-heal: re-derive destination costs and holidays from the canonical
      // per-country data in case they were stored before conversion / per-
      // country holidays existed.
      return {
        input: {
          ...parsed,
          destinations: localiseDestinations(DEMO_DESTINATIONS, 'GBP', parsed.budget.currency),
          holidays: holidaysForCountry(parsed.home?.countryCode ?? detected.countryCode),
        },
        fresh: false,
      };
    }
  } catch {
    /* ignore */
  }
  // Fresh user: home the demo input to the detected country so budget/costs are
  // real converted amounts and the holidays match the user's country.
  return {
    input: applyHome(demoInput(), detected.countryCode),
    fresh: true,
  };
}

export function PlannerProvider({ children }: { children: React.ReactNode }) {
  const initial = React.useRef(loadInput());
  const [input, setInput] = React.useState<EngineInput>(initial.current.input);
  const [onboarded, setOnboardedState] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARD_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [selectedPlanId, setSelectedPlanId] = React.useState<string>(() => {
    try {
      return localStorage.getItem(SELECTED_KEY) ?? DEFAULT_PLAN_ID;
    } catch {
      return DEFAULT_PLAN_ID;
    }
  });
  const [aiEnabled, setAiEnabled] = React.useState(false);

  const result = React.useMemo(() => optimise(input), [input]);

  React.useEffect(() => {
    try {
      localStorage.setItem(INPUT_KEY, JSON.stringify(input));
    } catch {
      /* ignore */
    }
  }, [input]);

  // Persist the user's committed plan so a return visit keeps their choice
  // instead of silently resetting to plan-1.
  React.useEffect(() => {
    try {
      localStorage.setItem(SELECTED_KEY, selectedPlanId);
    } catch {
      /* ignore */
    }
  }, [selectedPlanId]);

  // Progressive enhancement: if the server offers IP geolocation, refine a
  // fresh user's guess — but only while they haven't overridden it themselves.
  React.useEffect(() => {
    if (!initial.current.fresh) return;
    let cancelled = false;
    detectServerLocation().then((loc) => {
      if (cancelled || !loc) return;
      setInput((prev) => {
        if (prev.budget.currency !== detected.currency) return prev; // user changed it
        if (prev.home?.countryCode === loc.countryCode) return prev;
        return applyHome(prev, loc.countryCode);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setOnboarded = React.useCallback((v: boolean) => {
    setOnboardedState(v);
    try {
      localStorage.setItem(ONBOARD_KEY, String(v));
    } catch {
      /* ignore */
    }
  }, []);

  const value = React.useMemo<PlannerContextValue>(
    () => ({
      input,
      result,
      colleagues: DEMO_COLLEAGUES,
      team: DEMO_TEAM,
      onboarded,
      selectedPlanId,
      aiEnabled,
      detectedLocation: detected,
      homeCountry: input.home?.countryCode ?? detected.countryCode,
      setHomeCountry: (countryCode) => setInput((prev) => applyHome(prev, countryCode)),
      setCurrency: (currency) => setInput((prev) => applyCurrency(prev, currency)),
      setSelectedPlanId,
      setOnboarded,
      setAiEnabled,
      updateLeave: (patch) =>
        setInput((prev) => ({ ...prev, leave: { ...prev.leave, ...patch } })),
      updateBudget: (patch) =>
        setInput((prev) => ({ ...prev, budget: { ...prev.budget, ...patch } })),
      updatePreferences: (patch) =>
        setInput((prev) => ({
          ...prev,
          preferences: { ...prev.preferences, ...patch },
        })),
      updateWeights: (patch) =>
        setInput((prev) => ({
          ...prev,
          preferences: {
            ...prev.preferences,
            weights: { ...prev.preferences.weights, ...patch },
          },
        })),
      toggleTripType: (t) =>
        setInput((prev) => {
          const has = prev.preferences.tripTypes.includes(t);
          return {
            ...prev,
            preferences: {
              ...prev.preferences,
              tripTypes: has
                ? prev.preferences.tripTypes.filter((x) => x !== t)
                : [...prev.preferences.tripTypes, t],
            },
          };
        }),
      reset: () => {
        setInput(applyHome(demoInput(), detected.countryCode));
        setOnboarded(false);
        setSelectedPlanId(DEFAULT_PLAN_ID);
      },
    }),
    [input, result, onboarded, selectedPlanId, aiEnabled, setOnboarded],
  );

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlanner(): PlannerContextValue {
  const ctx = React.useContext(PlannerContext);
  if (!ctx) throw new Error('usePlanner must be used within PlannerProvider');
  return ctx;
}
