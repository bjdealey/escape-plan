import * as React from 'react';
import {
  type BudgetConfig,
  type EngineInput,
  type EngineResult,
  type LeaveConfig,
  type Preferences,
  type TripType,
  type Weights,
  demoInput,
  optimise,
} from '@escape-plan/engine';
import { DEMO_COLLEAGUES, DEMO_TEAM, type ColleagueLeave } from '@escape-plan/engine';

const INPUT_KEY = 'escape-plan-input';
const ONBOARD_KEY = 'escape-plan-onboarded';

interface PlannerContextValue {
  input: EngineInput;
  result: EngineResult;
  colleagues: ColleagueLeave[];
  team: typeof DEMO_TEAM;
  onboarded: boolean;
  selectedPlanId: string;
  aiEnabled: boolean;
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

function loadInput(): EngineInput {
  try {
    const raw = localStorage.getItem(INPUT_KEY);
    if (raw) return JSON.parse(raw) as EngineInput;
  } catch {
    /* ignore */
  }
  return demoInput();
}

export function PlannerProvider({ children }: { children: React.ReactNode }) {
  const [input, setInput] = React.useState<EngineInput>(loadInput);
  const [onboarded, setOnboardedState] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARD_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [selectedPlanId, setSelectedPlanId] = React.useState('plan-1');
  const [aiEnabled, setAiEnabled] = React.useState(false);

  const result = React.useMemo(() => optimise(input), [input]);

  React.useEffect(() => {
    try {
      localStorage.setItem(INPUT_KEY, JSON.stringify(input));
    } catch {
      /* ignore */
    }
  }, [input]);

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
        setInput(demoInput());
        setOnboarded(false);
        setSelectedPlanId('plan-1');
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
