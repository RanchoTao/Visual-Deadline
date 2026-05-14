import { useState } from 'react';

type LifeTreeItem = {
  id: string;
  title: string;
  description: string;
  color: string;
  children: Array<{
    title: string;
    children?: string[];
  }>;
};

const lifeModules: LifeTreeItem[] = [
  {
    id: 'study',
    title: '学习',
    description: '课程、技能与日常学习节奏。',
    color: '#dbeafe',
    children: [{ title: '课程' }, { title: '技能训练' }, { title: '语言' }, { title: '知识整理' }],
  },
  {
    id: 'research',
    title: '研究',
    description: '长期问题、论文与实验推进。',
    color: '#ede9fe',
    children: [{ title: '论文想法' }, { title: '实验' }, { title: '阅读' }, { title: '投稿' }],
  },
  {
    id: 'health',
    title: '健康 / 运动',
    description: '基础健康、训练与身体状态。',
    color: '#dcfce7',
    children: [
      { title: '跑步' },
      { title: '健身' },
      { title: '足球' },
      { title: '滑雪', children: ['基础技术', 'CASI 1', 'CASI 2', '刻滑', '粉雪', '公园'] },
    ],
  },
  {
    id: 'finance',
    title: '资产管理',
    description: '收入、支出、储蓄与风险边界。',
    color: '#fef3c7',
    children: [{ title: '资产记录' }, { title: '投资策略' }, { title: '量化交易' }, { title: '风险控制' }],
  },
  {
    id: 'content',
    title: '内容',
    description: '表达、作品与内容资产。',
    color: '#cffafe',
    children: [{ title: '写作' }, { title: '视频' }, { title: '作品库' }, { title: '发布节奏' }],
  },
  {
    id: 'social',
    title: '社交',
    description: '关系维护与社交能量。',
    color: '#ffe4e6',
    children: [{ title: '家人' }, { title: '朋友' }, { title: '合作关系' }, { title: '弱连接' }],
  },
  {
    id: 'self',
    title: '个人思考',
    description: '身份、复盘、价值观与长期判断。',
    color: '#e2e8f0',
    children: [{ title: '自我叙事' }, { title: '价值观' }, { title: '阶段复盘' }, { title: '长期问题' }],
  },
];

function LifeNodeCard({ module, focused, onClick }: { module: LifeTreeItem; focused?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-[1.25rem] border border-white/80 bg-white/90 p-3 text-left shadow-md shadow-slate-200/60 ring-1 ring-white/80 transition hover:-translate-y-0.5 hover:shadow-lg ${focused ? 'scale-[1.03] ring-2 ring-slate-300' : ''}`}
    >
      <span className="absolute inset-x-4 top-0 h-1 rounded-full" style={{ backgroundColor: module.color }} />
      <h3 className="text-base font-semibold text-slate-950">{module.title}</h3>
      <p className="mt-2 min-h-8 text-[11px] leading-4 text-slate-500">{module.description}</p>
      <p className="mt-2 text-[11px] font-semibold text-slate-400">点击聚焦</p>
    </button>
  );
}

export function LifeMapPage() {
  const [focusedModuleId, setFocusedModuleId] = useState<string | undefined>();
  const focusedModule = lifeModules.find((module) => module.id === focusedModuleId);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-slate-400">人生结构</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">人生树</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">把 VD 的长期结构固定成清晰的生活模块。总览保持稳定，点击模块进入该领域的内部树。</p>
        </div>
        {focusedModule ? <button type="button" onClick={() => setFocusedModuleId(undefined)} className="rounded-full bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">返回人生总览</button> : null}
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
        {!focusedModule ? (
          <div className="relative rounded-[1.75rem] bg-slate-50/80 p-5 ring-1 ring-white/80">
            <div className="mx-auto flex max-w-5xl flex-col items-center gap-4">
              <div className="rounded-[1.5rem] border border-slate-200 bg-white px-8 py-4 text-center shadow-lg shadow-slate-200/60">
                <p className="text-xs font-semibold text-slate-400">根节点</p>
                <h2 className="mt-1 text-3xl font-semibold text-slate-950">我</h2>
                <p className="mt-2 text-sm text-slate-500">身份、精力与长期选择的中心</p>
              </div>
              <div className="h-8 w-px bg-slate-300" />
              <div className="h-px w-full max-w-5xl bg-slate-300" />
            </div>
            <div className="mt-8 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
              {lifeModules.map((module) => <LifeNodeCard key={module.id} module={module} onClick={() => setFocusedModuleId(module.id)} />)}
            </div>
          </div>
        ) : (
          <div className="rounded-[1.75rem] bg-slate-50/80 p-5 ring-1 ring-white/80">
            <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div className="space-y-4">
                <LifeNodeCard module={focusedModule} focused onClick={() => setFocusedModuleId(undefined)} />
                <p className="rounded-2xl bg-white/80 px-4 py-3 text-xs leading-5 text-slate-500 ring-1 ring-white/80">当前为聚焦模式：其他二级模块暂时隐藏，便于查看该领域的内部结构。</p>
              </div>
              <div className="relative rounded-[1.5rem] bg-white/85 p-5 shadow-inner ring-1 ring-white/80">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700" style={{ backgroundColor: focusedModule.color }}>{focusedModule.title} · 内部树</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {focusedModule.children.map((child) => (
                    <article key={child.title} className="rounded-[1.25rem] border border-slate-100 bg-slate-50/80 p-4">
                      <h3 className="text-sm font-semibold text-slate-900">{child.title}</h3>
                      {child.children ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {child.children.map((item) => <span key={item} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-white/80">{item}</span>)}
                        </div>
                      ) : <p className="mt-2 text-xs text-slate-400">后续可扩展为更细的行动节点。</p>}
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
