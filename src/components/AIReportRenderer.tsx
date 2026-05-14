import { cleanAIReportText, cleanInlineMarkdown, parseAIReportSections, type AIReportBlock } from '../utils/aiReportFormatting';

interface AIReportRendererProps {
  content: string;
  variant?: 'task-analysis' | 'review';
}

const semanticLabels: Record<string, string> = {
  近期状态: '状态概览',
  总体状态: '状态概览',
  已完成事项: '完成记录',
  压力来源: '压力源',
  压力风险: '压力源',
  优先行动: '下一步行动',
  长期价值对齐: '长期路径',
  建议调整: '调整建议',
  下阶段建议: '下一步行动',
};

function displayTitle(title: string): string {
  const cleanedTitle = cleanInlineMarkdown(title);
  return semanticLabels[cleanedTitle] ? `${semanticLabels[cleanedTitle]} · ${cleanedTitle}` : cleanedTitle;
}

function splitLead(text: string): { lead?: string; body: string } {
  const cleanedText = cleanInlineMarkdown(text);
  const match = cleanedText.match(/^([^：:]{2,18})[：:]\s*(.+)$/);
  if (!match) return { body: cleanedText };
  return { lead: match[1], body: match[2] };
}

function TextWithLead({ text }: { text: string }) {
  const { lead, body } = splitLead(text);
  if (!lead) return <span>{body}</span>;
  return (
    <span>
      <span className="mr-2 font-semibold text-slate-700">{lead}</span>
      <span>{body}</span>
    </span>
  );
}

function ReportBlock({ block }: { block: AIReportBlock }) {
  if (block.type === 'paragraph') {
    return <p className="rounded-2xl bg-white/70 px-4 py-3 text-sm leading-7 text-slate-600 ring-1 ring-white/80"><TextWithLead text={block.text} /></p>;
  }
  if (block.type === 'bulletList') {
    return (
      <ul className="space-y-2">
        {block.items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-3 rounded-2xl bg-white/75 px-4 py-3 text-sm leading-7 text-slate-600 ring-1 ring-white/80">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
            <span><TextWithLead text={item} /></span>
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === 'numberedList') {
    return (
      <ol className="space-y-2">
        {block.items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-3 rounded-2xl bg-white/75 px-4 py-3 text-sm leading-7 text-slate-600 ring-1 ring-white/80">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-50 text-xs font-semibold text-slate-500 ring-1 ring-slate-100">{index + 1}</span>
            <span><TextWithLead text={item} /></span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/80 bg-white/75 shadow-sm shadow-slate-200/40">
      <table className="min-w-full text-left text-sm text-slate-600">
        <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500">
          <tr>{block.headers.map((header, index) => <th key={`${header}-${index}`} className="px-4 py-3">{cleanInlineMarkdown(header)}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className="px-4 py-3 align-top leading-6">{cleanInlineMarkdown(cell)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function AIReportRenderer({ content, variant = 'task-analysis' }: AIReportRendererProps) {
  const sections = parseAIReportSections(content);
  if (!sections.length) {
    return <article className="mt-4 whitespace-pre-wrap rounded-[2rem] border border-white/80 bg-white/85 p-5 text-sm leading-7 text-slate-600 shadow-sm shadow-slate-200/60 ring-1 ring-white/70">{cleanAIReportText(content)}</article>;
  }

  return (
    <div className="mt-5 space-y-4" data-report-variant={variant}>
      {sections.map((section, index) => (
        <section key={`${section.title}-${index}`} className="rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-sm shadow-slate-200/60 ring-1 ring-white/70 backdrop-blur">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100/80 pb-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.22em] text-slate-400">认知分析</p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{displayTitle(section.title)}</h3>
            </div>
            <span className="rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-400 shadow-sm ring-1 ring-white/80">飞升报告</span>
          </div>
          <div className="space-y-3">
            {section.blocks.map((block, blockIndex) => <ReportBlock key={blockIndex} block={block} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
