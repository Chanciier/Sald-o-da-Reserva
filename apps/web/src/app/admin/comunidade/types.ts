export type CommunityGroupStatus = 'ACTIVE' | 'FULL' | 'PAUSED' | 'ARCHIVED';

export interface CommunityGroup {
  id: string;
  name: string;
  groupJid: string | null;
  inviteLink: string;
  status: CommunityGroupStatus;
  capacity: number;
  participants: number;
  priority: number;
  active: boolean;
  lastSyncAt: string | null;
  syncError: string | null;
  createdAt: string;
  pendingJoins: number;
  occupancyPct: number;
}

export interface SyncSummary {
  connected: boolean;
  synced: number;
  notFound: number;
  unlinked: number;
  errors: number;
  finishedAt: string;
}

export interface DashboardResponse {
  recommendedGroupId: string | null;
  whatsappConnected: boolean;
  lastSync: SyncSummary | null;
  provisioner: {
    canCreateGroups: boolean;
    canSetPicture: boolean;
    canSetDescription: boolean;
    canPromoteAdmins: boolean;
  };
  groups: CommunityGroup[];
}

export interface WaGroup {
  id: string;
  subject: string;
  size: number;
}

export interface AnalyticsResponse {
  period: { days: number; since: string; timeZone: string };
  totals: {
    accesses: number;
    redirected: number;
    allFull: number;
    joins: number;
    leaves: number;
    netMembers: number;
  };
  byDay: {
    date: string;
    accesses: number;
    redirected: number;
    allFull: number;
    joins: number;
    leaves: number;
    netMembers: number;
  }[];
  byGroup: { groupId: string; name: string; redirects: number }[];
  bySource: { source: string; accesses: number; redirected: number }[];
  membersByGroup: {
    groupId: string;
    name: string;
    joins: number;
    leaves: number;
    netMembers: number;
  }[];
  memberSources: { source: string; joins: number; leaves: number; netMembers: number }[];
  growth: { groupId: string; name: string; participants: number; capturedAt: string }[];
}

export const STATUS_LABEL: Record<CommunityGroupStatus, string> = {
  ACTIVE: 'Ativo',
  FULL: 'Lotado',
  PAUSED: 'Pausado',
  ARCHIVED: 'Arquivado',
};

export const STATUS_STYLE: Record<CommunityGroupStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  FULL: 'bg-red-100 text-red-700',
  PAUSED: 'bg-amber-100 text-amber-700',
  ARCHIVED: 'bg-gray-200 text-gray-600',
};
