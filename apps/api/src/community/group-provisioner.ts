import { Injectable, NotImplementedException } from '@nestjs/common';
import { BaileysService } from '../whatsapp/baileys.service';

/**
 * Arquitetura de expansão: criação automática de grupos.
 *
 * O CommunityService depende desta interface via token de DI — quando a
 * automação for habilitada, basta implementar `createGroup` (o Baileys já
 * expõe todas as primitivas necessárias) e virar `canCreateGroups` para true.
 * Nenhum outro ponto do sistema precisa mudar.
 */
export interface GroupProvisioningRequest {
  name: string;
  description?: string;
  /** URL da foto do grupo (jpg/png). */
  pictureUrl?: string;
  /** Telefones (E.164, só dígitos) a promover como administradores. */
  adminPhones?: string[];
  capacity?: number;
  priority?: number;
}

export interface ProvisionedGroup {
  /** JID do grupo criado (xxx@g.us). */
  jid: string;
  inviteLink: string;
}

export interface GroupProvisionerCapabilities {
  canCreateGroups: boolean;
  canSetPicture: boolean;
  canSetDescription: boolean;
  canPromoteAdmins: boolean;
}

export interface GroupProvisioner {
  readonly capabilities: GroupProvisionerCapabilities;
  createGroup(request: GroupProvisioningRequest): Promise<ProvisionedGroup>;
}

export const GROUP_PROVISIONER = Symbol('GROUP_PROVISIONER');

/**
 * Implementação sobre o Baileys — DESATIVADA por decisão de produto (criar
 * grupos automaticamente ainda não foi homologado). O passo a passo abaixo é
 * o caminho pronto para quando for ativar:
 *
 *   1. `socket.groupCreate(name, [])`                    → cria e retorna o JID
 *   2. `socket.groupUpdateDescription(jid, description)` → descrição
 *   3. `socket.updateProfilePicture(jid, { url })`       → foto
 *   4. `socket.groupParticipantsUpdate(jid, phones, 'add')` + `'promote'`
 *                                                        → registra admins
 *   5. `socket.groupInviteCode(jid)`                     → link de convite
 *   6. `CommunityService.createGroup(...)`               → registra no hub
 */
@Injectable()
export class BaileysGroupProvisioner implements GroupProvisioner {
  readonly capabilities: GroupProvisionerCapabilities = {
    canCreateGroups: false,
    canSetPicture: false,
    canSetDescription: false,
    canPromoteAdmins: false,
  };

  constructor(private readonly baileys: BaileysService) {}

  createGroup(_request: GroupProvisioningRequest): Promise<ProvisionedGroup> {
    throw new NotImplementedException(
      'Criação automática de grupos ainda não está habilitada neste ambiente.',
    );
  }
}
