import type { DrawResult, ExclusionRule } from './types';

function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Calcula una asignación válida de Amigo Invisible (permutación sin puntos fijos)
 * respetando todas las reglas de exclusión mediante backtracking con heurística MRV.
 */
export function computeSecretSantaDraw(
  participantIds: string[],
  exclusions: ExclusionRule[],
  rng: () => number = Math.random
): DrawResult {
  const uniqueIds = Array.from(new Set(participantIds));
  const n = uniqueIds.length;

  if (n < 3) {
    return {
      ok: false,
      error: 'Se necesitan al menos 3 participantes para realizar el sorteo de Amigo Invisible.'
    };
  }

  const forbiddenByGiver = new Map<string, Set<string>>();
  for (const id of uniqueIds) {
    forbiddenByGiver.set(id, new Set([id]));
  }
  for (const rule of exclusions) {
    forbiddenByGiver.get(rule.giverId)?.add(rule.excludedReceiverId);
  }

  // Lista de posibles receptores aleatorizada para cada participante
  const candidatesByGiver = new Map<string, string[]>();
  for (const giver of uniqueIds) {
    const forbidden = forbiddenByGiver.get(giver)!;
    const allowed = shuffle(
      uniqueIds.filter((candidate) => !forbidden.has(candidate)),
      rng
    );
    if (allowed.length === 0) {
      return {
        ok: false,
        error: 'Las exclusiones actuales dejan a un participante sin opciones posibles. Revisa las exclusiones.'
      };
    }
    candidatesByGiver.set(giver, allowed);
  }

  // Verificación rápida de cobertura de receptores (todo receptor debe poder ser elegido por alguien)
  for (const receiver of uniqueIds) {
    const hasPotentialGiver = uniqueIds.some(
      (giver) => !forbiddenByGiver.get(giver)!.has(receiver)
    );
    if (!hasPotentialGiver) {
      return {
        ok: false,
        error: 'Las exclusiones actuales impiden que uno de los participantes pueda recibir regalo.'
      };
    }
  }

  const assignments: Record<string, string> = {};
  const usedReceivers = new Set<string>();
  const unassigned = new Set<string>(uniqueIds);

  let steps = 0;
  const maxSteps = 100_000;

  function backtrack(): boolean {
    if (unassigned.size === 0) {
      return true;
    }
    steps++;
    if (steps > maxSteps) {
      return false;
    }

    // Heurística MRV: elegir al participante restante con menos opciones disponibles
    let bestGiver: string | null = null;
    let bestOptions: string[] = [];

    for (const giver of unassigned) {
      const available = candidatesByGiver
        .get(giver)!
        .filter((receiver) => !usedReceivers.has(receiver));

      if (available.length === 0) {
        return false; // Poda inmediata
      }

      if (bestGiver === null || available.length < bestOptions.length) {
        bestGiver = giver;
        bestOptions = available;
        if (bestOptions.length === 1) break;
      }
    }

    if (bestGiver === null) {
      return false;
    }

    unassigned.delete(bestGiver);
    for (const receiver of bestOptions) {
      assignments[bestGiver] = receiver;
      usedReceivers.add(receiver);

      if (backtrack()) {
        return true;
      }

      usedReceivers.delete(receiver);
      delete assignments[bestGiver];
    }
    unassigned.add(bestGiver);

    return false;
  }

  const solved = backtrack();
  if (!solved) {
    return {
      ok: false,
      error:
        'No existe una combinación válida con las exclusiones actuales. Prueba a eliminar alguna exclusión o añadir más participantes.'
    };
  }

  return { ok: true, assignments };
}
