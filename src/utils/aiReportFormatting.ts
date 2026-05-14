export type AIReportBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'bulletList'; items: string[] }
  | { type: 'numberedList'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] };

export interface AIReportSection {
  title: string;
  blocks: AIReportBlock[];
}

function stripMarkdownSyntax(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/`/g, '')
    .replace(/\s+([，。；：、？！])/g, '$1');
}

function removeListMarker(text: string): string {
  return text
    .trim()
    .replace(/^[-*+•]\s+/, '')
    .replace(/^\d+[.)、]\s+/, '')
    .replace(/^\[[ xX]]\s+/, '')
    .trim();
}

export function cleanInlineMarkdown(text: string): string {
  return removeListMarker(stripMarkdownSyntax(text)).trim();
}

export function cleanAIReportText(text: string): string {
  return stripMarkdownSyntax(text)
    .split('\n')
    .map((line) => cleanInlineMarkdown(line).trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^\*\*[^*]{2,80}\*\*\s*:?$/.test(trimmed)) return true;
  if (/^\d+[.)、]\s*\*\*[^*]{2,80}\*\*\s*:?$/.test(trimmed)) return true;
  return false;
}

function normalizeHeading(line: string): string {
  return cleanInlineMarkdown(line.replace(/^#{1,6}\s+/, '')).replace(/[：:]$/, '');
}

function isBullet(line: string): boolean {
  return /^\s*[-*+•]\s+/.test(line) || /^\s*\[[ xX]]\s+/.test(line);
}

function normalizeBullet(line: string): string {
  return cleanInlineMarkdown(line);
}

function isNumbered(line: string): boolean {
  return /^\s*\d+[.)、]\s+/.test(line.trim());
}

function normalizeNumbered(line: string): string {
  return cleanInlineMarkdown(line);
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 4;
}

function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function parseTable(lines: string[], startIndex: number): { block: AIReportBlock; nextIndex: number } | undefined {
  const tableLines: string[] = [];
  let index = startIndex;
  while (index < lines.length && isTableRow(lines[index])) {
    if (!isTableSeparator(lines[index])) tableLines.push(lines[index]);
    index += 1;
  }
  if (tableLines.length < 2) return undefined;
  const rows = tableLines.map((line) => line.trim().slice(1, -1).split('|').map((cell) => cleanInlineMarkdown(cell.trim())));
  return { block: { type: 'table', headers: rows[0], rows: rows.slice(1) }, nextIndex: index };
}

function appendParagraph(blocks: AIReportBlock[], paragraphLines: string[]): void {
  const text = paragraphLines.map(cleanInlineMarkdown).filter(Boolean).join(' ').trim();
  if (text) blocks.push({ type: 'paragraph', text });
}

function parseBlocks(lines: string[]): AIReportBlock[] {
  const blocks: AIReportBlock[] = [];
  let index = 0;
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    appendParagraph(blocks, paragraphLines);
    paragraphLines = [];
  };

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (isTableRow(line)) {
      flushParagraph();
      const parsedTable = parseTable(lines, index);
      if (parsedTable) {
        blocks.push(parsedTable.block);
        index = parsedTable.nextIndex;
        continue;
      }
    }

    if (isBullet(line)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && isBullet(lines[index])) {
        const item = normalizeBullet(lines[index]);
        if (item) items.push(item);
        index += 1;
      }
      if (items.length) blocks.push({ type: 'bulletList', items });
      continue;
    }

    if (isNumbered(line)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && isNumbered(lines[index])) {
        const item = normalizeNumbered(lines[index]);
        if (item) items.push(item);
        index += 1;
      }
      if (items.length) blocks.push({ type: 'numberedList', items });
      continue;
    }

    paragraphLines.push(line);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

export function parseAIReportSections(text: string): AIReportSection[] {
  const rawLines = text.replace(/\r\n/g, '\n').split('\n');
  const sections: AIReportSection[] = [];
  let currentTitle = '系统报告';
  let currentLines: string[] = [];

  const flushSection = () => {
    const blocks = parseBlocks(currentLines);
    if (blocks.length) sections.push({ title: normalizeHeading(currentTitle), blocks });
    currentLines = [];
  };

  for (const line of rawLines) {
    if (isHeading(line)) {
      flushSection();
      currentTitle = normalizeHeading(line);
    } else {
      currentLines.push(line);
    }
  }

  flushSection();
  if (sections.length) return sections;

  const cleaned = cleanAIReportText(text);
  return cleaned ? [{ title: '系统报告', blocks: parseBlocks(cleaned.split('\n')) }] : [];
}
