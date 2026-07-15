export * from './types.js';
export * from './dateutil.js';
export {
  buildCalendar,
  computeBreaks,
  generateCandidates,
  type DayInfo,
  type DayKind,
  type CandidateBreak,
} from './calendar.js';
export {
  weatherScore,
  weatherSummary,
  estimateCost,
  suggestDestination,
} from './destinations.js';
export {
  scorePlan,
  criterionScores,
  explainPlan,
  summariseBreaks,
} from './scoring.js';
export { optimise } from './optimiser.js';
export * from './fixtures.js';
