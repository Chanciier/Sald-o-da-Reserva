import type { AdminSection, SectionState } from './seller-permissions-api';

// Mapeia cada href do menu admin para a(s) seção(ões) que o controlam. Um
// href com mais de uma seção fica visível se QUALQUER uma delas estiver
// desbloqueada (mesma semântica OR usada no guard do backend). Hrefs fora
// deste mapa (Expedição, OMS, Devoluções, Estoque, Fretes, Conteúdo,
// Marketing, Logs, gestão de Vendedores/Administradores) não fazem parte do
// novo sistema de permissões e continuam ocultos para VENDEDOR, como hoje.
export const SECTION_HREF_MAP: Array<{ href: string; sections: AdminSection[] }> = [
  { href: '/admin', sections: ['DASHBOARD'] },
  { href: '/admin/produtos', sections: ['PRODUTOS'] },
  { href: '/admin/produtos/novo', sections: ['PRODUTOS_CRIAR'] },
  { href: '/admin/categorias', sections: ['PRODUTOS', 'PRODUTOS_EDITAR'] },
  { href: '/admin/cupons', sections: ['CUPONS'] },
  { href: '/admin/usuarios?role=CLIENTE', sections: ['CLIENTES'] },
  { href: '/admin/pedidos', sections: ['PEDIDOS'] },
  { href: '/admin/pedidos?status=CANCELLED', sections: ['PEDIDOS'] },
  { href: '/admin/financeiro/pagamentos', sections: ['FINANCEIRO'] },
  { href: '/admin/financeiro/notas-fiscais', sections: ['FINANCEIRO'] },
  { href: '/admin/relatorios/vendas', sections: ['VENDAS'] },
  { href: '/admin/relatorios/produtos', sections: ['RELATORIOS'] },
  { href: '/admin/relatorios/clientes', sections: ['RELATORIOS'] },
  { href: '/admin/relatorios/comportamento', sections: ['RELATORIOS'] },
  { href: '/admin/configuracoes?tab=integracoes', sections: ['CONFIGURACOES'] },
  { href: '/admin/configuracoes?tab=seguranca', sections: ['CONFIGURACOES'] },
  { href: '/admin/configuracoes?tab=sistema', sections: ['CONFIGURACOES'] },
];

export type NavVisibility = 'hidden' | 'locked' | 'open';

export function getSectionsForHref(href: string): AdminSection[] {
  return SECTION_HREF_MAP.find((e) => e.href === href)?.sections ?? [];
}

export function getNavVisibility(href: string, sections: SectionState[]): NavVisibility {
  const wanted = getSectionsForHref(href);
  if (wanted.length === 0) return 'hidden';

  const states = wanted
    .map((section) => sections.find((s) => s.section === section))
    .filter((s): s is SectionState => !!s);

  if (states.some((s) => s.unlocked)) return 'open';
  if (states.some((s) => s.mode !== 'NONE')) return 'locked';
  return 'hidden';
}
