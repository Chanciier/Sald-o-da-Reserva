'use client';

import { useEffect } from 'react';
import { AFFILIATE_SESSION_KEY } from './ref-capture';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

export function AffiliateClickRecorder({ productSlug }: { productSlug: string }) {
  useEffect(() => {
    const urlRef = new URLSearchParams(window.location.search).get('ref');
    if (!urlRef || !/^[A-Za-z0-9]{4,16}$/.test(urlRef)) return;

    const code = urlRef.toUpperCase();

    // Evita registrar o mesmo clique mais de uma vez por sessão para este produto
    const dedupeKey = `saldao_click:${code}:${productSlug}`;
    try {
      if (sessionStorage.getItem(dedupeKey)) return;
      sessionStorage.setItem(AFFILIATE_SESSION_KEY, code);
      sessionStorage.setItem(dedupeKey, '1');
    } catch {
      // ignore
    }

    fetch(`${API}/affiliates/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, productSlug }),
    }).catch(() => {});
  }, [productSlug]);

  return null;
}
