import { describe, expect, it } from 'vitest';
import {
  DEMO_DESTINATIONS,
  DEFAULT_BUDGET,
  convertAmount,
  exchangeRate,
  localiseBudget,
  localiseDestinations,
} from '../src/index.js';

describe('currency conversion', () => {
  it('is identity for the same currency', () => {
    expect(exchangeRate('USD', 'USD')).toBe(1);
    expect(convertAmount(1234, 'GBP', 'GBP')).toBe(1234);
  });

  it('converts GBP to USD using the reference rate', () => {
    // 1000 GBP * 1.27 = 1270
    expect(convertAmount(1000, 'GBP', 'USD')).toBe(1270);
  });

  it('round-trips approximately via a cross-rate', () => {
    const usd = convertAmount(2500, 'GBP', 'USD');
    const backToGbp = convertAmount(usd, 'USD', 'GBP');
    expect(Math.abs(backToGbp - 2500)).toBeLessThanOrEqual(1); // rounding only
  });

  it('never fabricates a rate for an unknown currency', () => {
    expect(exchangeRate('GBP', 'XYZ')).toBe(1);
    expect(convertAmount(500, 'XYZ', 'USD')).toBe(500);
  });

  it('localises a budget and stamps the new currency, preserving edits', () => {
    const edited = { ...DEFAULT_BUDGET, maxTripBudget: 3000 };
    const usd = localiseBudget(edited, 'USD');
    expect(usd.currency).toBe('USD');
    expect(usd.maxTripBudget).toBe(convertAmount(3000, 'GBP', 'USD'));
    expect(usd.holidayFund).toBe(convertAmount(DEFAULT_BUDGET.holidayFund, 'GBP', 'USD'));
  });

  it('re-denominates destination costs so nothing is a relabelled GBP figure', () => {
    const eur = localiseDestinations(DEMO_DESTINATIONS, 'GBP', 'EUR');
    const cornwall = DEMO_DESTINATIONS[0];
    const cornwallEur = eur[0];
    expect(cornwallEur.accommodationPerNight).toBe(
      convertAmount(cornwall.accommodationPerNight, 'GBP', 'EUR'),
    );
    // A non-zero GBP cost must actually change under conversion.
    const paid = DEMO_DESTINATIONS.find((d) => d.flightCost > 0)!;
    const paidEur = eur.find((d) => d.id === paid.id)!;
    expect(paidEur.flightCost).not.toBe(paid.flightCost);
  });
});
