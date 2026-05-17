interface TermsPageProps {
  onBack?: () => void;
}

const sections = [
  {
    title: '一、服务说明',
    paragraphs: [
      'VD（Visual Deadline）是一款面向任务、目标、压力与个人状态记录的效率工具。产品提供本地数据管理、云同步、压力计算、AI 辅助分析、路线图生成与数据导入导出等功能。',
      '我们会持续改进产品，但不承诺所有功能永久不变、持续可用或适用于你的全部场景。部分功能可能因为网络、第三方服务、账号状态或浏览器环境而受限。',
    ],
  },
  {
    title: '二、账号与安全',
    paragraphs: [
      '你需要使用真实、可接收邮件的邮箱注册账号，并自行保管登录凭证。因你泄露账号、共用设备、使用弱密码或未及时退出登录造成的损失，应由你自行承担。',
      '如发现账号异常、数据异常或未经授权使用，请尽快停止使用相关功能并联系我们。我们可能为保障安全临时限制账号访问、清理异常登录状态或要求重新验证身份。',
    ],
  },
  {
    title: '三、用户内容与使用规范',
    paragraphs: [
      '你在 VD 中创建、导入或提交的任务、目标、笔记、头像、AI 输入与其他内容，应符合法律法规与公序良俗，不得包含违法、侵权、骚扰、仇恨、恶意代码或其他不当内容。',
      '你保留自己内容的合法权利。为提供云同步、AI 分析、备份恢复与产品运行所必需的服务，你授权我们在必要范围内存储、处理、传输与展示这些内容。',
    ],
  },
  {
    title: '四、AI 功能提示',
    paragraphs: [
      'AI 生成内容仅作为效率、计划与自我观察参考，不构成医疗、心理、法律、财务或其他专业建议。你应结合自身情况独立判断，不应完全依赖 AI 输出做出高风险决策。',
      '请不要在 AI 输入中主动提交身份证号、银行卡号、密码、精确住址、医疗诊断等敏感个人信息。我们会尽量减少传输数据，但无法保证第三方 AI 服务的输出完全准确或无误。',
    ],
  },
  {
    title: '五、数据、本地存储与云同步',
    paragraphs: [
      '未登录时，你的数据主要保存在当前浏览器本地。清除浏览器数据、更换设备、浏览器隐私策略变化或设备损坏，可能导致本地数据无法恢复。',
      '登录后，VD 会尝试将任务、目标、个人资料与压力历史同步到云端。云同步依赖 Supabase 等第三方基础设施，可能受网络、服务状态、权限策略或数据库结构影响。',
      '你可以使用产品内的数据导出功能自行备份重要数据。我们建议在进行大量编辑、清理浏览器或更换设备前先导出备份。',
    ],
  },
  {
    title: '六、隐私保护',
    paragraphs: [
      '我们会按照《隐私政策》说明收集、使用、存储与保护你的信息。《隐私政策》是本协议的重要组成部分，与本协议具有同等效力。',
      '注册、登录或继续使用 VD，即表示你已阅读并理解本协议与《隐私政策》。如你不同意相关内容，请停止注册或停止使用本产品。',
    ],
  },
  {
    title: '七、费用与服务变更',
    paragraphs: [
      '当前功能可能包含免费能力。未来如推出付费功能、订阅计划或额度限制，我们会在相关页面说明价格、权益与规则。',
      '我们可能根据产品发展、技术调整、安全要求或法律法规变化，新增、修改、暂停或终止部分功能。重大变更会尽量通过产品页面或其他合理方式提示。',
    ],
  },
  {
    title: '八、免责声明与责任限制',
    paragraphs: [
      'VD 会尽合理努力保障产品稳定与数据安全，但不对网络中断、第三方服务故障、不可抗力、用户误操作、浏览器或设备问题导致的损失承担超出法律规定范围的责任。',
      '压力指数、任务评分、趋势分析与 AI 建议均为辅助性信息，不代表对你的健康、心理状态、学习或工作结果作出保证。',
    ],
  },
  {
    title: '九、协议更新与终止',
    paragraphs: [
      '我们可能不时更新本协议。更新后的协议会展示在本页面。若你在协议更新后继续使用 VD，视为你接受更新后的内容。',
      '如你违反本协议或法律法规，我们有权在合理范围内限制、暂停或终止向你提供服务，并保留依法追究责任的权利。',
    ],
  },
  {
    title: '十、联系我们',
    paragraphs: ['如你对本协议有任何问题，可以通过 RanchoTao@gmail.com 联系我们。'],
  },
];

export function TermsPage({ onBack }: TermsPageProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_32%),radial-gradient(circle_at_top_right,#f8fafc,transparent_30%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-8 text-slate-900 md:px-8">
      <article className="mx-auto max-w-4xl rounded-[2rem] border border-white/75 bg-white/82 p-5 shadow-2xl shadow-slate-300/55 backdrop-blur md:p-8">
        <header className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.24em] text-slate-400">VD（Visual Deadline）</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">用户协议</h1>
            <p className="mt-4 text-sm leading-6 text-slate-500">更新日期：2026年5月17日 · 生效日期：2026年5月17日</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onBack ? (
              <button type="button" onClick={onBack} className="rounded-full bg-white/85 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">返回应用</button>
            ) : null}
            <a href="/privacy" className="rounded-full bg-white/85 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">查看隐私政策</a>
            <a href="/" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-slate-300">打开 VD</a>
          </div>
        </header>

        <section className="mt-6 rounded-3xl bg-slate-50/85 p-5 text-sm leading-7 text-slate-600 ring-1 ring-white/80 md:p-6">
          <p>欢迎使用 VD（Visual Deadline）。本用户协议说明你与 VD 之间关于访问和使用本产品的基本规则。</p>
          <p className="mt-3">请在注册或使用前认真阅读本协议；如果你不同意本协议或《隐私政策》，请不要注册或继续使用本产品。</p>
        </section>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.title} className="scroll-mt-8">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-4 text-base leading-8 text-slate-600">{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <footer className="mt-10 border-t border-slate-100 pt-6 text-sm leading-6 text-slate-500">
          <p>VD（Visual Deadline）用户协议 v1.0</p>
        </footer>
      </article>
    </main>
  );
}
