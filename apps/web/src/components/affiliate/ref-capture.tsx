'use client';

import { useEffect } from 'react';

export const AFFILIATE_SESSION_KEY = 'saldao_ref';

/**
 * Lê ?ref=CODIGO da URL e salva em sessionStorage (dura apenas a sessão do browser).
 * Montado no layout raiz — captura o código em qualquer página de entrada.
 */
export function AffiliateRefCapture() {
  useEffect(() => {
    const urlRef = new URLSearchParams(window.location.search).get('ref');
    if (urlRef && /^[A-Za-z0-9]{4,16}$/.test(urlRef)) {
      try {
        sessionStorage.setItem(AFFILIATE_SESSION_KEY, urlRef.toUpperCase());
      } catch {
        // ignore se sessionStorage indisponível
      }
    }
  }, []);

  return null;
}

export function getAffiliateRef(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return sessionStorage.getItem(AFFILIATE_SESSION_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
