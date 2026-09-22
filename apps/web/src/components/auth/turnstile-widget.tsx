'use client';

import { useEffect, useRef } from 'react';

interface Props {
  onToken: (token: string) => void;
}

// Renderização explícita: injeta o widget uma vez num container próprio pra
// o React nunca reconciliar (e apagar) o widget. O auto-render implícito
// (.cf-turnstile) quebra a cada re-render ("Cannot find Widget").
export function TurnstileWidget({ onToken }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) return;

    type TS = {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
    const getTs = () => (window as unknown as { turnstile?: TS }).turnstile;

    function renderWidget() {
      const ts = getTs();
      if (!ts || !containerRef.current || widgetIdRef.current) return;
      widgetIdRef.current = ts.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onToken(token),
        // Token expira em ~5 min. Em vez de só limpar, pega um novo na hora —
        // evita "token obrigatório" para quem demora a preencher o formulário.
        'expired-callback': () => {
          onToken('');
          const t = getTs();
          if (t && widgetIdRef.current) t.reset(widgetIdRef.current);
        },
        'error-callback': () => onToken(''),
        'refresh-expired': 'auto',
        retry: 'auto',
        'retry-interval': 8000,
        theme: 'auto',
      });
    }

    (window as unknown as Record<string, unknown>).__tsRender = renderWidget;

    if (getTs()) {
      renderWidget();
    } else if (!document.getElementById('cf-ts-script')) {
      const script = document.createElement('script');
      script.id = 'cf-ts-script';
      script.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__tsRender';
      script.async = true;
      document.head.appendChild(script);
    }

    return () => {
      const ts = getTs();
      if (ts && widgetIdRef.current) {
        try {
          ts.remove(widgetIdRef.current);
        } catch {
          /* widget já removido */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
