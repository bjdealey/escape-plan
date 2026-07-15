import { describe, expect, it } from 'vitest';
import {
  criterionScores,
  demoInput,
  explainPlan,
  optimise,
  scorePlan,
  summariseBreaks,
} from '../src/index.js';

const input = demoInput();
const result = optimise(input);
const breaks = result.plans[0].breaks;

describe('criterionScores', () => {
  it('returns every criterion normalised to [0,1]', () => {
    const scores = criterionScores(breaks, input);
    for (const [, v] of Object.entries(scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('scorePlan', () => {
  it('produces a 0-100 score and a full weighted breakdown', () => {
    const { score, breakdown } = scorePlan(breaks, input);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(breakdown.length).toBe(7);
    for (const b of breakdown) {
      expect(b).toHaveProperty('criterion');
      expect(b.contribution).toBeCloseTo(b.weight * b.score, 6);
    }
  });

  it('falls back to an equal-weight average when all weights are zero', () => {
    const zeroWeights = demoInput({
      preferences: {
        ...input.preferences,
        weights: {
          maximiseConsecutive: 0,
          minimiseLeave: 0,
          warmWeather: 0,
          budget: 0,
          spreadEvenly: 0,
          preferenceMatch: 0,
          longWeekends: 0,
        },
      },
    });
    const { score } = scorePlan(breaks, zeroWeights);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('summariseBreaks', () => {
  it('aggregates totals consistently with the plan', () => {
    const m = summariseBreaks(breaks);
    expect(m.totalLeaveUsed).toBe(result.plans[0].totalLeaveUsed);
    expect(m.totalDaysOff).toBe(result.plans[0].totalDaysOff);
  });
});

describe('explainPlan', () => {
  it('produces a plain-language explanation and trade-offs', () => {
    const plan = result.plans[0];
    const { explanation, tradeoffs } = explainPlan(plan, input);
    expect(explanation).toMatch(/days? off/);
    expect(explanation.length).toBeGreaterThan(30);
    expect(Array.isArray(tradeoffs)).toBe(true);
  });
});
