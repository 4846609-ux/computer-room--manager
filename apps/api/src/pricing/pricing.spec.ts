import { computeSessionCharge, roundMinor, toMinor } from '@crm/shared';

describe('pricing engine — session charge', () => {
  it('bills a standard computer (ratio 1) by the minute', () => {
    // 30 minutes at 0.20 NIS/min, ratio 1 => 6.00 NIS
    const charge = computeSessionCharge({
      seconds: 30 * 60,
      pricePerMinuteMinor: 20,
      ratio: 1,
      rounding: 'NONE',
    });
    expect(charge).toBe(toMinor(6));
  });

  it('applies the computer group billing ratio (scenario: ratio 2)', () => {
    // Same 30 minutes on a ratio-2 machine => 12.00 NIS
    const charge = computeSessionCharge({
      seconds: 30 * 60,
      pricePerMinuteMinor: 20,
      ratio: 2,
      rounding: 'NONE',
    });
    expect(charge).toBe(toMinor(12));
  });

  it('enforces the minimum charge', () => {
    const charge = computeSessionCharge({
      seconds: 60, // 1 minute
      pricePerMinuteMinor: 20,
      ratio: 1,
      minChargeMinor: 500, // 5 NIS floor
    });
    expect(charge).toBe(500);
  });

  it('enforces minimum billable minutes', () => {
    const charge = computeSessionCharge({
      seconds: 2 * 60, // used 2 minutes
      pricePerMinuteMinor: 20,
      ratio: 1,
      minMinutes: 10, // billed as 10 minutes => 2.00 NIS
      rounding: 'NONE',
    });
    expect(charge).toBe(toMinor(2));
  });

  it('rounds up to whole currency units when configured', () => {
    expect(roundMinor(640, 'UP')).toBe(700);
    expect(roundMinor(640, 'NEAREST')).toBe(600);
    expect(roundMinor(640, 'NONE')).toBe(640);
  });
});
