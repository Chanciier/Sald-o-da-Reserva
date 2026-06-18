'use client';

import { useEffect } from 'react';

export const AFFILIATE_COOKIE = 'saldao_ref';
const MAX_AGE_DAYS = 30;

/**
 * Lê ?ref=CODIGO da URL ao carregar a página e grava num cookie (last-click, 30 dias).
 * Montado no layout raiz — captura o código em qualquer página de entrada.
 */
export function AffiliateRefCapture() {
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && /^[A-Za-z0-9]{4,16}$/.test(ref)) {
      const maxAge = MAX_AGE_DAYS * 24 * 60 * 60;
      document.cookie = `${AFFILIATE_COOKIE}=${ref.toUpperCase()}; path=/; max-age=${maxAge}; samesite=lax`;
    }
  }, []);

  return null;
}

export function getAffiliateRef(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${AFFILIATE_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}
