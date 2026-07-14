import { CommunityGroupStatus } from '@prisma/client';
import { DistributableGroup, pickGroupForNewMember } from './distribution';

function group(overrides: Partial<DistributableGroup> = {}): DistributableGroup {
  return {
    id: 'g1',
    name: 'Grupo 1',
    inviteLink: 'https://chat.whatsapp.com/AAA',
    capacity: 100,
    participants: 0,
    pending: 0,
    priority: 0,
    status: CommunityGroupStatus.ACTIVE,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('pickGroupForNewMember', () => {
  it('escolhe o grupo com menor ocupação percentual', () => {
    const picked = pickGroupForNewMember([
      group({ id: 'a', participants: 80 }),
      group({ id: 'b', participants: 20 }),
      group({ id: 'c', participants: 50 }),
    ]);
    expect(picked?.id).toBe('b');
  });

  it('equilibra por percentual, não por número absoluto', () => {
    const picked = pickGroupForNewMember([
      // 100/1000 = 10%
      group({ id: 'a', capacity: 1000, participants: 100 }),
      // 10/20 = 50%
      group({ id: 'b', capacity: 20, participants: 10 }),
    ]);
    expect(picked?.id).toBe('a');
  });

  it('nunca envia para grupo lotado', () => {
    const picked = pickGroupForNewMember([
      group({ id: 'cheio', capacity: 50, participants: 50 }),
      group({ id: 'livre', capacity: 50, participants: 49 }),
    ]);
    expect(picked?.id).toBe('livre');
  });

  it('considera os redirecionados pendentes na lotação', () => {
    const picked = pickGroupForNewMember([
      // 45 sincronizados + 5 redirecionados = lotado
      group({ id: 'quase-cheio', capacity: 50, participants: 45, pending: 5 }),
      group({ id: 'livre', capacity: 50, participants: 46, pending: 0 }),
    ]);
    expect(picked?.id).toBe('livre');
  });

  it('retorna o único grupo disponível', () => {
    const picked = pickGroupForNewMember([group({ id: 'unico', participants: 99 })]);
    expect(picked?.id).toBe('unico');
  });

  it('retorna null quando todos estão lotados', () => {
    const picked = pickGroupForNewMember([
      group({ id: 'a', capacity: 10, participants: 10 }),
      group({ id: 'b', capacity: 10, participants: 12 }),
    ]);
    expect(picked).toBeNull();
  });

  it('ignora grupos inativos, pausados e arquivados', () => {
    const picked = pickGroupForNewMember([
      group({ id: 'inativo', active: false }),
      group({ id: 'pausado', status: CommunityGroupStatus.PAUSED }),
      group({ id: 'arquivado', status: CommunityGroupStatus.ARCHIVED }),
      group({ id: 'valido', participants: 90 }),
    ]);
    expect(picked?.id).toBe('valido');
  });

  it('grupo FULL volta a receber quando a ocupação abre vaga', () => {
    // status FULL ficou para trás (ex.: capacidade aumentada pelo admin);
    // a elegibilidade olha os números, não o rótulo.
    const picked = pickGroupForNewMember([
      group({
        id: 'reaberto',
        status: CommunityGroupStatus.FULL,
        capacity: 200,
        participants: 100,
      }),
    ]);
    expect(picked?.id).toBe('reaberto');
  });

  it('desempata por prioridade e depois por vagas livres', () => {
    const byPriority = pickGroupForNewMember([
      group({ id: 'baixa', participants: 50, priority: 0 }),
      group({ id: 'alta', participants: 50, priority: 10 }),
    ]);
    expect(byPriority?.id).toBe('alta');

    const byFreeSlots = pickGroupForNewMember([
      // mesma ocupação (50%) e prioridade — vence quem tem mais vagas livres
      group({ id: 'menor', capacity: 100, participants: 50 }),
      group({ id: 'maior', capacity: 1000, participants: 500 }),
    ]);
    expect(byFreeSlots?.id).toBe('maior');
  });

  it('retorna null para lista vazia', () => {
    expect(pickGroupForNewMember([])).toBeNull();
  });
});
