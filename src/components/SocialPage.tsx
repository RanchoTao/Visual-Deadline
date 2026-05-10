const socialNotes = [
  '未来的 relationship map：把重要关系以温和的方式呈现出来。',
  'contact notes：记录关键背景、共同话题与下次可以关心的事项。',
  'social energy tracking：观察社交后的能量变化，而不是评判表现。',
  'interaction review：复盘重要互动，帮助关系维护变得更清晰。',
];

export function SocialPage() {
  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Social</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">社交</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">这个模块会服务于关系维护与社交能量观察。当前不实现社交图谱，只保留未来方向。</p>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {socialNotes.map((note) => (
          <article key={note} className="rounded-3xl bg-slate-50/80 p-4 text-sm leading-6 text-slate-600 ring-1 ring-white/80">
            {note}
          </article>
        ))}
      </div>
    </section>
  );
}
