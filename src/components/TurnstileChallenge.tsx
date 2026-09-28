import { useEffect, useRef, useState } from 'react';

interface TurnstileAPI {
  render(container: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }): string;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: TurnstileAPI } }
let scriptPromise: Promise<void> | undefined;
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { scriptPromise = undefined; script.remove(); reject(new Error('TURNSTILE_LOAD_FAILED')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export const turnstileSiteKey = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
export const turnstileDevBypass = import.meta.env.DEV && import.meta.env.VITE_TURNSTILE_DEV_BYPASS === 'true';
export function TurnstileChallenge({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false; let widget: string | undefined;
    onToken(''); setFailed(false);
    if (turnstileSiteKey) void loadTurnstile().then(() => {
      if (disposed || !container.current || !window.turnstile) return;
      widget = window.turnstile.render(container.current, { sitekey: turnstileSiteKey,
        callback: (token) => { if (!disposed) onToken(token); },
        'expired-callback': () => { if (!disposed) onToken(''); },
        'error-callback': () => { if (!disposed) { onToken(''); setFailed(true); } } });
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; if (widget && window.turnstile) window.turnstile.remove(widget); };
  }, [onToken, resetKey]);
  return <div><div ref={container} aria-label="人机验证" />{failed ? <p role="alert" className="text-sm text-rose-700">人机验证加载失败，请刷新后重试。</p> : null}{!turnstileSiteKey ? <p className="text-sm text-zinc-500">{turnstileDevBypass ? '开发模式：人机验证已明确跳过。' : '人机验证暂不可用，请稍后再试。'}</p> : null}</div>;
}
