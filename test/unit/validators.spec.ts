import { billedSeconds, formatHebrewBalance, validatePhoneE164 } from '../../src/common/validators';

describe('validators', () => {
  it('validates phone_e164 format', () => {
    expect(validatePhoneE164('+972501234567')).toBe(true);
    expect(validatePhoneE164('972501234567')).toBe(false);
    expect(validatePhoneE164('+972-50')).toBe(false);
  });

  it('formats Hebrew balance', () => {
    expect(formatHebrewBalance(0)).toBe('לא נותרו לך דקות לשיחה');
    expect(formatHebrewBalance(60)).toBe('נותרה לך דקה אחת');
    expect(formatHebrewBalance(120)).toBe('נותרו לך 2 דקות');
    expect(formatHebrewBalance(287)).toBe('נותרו לך 4 דקות ו-47 שניות');
    expect(formatHebrewBalance(59)).toBe('נותרו לך 59 שניות');
  });

  it('calculates billed seconds and caps externally', () => {
    const connected = new Date('2026-03-16T09:00:00.000Z');
    const ended = new Date('2026-03-16T09:00:10.001Z');
    expect(billedSeconds(connected, ended)).toBe(11);
    expect(billedSeconds(null, ended)).toBe(0);
  });
});
