import { CommunityGroupStatus } from '@prisma/client';

/**
 * Lógica pura de distribuição de novos membros entre grupos — separada do
 * service para ser testável sem Nest/Prisma/Redis.
 */
export interface DistributableGroup {
  id: string;
  name: string;
  inviteLink: string;
  capacity: number;
  /** Último total sincronizado (banco). */
  participants: number;
  /** Redirecionados desde a última sync (contador otimista no Redis). */
  pending: number;
  priority: number;
  status: CommunityGroupStatus;
  active: boolean;
  createdAt: string | Date;
}

/** Ocupação efetiva: sincronizado + redirecionados ainda não refletidos. */
export function effectiveParticipants(group: Pick<DistributableGroup, 'participants' | 'pending'>) {
  return group.participants + group.pending;
}

export function occupancyRatio(
  group: Pick<DistributableGroup, 'participants' | 'pending' | 'capacity'>,
): number {
  if (group.capacity <= 0) return 1;
  return effectiveParticipants(group) / group.capacity;
}

/**
 * Escolhe o grupo para um novo membro:
 *
 *  - só grupos ativos, não pausados/arquivados e com vaga (ocupação efetiva
 *    abaixo da capacidade) — nunca envia para grupo lotado;
 *  - prefere o de MENOR ocupação percentual, mantendo todos equilibrados;
 *  - empate: maior prioridade → mais vagas livres → mais antigo.
 *
 * Retorna null quando todos estão lotados/indisponíveis.
 */
export function pickGroupForNewMember(groups: DistributableGroup[]): DistributableGroup | null {
  const eligible = groups.filter(
    (g) =>
      g.active &&
      g.status !== CommunityGroupStatus.PAUSED &&
      g.status !== CommunityGroupStatus.ARCHIVED &&
      g.capacity > 0 &&
      effectiveParticipants(g) < g.capacity,
  );
  if (eligible.length === 0) return null;

  return eligible.reduce((best, candidate) => {
    const byOccupancy = occupancyRatio(candidate) - occupancyRatio(best);
    if (byOccupancy !== 0) return byOccupancy < 0 ? candidate : best;

    if (candidate.priority !== best.priority) {
      return candidate.priority > best.priority ? candidate : best;
    }

    const candidateFree = candidate.capacity - effectiveParticipants(candidate);
    const bestFree = best.capacity - effectiveParticipants(best);
    if (candidateFree !== bestFree) return candidateFree > bestFree ? candidate : best;

    return new Date(candidate.createdAt) < new Date(best.createdAt) ? candidate : best;
  });
}
