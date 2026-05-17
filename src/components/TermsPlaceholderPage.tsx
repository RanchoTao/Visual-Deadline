interface TermsPlaceholderPageProps {
  onBack?: () => void;
}

export function TermsPlaceholderPage({ onBack }: TermsPlaceholderPageProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_32%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-2xl rounded-[2rem] border border-white/80 bg-white/85 p-7 shadow-2xl shadow-slate-300/60 backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">VD（Visual Deadline）</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">用户协议页面待补充</h1>
        <p className="mt-4 text-sm leading-7 text-slate-500">用户协议正在整理中。当前页面用于保留注册协议入口，后续会补充完整条款。</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {onBack ? <button type="button" onClick={onBack} className="rounded-full bg-white/85 px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">返回应用</button> : null}
          <a href="/privacy" className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-slate-300">查看隐私政策</a>
        </div>
      </section>
    </main>
  );
}
