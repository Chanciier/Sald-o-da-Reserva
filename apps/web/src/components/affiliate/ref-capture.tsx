'use client';

import { useEffect } from 'react';

export const AFFILIATE_COOKIE = 'saldao_ref';
const MAX_AGE_DAYS = 30;

// Mesma chave usada em auth-context.tsx para persistir o access token.
const ACCESS_KEY = 'saldao:access';
const TRACK_FLAG_PREFIX = 'saldao_ref_tracked:';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

/**
 * Lê ?ref=CODIGO da URL ao carregar a página e grava num cookie (last-click, 30 dias).
 * Montado no layout raiz — captura o código em qualquer página de entrada.
 *
 * Além disso, se já houver um ref (cookie ou URL) E o usuário estiver autenticado,
 * registra o clique no backend (POST /affiliates/track) uma única vez por código,
 * controlado por sessionStorage para não repetir.
 */
export function AffiliateRefCapture() {
  useEffect(() => {
    // 1) Captura por cookie (last-click)
    const urlRef = new URLSearchParams(window.location.search).get('ref');
    if (urlRef && /^[A-Za-z0-9]{4,16}$/.test(urlRef)) {
      const maxAge = MAX_AGE_DAYS * 24 * 60 * 60;
      document.cookie = `${AFFILIATE_COOKIE}=${urlRef.toUpperCase()}; path=/; max-age=${maxAge}; samesite=lax`;
    }

    // 2) Registra o clique no backend, se autenticado
    const code = getAffiliateRef();
    if (!code) return;

    let token: string | null = null;
    try {
      token = localStorage.getItem(ACCESS_KEY);
    } catch {
      token = null;
    }
    if (!token) return;

    const flagKey = `${TRACK_FLAG_PREFIX}${code}`;
    try {
      if (sessionStorage.getItem(flagKey)) return;
    } catch {
      // sessionStorage indisponível — segue tentando, sem deduplicar
    }

    fetch(`${API}/affiliates/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code }),
    })
      .then((res) => {
        if (res.ok) {
          try {
            sessionStorage.setItem(flagKey, '1');
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {
        // silencioso — tracking não deve quebrar a navegação
      });
  }, []);

  return null;
}

export function getAffiliateRef(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${AFFILIATE_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}
