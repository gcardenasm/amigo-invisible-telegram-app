const MS_PER_DAY = 86_400_000;

export function computeDaysUntilReveal(
  revealDate: string,
  now: Date = new Date()
): number | null {
  const match = revealDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const targetUtc = Date.UTC(year, month - 1, day);
  const check = new Date(targetUtc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((targetUtc - todayUtc) / MS_PER_DAY);
}

export function formatCountdownLabel(daysLeft: number | null): string {
  if (daysLeft === null) return '';
  if (daysLeft < 0) return 'Evento pasado';
  if (daysLeft === 0) return '🎉 ¡Hoy es el día!';
  if (daysLeft === 1) return '⏰ ¡Mañana!';
  return `⏳ Faltan ${daysLeft} días`;
}

export function getAutoReminderMilestone(
  daysLeft: number | null,
  lastMilestone: number | null
): 7 | 2 | 0 | null {
  if (daysLeft === 7 && lastMilestone !== 7) return 7;
  if (daysLeft === 2 && lastMilestone !== 2) return 2;
  if (daysLeft === 0 && lastMilestone !== 0) return 0;
  return null;
}
