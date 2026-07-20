/**
 * Pure helpers for the "why" of a break — occasion kinds and break purposes.
 * Deterministic, no I/O. Lets the planner describe leave that isn't a holiday
 * (a wedding, moving house, a rest day) rather than implying every break is a trip.
 */
import type { BreakPurpose, OccasionKind } from './types.js';

export const OCCASION_KINDS: OccasionKind[] = [
  'birthday',
  'anniversary',
  'wedding',
  'festival',
  'concert',
  'sport',
  'event',
  'family',
  'medical',
  'admin',
  'moving',
  'study',
  'rest',
];

export const OCCASION_LABELS: Record<OccasionKind, string> = {
  birthday: 'Birthday',
  anniversary: 'Anniversary',
  wedding: 'Wedding',
  festival: 'Festival',
  concert: 'Concert / gig',
  sport: 'Sporting event',
  event: 'Special event',
  family: 'Family / caring',
  medical: 'Medical appointment',
  admin: 'Life admin',
  moving: 'Moving house',
  study: 'Study / exams',
  rest: 'Rest day',
};

/** Map an occasion kind to the break purpose it produces. */
export function purposeForKind(kind: OccasionKind): BreakPurpose {
  switch (kind) {
    case 'family':
      return 'family';
    case 'medical':
    case 'admin':
    case 'moving':
    case 'study':
      return 'admin';
    case 'rest':
      return 'rest';
    default:
      // birthday, anniversary, wedding, festival, concert, sport, event
      return 'event';
  }
}

export const PURPOSE_LABELS: Record<BreakPurpose, string> = {
  getaway: 'Getaway',
  staycation: 'Staycation',
  event: 'Occasion',
  family: 'Family',
  admin: 'Life admin',
  rest: 'Rest',
};

/** Purposes that are trips (the engine suggests a destination + weather). */
export function isTravelPurpose(purpose: BreakPurpose): boolean {
  return purpose === 'getaway';
}
