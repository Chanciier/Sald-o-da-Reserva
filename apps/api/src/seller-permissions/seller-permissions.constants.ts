import { AdminSection } from '@prisma/client';

export const SECTION_LABELS: Record<AdminSection, string> = {
  DASHBOARD: 'Dashboard',
  PRODUTOS: 'Produtos',
  PRODUTOS_CRIAR: 'Criar Produto',
  PRODUTOS_EDITAR: 'Editar Produto',
  PEDIDOS: 'Pedidos',
  VENDAS: 'Vendas',
  CLIENTES: 'Clientes',
  CUPONS: 'Cupons',
  CONFIGURACOES: 'Configurações',
  RELATORIOS: 'Relatórios',
  FINANCEIRO: 'Financeiro',
};

export const ADMIN_SECTIONS: AdminSection[] = Object.values(AdminSection);

// Duração do desbloqueio de uma seção em modo "acesso com senha" após validação.
export const PASSWORD_GRANT_DURATION_MS = 8 * 60 * 60 * 1000;
