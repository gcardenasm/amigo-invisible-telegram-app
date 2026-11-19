import { describe, expect, it } from 'vitest';
import {
  computeDaysUntilReveal,
  formatCountdownLabel,
  getAutoReminderMilestone
} from '../src/shared/countdown';

describe('countdown helpers', () => {
  it('calcula los días restantes en UTC de forma exacta', () => {
    const now = new Date('2026-12-17T22:30:00Z');
    expect(computeDaysUntilReveal('2026-12-24', now)).toBe(7);
    expect(computeDaysUntilReveal('2026-12-18', now)).toBe(1);
    expect(computeDaysUntilReveal('2026-12-17', now)).toBe(0);
    expect(computeDaysUntilReveal('2026-12-16', now)).toBe(-1);
  });

  it('devuelve null ante fechas inválidas', () => {
    expect(computeDaysUntilReveal('2026-02-31')).toBeNull();
    expect(computeDaysUntilReveal('invalida')).toBeNull();
  });

  it('formatea etiquetas legibles de cuenta atrás', () => {
    expect(formatCountdownLabel(5)).toBe('⏳ Faltan 5 días');
    expect(formatCountdownLabel(1)).toBe('⏰ ¡Mañana!');
    expect(formatCountdownLabel(0)).toBe('🎉 ¡Hoy es el día!');
    expect(formatCountdownLabel(-2)).toBe('Evento pasado');
    expect(formatCountdownLabel(null)).toBe('');
  });

  it('determina hitos de recordatorio evitando duplicados', () => {
    expect(getAutoReminderMilestone(7, null)).toBe(7);
    expect(getAutoReminderMilestone(7, 7)).toBeNull();
    expect(getAutoReminderMilestone(2, 7)).toBe(2);
    expect(getAutoReminderMilestone(2, 2)).toBeNull();
    expect(getAutoReminderMilestone(0, 2)).toBe(0);
    expect(getAutoReminderMilestone(0, 0)).toBeNull();
    expect(getAutoReminderMilestone(4, null)).toBeNull();
  });
});
