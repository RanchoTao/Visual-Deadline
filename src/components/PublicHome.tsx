import { useEffect, useState } from 'react';

type Locale = 'zh-CN' | 'en';

const copy = {
  'zh-CN': {
    login: '登录', enter: '进入 VD', headline: '把你脑子里的事，变成下一步。', support: '告诉我你正在处理什么。',
    placeholder: '输入目标、任务、想法，或者任何你正在处理的事情……', send: '开始',
    footer: 'Visual Deadline · 从想法到下一步。', workspace: '工作区', legal: '法律', privacy: '隐私政策', terms: '使用条款',
  },
  en: {
    login: 'Log in', enter: 'Enter VD', headline: "Turn what’s on your mind into what’s next.", support: "Tell me what you're working on.",
    placeholder: "Enter a goal, task, idea, or anything you're dealing with...", send: 'Start',
    footer: 'Visual Deadline · From thought to next step.', workspace: 'Workspace', legal: 'Legal', privacy: 'Privacy', terms: 'Terms',
  },
} as const;

function initialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem('vd.locale');
    if (saved === 'zh-CN' || saved === 'en') return saved;
  } catch { /* Public preference is optional. */ }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function PublicHome({ isAuthenticated, onLogin, onEnter }: { isAuthenticated: boolean; onLogin: () => void; onEnter: (capture: string) => void }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [capture, setCapture] = useState('');
  const text = copy[locale];
  useEffect(() => { try { window.localStorage.setItem('vd.locale', locale); } catch { /* no-op */ } }, [locale]);
  return <main className="vd-public min-h-screen overflow-x-hidden bg-[#fbfbfa] text-[#171717]">
    <header className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
      <a href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"><img src="/logo.png" alt="Visual Deadline" className="h-8 w-8 object-contain" /><span>Visual Deadline</span></a>
      <div className="flex items-center gap-3 text-sm text-zinc-600 sm:gap-5"><span className="inline-flex rounded-full border border-zinc-200 p-0.5" aria-label="Language"><button type="button" onClick={() => setLocale('zh-CN')} aria-pressed={locale === 'zh-CN'} className={`rounded-full px-2 py-1 text-xs font-medium ${locale === 'zh-CN' ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}>中文</button><button type="button" onClick={() => setLocale('en')} aria-pressed={locale === 'en'} className={`rounded-full px-2 py-1 text-xs font-medium ${locale === 'en' ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}>EN</button></span><button type="button" onClick={isAuthenticated ? () => onEnter(capture) : onLogin} className="font-medium text-zinc-900 hover:text-red-600">{isAuthenticated ? text.enter : text.login}</button></div>
    </header>
    <section className="mx-auto flex min-h-[calc(100vh-160px)] max-w-5xl flex-col items-center px-5 pt-[15vh] text-center sm:px-8 sm:pt-[18vh]">
      <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.055em] text-zinc-950 sm:text-6xl lg:text-7xl">{text.headline}</h1>
      <p className="mt-5 text-base text-zinc-500 sm:text-lg">{text.support}</p>
      <form className="mt-12 w-full text-left sm:mt-14" onSubmit={(event) => { event.preventDefault(); onEnter(capture); }}>
        <label htmlFor="vd-capture" className="sr-only">{text.placeholder}</label>
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-[0_16px_50px_-38px_rgba(0,0,0,.45)] transition focus-within:border-zinc-400 focus-within:shadow-[0_18px_55px_-34px_rgba(0,0,0,.38)] sm:rounded-3xl sm:p-4">
          <textarea id="vd-capture" value={capture} onChange={(event) => setCapture(event.target.value)} rows={4} placeholder={text.placeholder} className="min-h-28 w-full resize-none bg-transparent px-2 py-1 text-base leading-7 outline-none placeholder:text-zinc-400 sm:text-lg" />
          <div className="flex items-center justify-between gap-3 px-1 pt-3"><span className="text-xs text-zinc-400">{locale === 'zh-CN' ? '支持文本输入' : 'Text input supported'}</span><button type="submit" aria-label={text.send} disabled={!capture.trim()} className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-[#f0443e] px-3 text-lg font-semibold text-white transition hover:bg-[#d93631] disabled:cursor-not-allowed disabled:bg-zinc-200">→</button></div>
        </div>
      </form>
    </section>
    <footer className="mx-auto grid max-w-[1440px] gap-8 border-t border-zinc-100 px-5 py-9 text-xs text-zinc-400 sm:grid-cols-[1fr_auto_auto] sm:px-8 lg:px-12"><span>{text.footer}</span><div><p className="mb-2 font-semibold text-zinc-600">{text.workspace}</p><a href="/app" className="hover:text-zinc-900">VD</a></div><div><p className="mb-2 font-semibold text-zinc-600">{text.legal}</p><span className="flex gap-4"><a href="/privacy" className="hover:text-zinc-900">{text.privacy}</a><a href="/terms" className="hover:text-zinc-900">{text.terms}</a></span></div></footer>
  </main>;
}
