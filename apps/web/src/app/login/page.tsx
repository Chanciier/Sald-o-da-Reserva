'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';

function generateCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a + b };
}

export default function LoginPage() {
  const { login, register } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [captcha, setCaptcha] = useState(generateCaptcha);
  const [captchaInput, setCaptchaInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (mode === 'register') {
      setCaptcha(generateCaptcha());
      setCaptchaInput('');
    }
  }, [mode]);

  // Explicit Turnstile render: render once into a ref'd container so React never
  // reconciles (and wipes) the injected widget. The implicit `.cf-turnstile`
  // auto-render breaks on every re-render ("Cannot find Widget").
  useEffect(() => {
    if (!turnstileSiteKey) return;

    type TS = {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
    const getTs = () => (window as unknown as { turnstile?: TS }).turnstile;

    function renderWidget() {
      const ts = getTs();
      if (!ts || !turnstileRef.current || widgetIdRef.current) return;
      widgetIdRef.current = ts.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => setTurnstileToken(token),
        // Token expira em ~5 min. Em vez de só limpar, pega um novo na hora —
        // evita "token obrigatório" para quem demora a preencher o cadastro.
        'expired-callback': () => {
          setTurnstileToken('');
          const t = getTs();
          if (t && widgetIdRef.current) t.reset(widgetIdRef.current);
        },
        'error-callback': () => setTurnstileToken(''),
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
  }, [turnstileSiteKey]);

  const passwordMismatch =
    mode === 'register' && confirmPassword.length > 0 && password !== confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('As senhas não coincidem.');
        return;
      }
      if (parseInt(captchaInput, 10) !== captcha.answer) {
        setError('Resposta incorreta. Tente novamente.');
        setCaptcha(generateCaptcha());
        setCaptchaInput('');
        return;
      }
    }

    if (turnstileSiteKey && !turnstileToken) {
      setError('Complete a verificação de segurança e tente novamente.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password, turnstileToken || undefined);
      } else {
        await register(name, email, password, turnstileToken || undefined);
        const accessToken = localStorage.getItem('saldao:access');
        if (accessToken) {
          fetch(`${API}/api/v1/content/consent`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ types: ['TERMS', 'PRIVACY'], documentVersion: 1 }),
          }).catch(() => {});
        }
      }
      router.push('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-8">
          <h1 className="mb-6 text-center text-2xl font-bold">
            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'register' && (
              <div>
                <label className="mb-1 block text-sm font-medium">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Seu nome"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="••••••••"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">Confirmar senha</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="••••••••"
                    className={`w-full rounded-lg border px-3 py-2 text-sm placeholder:text-muted-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring ${
                      passwordMismatch ? 'border-destructive' : 'border-input'
                    }`}
                  />
                  {passwordMismatch && (
                    <p className="mt-1 text-xs text-destructive">As senhas não coincidem.</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Verificação: quanto é {captcha.a} + {captcha.b}?
                  </label>
                  <input
                    type="number"
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    required
                    placeholder="Digite o resultado"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-0.5 accent-primary shrink-0"
                    />
                    <span>
                      Li e aceito os{' '}
                      <a
                        href="/termos-de-uso"
                        target="_blank"
                        className="text-primary hover:underline"
                      >
                        Termos de Uso
                      </a>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={privacyAccepted}
                      onChange={(e) => setPrivacyAccepted(e.target.checked)}
                      className="mt-0.5 accent-primary shrink-0"
                    />
                    <span>
                      Li e concordo com a{' '}
                      <a
                        href="/privacidade"
                        target="_blank"
                        className="text-primary hover:underline"
                      >
                        Política de Privacidade
                      </a>
                    </span>
                  </label>
                </div>
              </>
            )}

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            {turnstileSiteKey && <div ref={turnstileRef} className="flex justify-center" />}

            <button
              type="submit"
              disabled={
                loading ||
                (mode === 'register' && (!termsAccepted || !privacyAccepted || passwordMismatch))
              }
              className="rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'login' ? 'Não tem uma conta?' : 'Já tem uma conta?'}{' '}
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
                setPassword('');
                setConfirmPassword('');
              }}
              className="font-medium text-primary hover:underline"
            >
              {mode === 'login' ? 'Criar conta' : 'Entrar'}
            </button>
          </p>

          {mode === 'login' && (
            <p className="mt-2 text-center">
              <Link href="/esqueci-senha" className="text-xs text-muted-foreground hover:underline">
                Esqueci minha senha
              </Link>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
