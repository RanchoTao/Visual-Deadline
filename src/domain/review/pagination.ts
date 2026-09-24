export interface ReviewRowPage<T> { data: T[]; total?: number; }

export async function collectReviewRowPages<T>(loadPage: (offset: number) => Promise<ReviewRowPage<T>>): Promise<T[]> {
  const rows: T[] = []; let offset = 0;
  while (true) {
    const page = await loadPage(offset);
    rows.push(...page.data); offset += page.data.length;
    if (page.data.length === 0 || (page.total !== undefined && offset >= page.total)) return rows;
  }
}
