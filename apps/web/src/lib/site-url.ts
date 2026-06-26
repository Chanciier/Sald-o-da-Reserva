// URL base pública do site. Remove BOM e caracteres invisíveis (zero-width) que
// às vezes vêm colados na env var NEXT_PUBLIC_SITE_URL (ex.: copy/paste) e
// quebram `new URL()` durante o build da Vercel (ERR_INVALID_URL).
const FALLBACK = 'https://saldaodareversa.com';

function stripInvisible(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    // BOM (FEFF), zero-width space/non-joiner/joiner (200B–200D), word joiner (2060)
    const invisible = code === 0xfeff || (code >= 0x200b && code <= 0x200d) || code === 0x2060;
    if (!invisible) out += ch;
  }
  return out.trim();
}

export const SITE_URL = stripInvisible(process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK) || FALLBACK;
