import { cleanAIReportText, parseAIReportSections, type AIReportBlock } from '../utils/aiReportFormatting';

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
  return semanticLabels[title] ? `${semanticLabels[title]} · ${title}` : title;
}

function ReportBlock({ block }: { block: AIReportBlock }) {
  if (block.type === 'paragraph') return <p className="text-sm leading-7 text-slate-600">{block.text}</p>;
  if (block.type === 'bulletList') {
    return (
      <ul className="space-y-2">
        {block.items.map((item, index) => <li key={`${item}-${index}`} className="rounded-2xl bg-slate-50/80 px-3 py-2 text-sm leading-6 text-slate-600 ring-1 ring-white/80">{item}</li>)}
      </ul>
    );
  }
  if (block.type === 'numberedList') {
    return (
      <ol className="space-y-2">
        {block.items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-3 rounded-2xl bg-slate-50/80 px-3 py-2 text-sm leading-6 text-slate-600 ring-1 ring-white/80">
            <span className="font-semibold text-slate-400">{index + 1}</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/70">
      <table className="min-w-full text-left text-sm text-slate-600">
        <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
          <tr>{block.headers.map((header, index) => <th key={`${header}-${index}`} className="px-3 py-2">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className="px-3 py-2 align-top">{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function AIReportRenderer({ content, variant = 'task-analysis' }: AIReportRendererProps) {
  const sections = parseAIReportSections(content);
  if (!sections.length) {
    return <article className="mt-4 whitespace-pre-wrap rounded-[1.5rem] bg-white/90 p-5 text-sm leading-7 text-slate-700 shadow-inner ring-1 ring-white/80">{cleanAIReportText(content)}</article>;
  }

  return (
    <div className="mt-4 space-y-3" data-report-variant={variant}>
      {sections.map((section, index) => (
        <section key={`${section.title}-${index}`} className="rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-sm shadow-slate-200/60 ring-1 ring-white/70">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">{displayTitle(section.title)}</h3>
            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-400 ring-1 ring-white/80">VD Report</span>
          </div>
          <div className="space-y-3">
            {section.blocks.map((block, blockIndex) => <ReportBlock key={blockIndex} block={block} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
