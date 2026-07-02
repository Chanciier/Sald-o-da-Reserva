/**
 * Parser tolerante de JSON para respostas de LLM. Modelos às vezes cercam o
 * JSON com texto explicativo ou blocos de código markdown mesmo quando
 * instruídos a responder só com JSON — tenta na ordem: texto puro, bloco
 * ```json ... ```, e o primeiro trecho {...} encontrado.
 */
export function extractJsonObject<T = Record<string, unknown>>(text: string): T | null {
  const attempts = [
    text,
    text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)?.[1],
    text.match(/\{[\s\S]*\}/)?.[0],
  ].filter(Boolean) as string[];

  for (const attempt of attempts) {
    try {
      const data = JSON.parse(attempt) as T;
      if (data && typeof data === 'object') return data;
    } catch {
      continue;
    }
  }
  return null;
}
