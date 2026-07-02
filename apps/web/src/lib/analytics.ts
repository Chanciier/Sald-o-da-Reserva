// Cliente de analytics de comportamento: sessão anônima (id por aba, em
// sessionStorage) + visitante (id persistente, em localStorage) usados só
// para métricas agregadas — nunca para identificar a pessoa. Eventos são
// enfileirados e enviados em lote (sendBeacon/fetch keepalive) para não
// disparar uma requisição por clique. Respeita o consentimento de cookies
// já existente no site (chave "cookie_consent"): sem consentimento
// "analytics", nada é coletado nem enviado.

type AnalyticsEventType =
  | 'PAGE_VIEW'
  | 'PRODUCT_VIEW'
  | 'PRODUCT_CLICK'
  | 'ADD_TO_CART'
  | 'REMOVE_FROM_CART'
  | 'CHECKOUT_START'
  | 'PURCHASE'
  | 'SEARCH';

type DeviceType = 'MOBILE' | 'TABLET' | 'DESKTOP';

interface QueuedEvent {
  type: AnalyticsEventType;
  path?: string;
  productId?: string;
  metadata?: Record<string, unknown>;
}

interface SessionContext {
  device: DeviceType;
  browser: string;
  os: string;
  referrer: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  landingPath: string;
}

const CONSENT_KEY = 'cookie_consent';
const VISITOR_KEY = 'analytics_visitor_id';
const SESSION_KEY = 'analytics_session_id';
const CONTEXT_KEY = 'analytics_session_context';
const FLUSH_DELAY_MS = 3000;
const MAX_QUEUE = 20;
const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let activeSeconds = 0;
let visibleSince: number | null = null;
let contextSent = false;
let initialized = false;

function hasConsent(): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return false;
    return JSON.parse(raw)?.analytics === true;
  } catch {
    return false;
  }
}

function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function detectDevice(): DeviceType {
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return 'TABLET';
  if (/mobile|android|iphone/i.test(ua)) return 'MOBILE';
  return 'DESKTOP';
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\//i.test(ua)) return 'Opera';
  if (/samsungbrowser/i.test(ua)) return 'Samsung Internet';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/chrome|crios/i.test(ua) && !/chromium/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Outro';
}

function detectOS(): string {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/windows/i.test(ua)) return 'Windows';
  if (/mac os/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Outro';
}

function getSessionContext(): SessionContext {
  const raw = sessionStorage.getItem(CONTEXT_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // recomputa abaixo
    }
  }
  const params = new URLSearchParams(window.location.search);
  const context: SessionContext = {
    device: detectDevice(),
    browser: detectBrowser(),
    os: detectOS(),
    referrer: document.referrer || '',
    utmSource: params.get('utm_source') ?? undefined,
    utmMedium: params.get('utm_medium') ?? undefined,
    utmCampaign: params.get('utm_campaign') ?? undefined,
    landingPath: window.location.pathname,
  };
  sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
  return context;
}

function tickActiveSeconds() {
  if (visibleSince !== null) {
    activeSeconds += (Date.now() - visibleSince) / 1000;
    visibleSince = Date.now();
  }
}

function ensureInit() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  visibleSince = document.visibilityState === 'visible' ? Date.now() : null;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      tickActiveSeconds();
      visibleSince = null;
      flush({ beacon: true, force: true });
    } else {
      visibleSince = Date.now();
    }
  });
  window.addEventListener('pagehide', () => flush({ beacon: true, force: true }));
}

function flush(opts: { beacon?: boolean; force?: boolean } = {}) {
  if (typeof window === 'undefined' || !hasConsent()) {
    queue = [];
    return;
  }
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  tickActiveSeconds();
  if (!queue.length && contextSent && !opts.force) return;

  const isFirstFlush = !contextSent;
  const context = isFirstFlush ? getSessionContext() : null;
  const payload = {
    sessionId: getSessionId(),
    visitorId: getVisitorId(),
    ...(context && {
      device: context.device,
      browser: context.browser,
      os: context.os,
      referrer: context.referrer || undefined,
      utmSource: context.utmSource,
      utmMedium: context.utmMedium,
      utmCampaign: context.utmCampaign,
      landingPath: context.landingPath,
    }),
    durationSeconds: Math.round(activeSeconds),
    events: queue,
  };
  contextSent = true;
  queue = [];

  const url = `${API_BASE}/analytics/track`;
  const body = JSON.stringify(payload);
  if (opts.beacon && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
  } else {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}

function scheduleFlush() {
  ensureInit();
  if (queue.length >= MAX_QUEUE) {
    flush();
    return;
  }
  if (flushTimer) return;
  flushTimer = setTimeout(() => flush(), FLUSH_DELAY_MS);
}

function enqueue(event: QueuedEvent) {
  if (typeof window === 'undefined' || !hasConsent()) return;
  queue.push(event);
  scheduleFlush();
}

export function trackPageView(path: string) {
  enqueue({ type: 'PAGE_VIEW', path });
}

export function trackProductView(productId: string, path?: string) {
  enqueue({ type: 'PRODUCT_VIEW', productId, path });
}

export function trackProductClick(productId: string, source: string) {
  enqueue({ type: 'PRODUCT_CLICK', productId, metadata: { source } });
}

export function trackAddToCart(productId: string, quantity: number) {
  enqueue({ type: 'ADD_TO_CART', productId, metadata: { quantity } });
}

export function trackCheckoutStart() {
  enqueue({ type: 'CHECKOUT_START' });
}

export function trackPurchase(orderId: string, value: number) {
  enqueue({ type: 'PURCHASE', metadata: { orderId, value } });
  flush({ force: true });
}

export function trackSearch(term: string, resultsCount: number) {
  const trimmed = term.trim();
  if (!trimmed) return;
  enqueue({ type: 'SEARCH', metadata: { term: trimmed.slice(0, 120), resultsCount } });
}

/** Chamado pelo CookieBanner após a escolha do usuário — inicia o tracking
 * imediatamente se "analytics" foi aceito, sem precisar recarregar a página. */
export function notifyConsentChanged() {
  if (typeof window === 'undefined') return;
  if (hasConsent()) scheduleFlush();
}

/** Heartbeat periódico chamado pelo AnalyticsProvider para manter
 * durationSeconds atualizado mesmo em sessões sem novas interações. */
export function pingActivity() {
  if (typeof window === 'undefined' || !hasConsent()) return;
  flush({ force: true });
}
