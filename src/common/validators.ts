export const PHONE_REGEX = /^\+[0-9]+$/;

export function validatePhoneE164(phone: string): boolean {
  return PHONE_REGEX.test(phone);
}

export function billedSeconds(connectedAt: Date | null, endedAt: Date): number {
  if (!connectedAt) return 0;
  const diffMs = endedAt.getTime() - connectedAt.getTime();
  return Math.max(0, Math.ceil(diffMs / 1000));
}

export function formatHebrewBalance(seconds: number): string {
  if (seconds <= 0) return 'לא נותרו לך דקות לשיחה';
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes === 1 && rem === 0) return 'נותרה לך דקה אחת';
  if (minutes > 0 && rem === 0) return `נותרו לך ${minutes} דקות`;
  if (minutes > 0) return `נותרו לך ${minutes} דקות ו-${rem} שניות`;
  return `נותרו לך ${rem} שניות`;
}
