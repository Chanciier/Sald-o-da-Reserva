/**
 * Helpers de normalização de saída de LLM, compartilhados entre módulos do
 * Funcionário Virtual (Vision, Identification, ...). Modelos locais devolvem
 * valores "quase certos" (strings "null", CSV em vez de array, número fora do
 * range) — normaliza tudo para um formato previsível.
 */

const NULLISH_STRINGS = new Set(['null', 'n/a', 'na', 'desconhecido', 'indefinido', 'undefined']);

/** String não-vazia, ou null se ausente/placeholder textual de nulo. */
export function toStringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  if (NULLISH_STRINGS.has(t.toLowerCase())) return null;
  return t;
}

/** Array de strings sem duplicatas (case-insensitive) e sem itens vazios. Aceita CSV como fallback. */
export function toStringArray(v: unknown): string[] {
  let items: unknown[];
  if (Array.isArray(v)) items = v;
  else if (typeof v === 'string') items = v.split(',');
  else return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Número clampado em [0, 1]; 0 se ausente/inválido. */
export function toConfidence(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Número positivo finito ou null. Aceita string com moeda/pontuação BR
 * ("R$ 1.299,90" → 1299.9). Retorna null p/ 0, negativos, NaN ou vazio.
 */
export function toNumberOrNull(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') {
    n = v;
  } else if (typeof v === 'string') {
    let s = v.replace(/[^\d.,-]/g, '').trim();
    if (!s) return null;
    // Formato BR: vírgula é decimal. Remove separador de milhar e troca vírgula.
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    n = Number(s);
  } else {
    return null;
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
