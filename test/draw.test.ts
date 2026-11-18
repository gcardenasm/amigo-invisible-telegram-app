import { describe, expect, it } from 'vitest';
import { computeSecretSantaDraw } from '../src/shared/draw';

describe('computeSecretSantaDraw', () => {
  it('rechaza sorteos con menos de 3 participantes', () => {
    const res = computeSecretSantaDraw(['a', 'b'], []);
    expect(res.ok).toBe(false);
  });

  it('genera una permutación válida sin puntos fijos', () => {
    const ids = ['ana', 'beto', 'carla', 'david', 'elena'];
    const res = computeSecretSantaDraw(ids, []);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const receivers = new Set<string>();
    for (const giver of ids) {
      const receiver = res.assignments[giver];
      expect(receiver).toBeDefined();
      expect(receiver).not.toBe(giver);
      receivers.add(receiver!);
    }
    expect(receivers.size).toBe(ids.length);
  });

  it('respeta exclusiones mutuas de parejas en grupos pequeños', () => {
    // 4 personas con 2 parejas excluidas mutuamente -> solo hay 2 ciclos válidos
    const ids = ['a1', 'a2', 'b1', 'b2'];
    const exclusions = [
      { giverId: 'a1', excludedReceiverId: 'a2' },
      { giverId: 'a2', excludedReceiverId: 'a1' },
      { giverId: 'b1', excludedReceiverId: 'b2' },
      { giverId: 'b2', excludedReceiverId: 'b1' }
    ];

    for (let i = 0; i < 20; i++) {
      const res = computeSecretSantaDraw(ids, exclusions);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;

      expect(res.assignments['a1']).not.toBe('a2');
      expect(res.assignments['a2']).not.toBe('a1');
      expect(res.assignments['b1']).not.toBe('b2');
      expect(res.assignments['b2']).not.toBe('b1');
    }
  });

  it('detecta cuando las exclusiones hacen imposible el sorteo', () => {
    const ids = ['a', 'b', 'c'];
    const exclusions = [
      { giverId: 'a', excludedReceiverId: 'b' },
      { giverId: 'a', excludedReceiverId: 'c' }
    ];
    const res = computeSecretSantaDraw(ids, exclusions);
    expect(res.ok).toBe(false);
  });
});
