interface PrivacyPolicyPageProps {
  onBack?: () => void;
}

const sections = [
  {
    title: '一、我们收集的信息',
    blocks: [
      {
        heading: '1. 账号信息',
        content: '当你注册或登录 VD（Visual Deadline）时，我们可能会收集：',
        items: ['邮箱地址', '用户名', '头像', '账号标识信息'],
      },
      {
        heading: '2. 任务与使用数据',
        content: '为实现任务管理、统计分析与云同步功能，我们可能会存储：',
        items: ['任务内容', '截止时间', '重要性数据', '压力指数', '标签与分类', '统计数据', '使用记录'],
      },
      {
        heading: '3. AI 相关数据',
        content: '当你使用 AI 功能时，我们可能会处理你主动输入的内容，用于任务分析、计划生成、压力评估、效率建议与功能优化。请不要主动输入身份证号、银行卡号、密码等敏感个人信息。',
      },
    ],
  },
  {
    title: '二、我们如何使用你的信息',
    paragraphs: [
      '我们收集的信息主要用于提供任务管理与云同步服务、优化产品体验、改进 AI 功能质量、保障账号与系统安全，以及进行统计分析与故障排查。',
      '我们不会出售你的个人数据。',
    ],
  },
  {
    title: '三、数据存储与安全',
    paragraphs: [
      'VD（Visual Deadline）会尽合理努力保护你的数据安全，包括加密传输、访问控制、服务端安全策略与日志审计。',
      '但你应理解，互联网环境无法保证绝对安全。因网络故障、第三方服务异常、不可抗力或用户自身原因导致的数据风险，我们不承担超出法律规定范围之外的责任。',
    ],
  },
  {
    title: '四、Cookie 与本地存储',
    paragraphs: [
      '为保障登录状态、提升使用体验与优化产品功能，VD（Visual Deadline）可能会使用 Cookie、LocalStorage、SessionStorage 与缓存数据。',
      '你可以通过浏览器设置清除相关数据。清除后，部分本地数据、登录状态或偏好设置可能无法恢复。',
    ],
  },
  {
    title: '五、第三方服务',
    paragraphs: [
      'VD（Visual Deadline）当前或未来可能接入 Supabase、AI API 服务、云存储服务或数据分析服务。第三方服务可能依据其自身隐私政策处理部分数据。',
      '我们会尽量只传输实现功能所需的数据，并持续评估第三方服务的数据安全与合规风险。',
    ],
  },
  {
    title: '六、你的权利',
    paragraphs: [
      '你有权查看你的个人数据、修改账号信息、删除部分数据、申请注销账号，或停止使用本产品。部分功能未来可能通过产品内页面逐步开放。',
    ],
  },
  {
    title: '七、未成年人保护',
    paragraphs: [
      '未成年人应在监护人同意与指导下使用 VD（Visual Deadline）。如果监护人发现未成年人未经同意提供个人信息，可联系我们处理。',
    ],
  },
  {
    title: '八、政策更新',
    paragraphs: [
      '我们可能根据产品发展、法律法规变化或运营需要更新本隐私政策。更新后的版本将在本页面中展示。',
    ],
  },
  {
    title: '九、联系我们',
    paragraphs: ['如你对本隐私政策有任何问题，可以通过 RanchoTao@gmail.com 联系我们。'],
  },
];

export function PrivacyPolicyPage({ onBack }: PrivacyPolicyPageProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_32%),radial-gradient(circle_at_top_right,#f8fafc,transparent_30%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-8 text-slate-900 md:px-8">
      <article className="mx-auto max-w-4xl rounded-[2rem] border border-white/75 bg-white/82 p-5 shadow-2xl shadow-slate-300/55 backdrop-blur md:p-8">
        <header className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">VD（Visual Deadline）</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">隐私政策</h1>
            <p className="mt-4 text-sm leading-6 text-slate-500">更新日期：2026年5月17日 · 生效日期：2026年5月17日</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onBack ? (
              <button type="button" onClick={onBack} className="rounded-full bg-white/85 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">返回应用</button>
            ) : null}
            <a href="/" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-300">打开 VD</a>
          </div>
        </header>

        <section className="mt-6 rounded-3xl bg-slate-50/85 p-5 text-sm leading-7 text-slate-600 ring-1 ring-white/80 md:p-6">
          <p>欢迎使用 VD（Visual Deadline）。本隐私政策用于说明在你使用本产品过程中，我们如何收集、使用、存储与保护你的个人信息。</p>
          <p className="mt-3">请你在使用本产品前认真阅读本政策。继续使用本产品，即表示你已阅读并理解本隐私政策的内容。</p>
        </section>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.title} className="scroll-mt-8">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-4 text-base leading-8 text-slate-600">{paragraph}</p>
              ))}
              {section.blocks?.map((block) => (
                <div key={block.heading} className="mt-5 rounded-3xl bg-white/72 p-5 ring-1 ring-slate-100">
                  <h3 className="text-lg font-semibold text-slate-900">{block.heading}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{block.content}</p>
                  {block.items ? (
                    <ul className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      {block.items.map((item) => <li key={item} className="rounded-2xl bg-slate-50 px-3 py-2">{item}</li>)}
                    </ul>
                  ) : null}
                </div>
              ))}
            </section>
          ))}
        </div>

        <footer className="mt-10 border-t border-slate-100 pt-6 text-sm leading-6 text-slate-500">
          <p>VD（Visual Deadline）隐私政策 v1.0</p>
        </footer>
      </article>
    </main>
  );
}
