// ⚠️ Rota temporária só para visualizar a tela de erro (error.tsx).
// force-dynamic impede o prerender no build; o erro acontece em runtime,
// onde o error boundary (error.tsx) o captura. PODE SER REMOVIDA depois de testar.
export const dynamic = 'force-dynamic';

export default function TesteErro() {
  throw new Error('Erro de teste proposital para visualizar a página de erro customizada.');
}
