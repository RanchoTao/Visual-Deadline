const lifeDomains = [
  { name: 'Academic', description: '课程、考试与学术节奏的长期位置。', progress: 42 },
  { name: 'Research', description: '研究问题、论文与实验推进的地图层。', progress: 28 },
  { name: 'Fitness', description: '训练、恢复与身体能力的稳定追踪。', progress: 36 },
  { name: 'Finance', description: '收入、支出、储蓄与风险边界。', progress: 24 },
  { name: 'Social', description: '关系维护、社交能量与互动质量。', progress: 31 },
  { name: 'Content', description: '表达、作品、发布与内容资产。', progress: 18 },
  { name: 'Health', description: '睡眠、饮食、体检与基础健康信号。', progress: 46 },
];

export function LifeMapPage() {
  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Life Map</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">人生地图</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">这里会成为 LifeOS 的总览层。当前只保留安静的占位卡片，用来展示未来会被连接的生活领域。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lifeDomains.map((domain) => (
          <article key={domain.name} className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/50 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">{domain.name}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{domain.description}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Coming soon</span>
            </div>
            <div className="mt-6">
              <div className="flex justify-between text-xs font-medium text-slate-400">
                <span>placeholder progress</span>
                <span>{domain.progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-slate-300" style={{ width: `${domain.progress}%` }} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
