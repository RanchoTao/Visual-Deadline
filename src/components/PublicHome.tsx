import { CaptureComposer } from './CaptureComposer';
import type { CaptureDraft } from '../domain/public/captureDraft';

export type PublicLocale = 'zh-CN' | 'en';

const copy = {
  'zh-CN': {
    getApp: '移动端 · 即将推出', login: '登录', enter: '进入 VD', headlineFirst: '明确方向，', headlineSecond: '有序前行。', support: '告诉我你正在处理什么。',
    placeholder: '输入目标、任务、想法，或者任何你正在处理的事情……', send: '开始',
    capture: { file: '文件', image: '图片', url: '链接', voice: '语音', stop: '停止', add: '添加', voiceItem: '语音', invalidUrl: '请输入有效的 http 或 https 链接。', microphoneUnavailable: '无法使用麦克风。', fileTooLarge: (name: string) => `${name} 超过 25 MB 本地暂存限制。`, remove: '移除' },
  },
  en: {
    getApp: 'Mobile · Coming Soon', login: 'Log in', enter: 'Enter VD', headlineFirst: 'Find direction.', headlineSecond: 'Move with clarity.', support: "Tell me what you're working on.",
    placeholder: "Enter a goal, task, idea, or anything you're dealing with...", send: 'Start',
    capture: { file: 'File', image: 'Image', url: 'URL', voice: 'Voice', stop: 'Stop', add: 'Add', voiceItem: 'Voice', invalidUrl: 'Enter a valid http or https URL.', microphoneUnavailable: 'Microphone access was not available.', fileTooLarge: (name: string) => `${name} exceeds the 25 MB local staging limit.`, remove: 'Remove' },
  },
} as const;

export function PublicHome({ locale, onLocaleChange, isAuthenticated, onLogin, onGetApp, onSubmit }: { locale: PublicLocale; onLocaleChange: (locale: PublicLocale) => void; isAuthenticated: boolean; onLogin: () => void; onGetApp: () => void; onSubmit: (draft: CaptureDraft) => void }) {
  const text = copy[locale];
  return <main className="vd-public relative overflow-x-hidden bg-[#fbfaf8] text-[#1d1b1a]">
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(104,87,78,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(104,87,78,.025)_1px,transparent_1px)] bg-[size:34px_34px] [mask-image:linear-gradient(to_bottom,black,transparent_58%)]" />
    <div className="pointer-events-none absolute left-1/2 top-10 h-[30rem] w-[58rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(210,94,76,.11),rgba(244,231,220,.07)_40%,transparent_70%)] blur-3xl" />
    <header className="relative mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
      <a href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"><img src="/logo.png" alt="Visual Deadline" className="h-8 w-8 object-contain" /><span>Visual Deadline</span></a>
      <div className="flex items-center gap-3 text-sm text-zinc-600 sm:gap-5"><button type="button" onClick={onGetApp} className="hidden font-medium text-zinc-500 hover:text-zinc-900 sm:block">{text.getApp}</button><span className="inline-flex rounded-full border border-zinc-200 bg-white/70 p-0.5" aria-label="Language"><button type="button" onClick={() => onLocaleChange('zh-CN')} aria-pressed={locale === 'zh-CN'} className={`rounded-full px-2 py-1 text-xs font-medium ${locale === 'zh-CN' ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}>中文</button><button type="button" onClick={() => onLocaleChange('en')} aria-pressed={locale === 'en'} className={`rounded-full px-2 py-1 text-xs font-medium ${locale === 'en' ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}>EN</button></span><button type="button" onClick={isAuthenticated ? () => onSubmit({ text: '', attachments: [], links: [] }) : onLogin} className="font-medium text-zinc-900 hover:text-[#c43b35]">{isAuthenticated ? text.enter : text.login}</button></div>
    </header>
    <section className="relative mx-auto flex min-h-[clamp(34rem,64vh,44rem)] max-w-5xl flex-col items-center px-5 pt-[clamp(5rem,10vh,8rem)] text-center sm:px-8">
      <h1 className="max-w-3xl text-[clamp(2rem,3.6vw,3.45rem)] font-semibold tracking-[-0.04em] text-zinc-950 [text-wrap:balance]"><span className="block lg:inline">{text.headlineFirst}</span>{locale === 'en' ? ' ' : null}<span className="block lg:inline">{text.headlineSecond}</span></h1>
      <p className="mt-4 text-base text-zinc-500 sm:text-[17px]">{text.support}</p>
      <CaptureComposer placeholder={text.placeholder} submitLabel={text.send} labels={text.capture} onSubmit={onSubmit} />
    </section>
  </main>;
}
