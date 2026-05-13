import { useEffect, useMemo, useState } from 'react';
import { applyNodeChanges, Background, Controls, ReactFlow, type Edge, type Node, type NodeChange } from '@xyflow/react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { storageKeys } from '../storage';
import type { SocialPersonData } from '../types/task';

const CURRENT_SOCIAL_LAYOUT_VERSION = 9;
const CENTER = { x: 720, y: 560 };
const DEFAULT_PERSON_COLOR = '#d8e2dc';
const CENTER_NODE_COLOR = '#1e293b';
const MAX_SOCIAL_DISTANCE = 1400;
const NODE_WIDTH = 132;
const NODE_HEIGHT = 62;

type SocialNode = Node<SocialPersonData>;
type LegacySocialData = Partial<SocialPersonData> & { details?: string; nickname?: string };
type LegacySocialNode = Partial<Node<LegacySocialData>>;
type ContactSortField = 'name' | 'favorability';
type SortDirection = 'asc' | 'desc';
interface ContactSortState {
  field: ContactSortField;
  direction: SortDirection;
}
interface NormalizeNodesOptions {
  relayout?: boolean;
}

const socialClusters = [
  { id: 'family', label: '家人', color: '#fed7aa', angle: -Math.PI / 2, keywords: ['家人', '家庭', '亲人', '父母', 'family'] },
  { id: 'close', label: '亲密朋友', color: '#fecdd3', angle: -0.72, keywords: ['密友', '好友', '朋友', 'close'] },
  { id: 'classmate', label: '同学', color: '#bfdbfe', angle: 0.05, keywords: ['同学', 'classmate', '学校'] },
  { id: 'mentor', label: '导师', color: '#ddd6fe', angle: 0.82, keywords: ['导师', 'mentor', '老师', 'coach'] },
  { id: 'work', label: '工作/研究', color: '#bae6fd', angle: 1.68, keywords: ['同事', '工作', '研究', 'work', 'research'] },
  { id: 'online', label: '线上朋友', color: '#ccfbf1', angle: 2.54, keywords: ['线上', '网友', 'online'] },
  { id: 'other', label: '其他关系', color: '#e2e8f0', angle: 3.45, keywords: [] },
];

function clampScore(value: unknown, fallback = 50): number {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(100, Math.max(0, Math.round(numericValue)));
}

function normalizeAngle(value: unknown): number | undefined {
  const angle = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(angle)) return undefined;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function stableHash(seed: string): number {
  return Array.from(seed).reduce((sum, character) => sum * 31 + character.charCodeAt(0), 7);
}

function stableOffset(seed: string, spread: number): number {
  return ((stableHash(seed) % 1000) / 999 - 0.5) * spread;
}

function angleFromPosition(position: unknown): number | undefined {
  if (!position || typeof position !== 'object') return undefined;
  const candidate = position as SocialNode['position'];
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return undefined;
  const distance = Math.hypot(candidate.x + NODE_WIDTH / 2 - CENTER.x, candidate.y + NODE_HEIGHT / 2 - CENTER.y);
  if (distance <= 1 || distance > MAX_SOCIAL_DISTANCE) return undefined;
  return Math.atan2(candidate.y + NODE_HEIGHT / 2 - CENTER.y, candidate.x + NODE_WIDTH / 2 - CENTER.x);
}

function isValidSocialPosition(position: unknown): position is SocialNode['position'] {
  if (!position || typeof position !== 'object') return false;
  const candidate = position as SocialNode['position'];
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return false;
  return Math.hypot(candidate.x + NODE_WIDTH / 2 - CENTER.x, candidate.y + NODE_HEIGHT / 2 - CENTER.y) <= MAX_SOCIAL_DISTANCE;
}


function clusterFor(data: Partial<SocialPersonData>) {
  const source = `${data.roleCategory ?? ''} ${data.relationshipType ?? ''}`.toLowerCase();
  return socialClusters.find((cluster) => cluster.keywords.some((keyword) => source.includes(keyword.toLowerCase()))) ?? socialClusters.at(-1)!;
}

function normalizeRoleCategory(data?: LegacySocialData): string {
  const explicit = data?.roleCategory?.trim();
  if (explicit) return explicit;
  return data?.relationshipType?.trim() || '其他关系';
}

function relationshipStrength(data: SocialPersonData): number {
  return clampScore(data.subjectiveFavorability);
}

function socialRing(score: number): { label: string; radius: number } {
  const radius = socialRadius(score);
  if (score >= 80) return { label: '核心关系', radius };
  if (score >= 60) return { label: '亲近关系', radius };
  if (score >= 40) return { label: '熟悉关系', radius };
  if (score >= 20) return { label: '普通关系', radius };
  return { label: '外围关系', radius };
}

function socialRadius(score: number): number {
  return 160 + (100 - clampScore(score)) * 5.2;
}

function targetPosition(node: SocialNode, index: number): SocialNode['position'] {
  const data = node.data ?? normalizeSocialData(undefined);
  const cluster = socialClusters.find((item) => item.id === data.cluster) ?? clusterFor(data);
  const score = clampScore(data.subjectiveFavorability);
  const radius = socialRadius(score) + stableOffset(`${node.id}-radius`, 34);
  const angle = normalizeAngle(data.angle) ?? cluster.angle + stableOffset(`${node.id}-angle`, 0.66) + (index % 4 - 1.5) * 0.06;
  return {
    x: Math.round(CENTER.x + Math.cos(angle) * radius - NODE_WIDTH / 2),
    y: Math.round(CENTER.y + Math.sin(angle) * radius - NODE_HEIGHT / 2),
  };
}

function avoidCollisions(nodes: SocialNode[]): SocialNode[] {
  const placed: SocialNode[] = [];
  for (const node of nodes) {
    if (node.id === 'me') {
      placed.push(node);
      continue;
    }
    let position = { ...node.position };
    let angle = angleFromPosition(position) ?? node.data?.angle ?? 0;
    let radius = Math.hypot(position.x + NODE_WIDTH / 2 - CENTER.x, position.y + NODE_HEIGHT / 2 - CENTER.y);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const overlaps = placed.some((placedNode) => Math.abs(position.x - placedNode.position.x) < NODE_WIDTH + 18 && Math.abs(position.y - placedNode.position.y) < NODE_HEIGHT + 18);
      if (!overlaps) break;
      angle += 0.18 + stableOffset(`${node.id}-collision-${attempt}`, 0.06);
      radius += 12;
      position = {
        x: Math.round(CENTER.x + Math.cos(angle) * radius - NODE_WIDTH / 2),
        y: Math.round(CENTER.y + Math.sin(angle) * radius - NODE_HEIGHT / 2),
      };
    }
    placed.push({ ...node, position });
  }
  return placed;
}


function meNode(): SocialNode {
  return {
    id: 'me',
    position: { x: CENTER.x - NODE_WIDTH / 2, y: CENTER.y - NODE_HEIGHT / 2 },
    data: { name: '我', relationshipType: '中心', roleCategory: '自我', subjectiveFavorability: '100', familiarity: '100', trust: '100', interactionFrequency: '100', emotionalCloseness: '100', influenceWeight: '100', lastInteractionDate: '', notes: '关系地图的中心节点', bio: '', currentSocialState: '', angle: 0, cluster: 'center', avatarInitial: '我', color: CENTER_NODE_COLOR },
  };
}

function normalizeSocialData(data?: LegacySocialData, isCenter = false): SocialPersonData {
  const mergedNotes = [data?.notes, data?.details].filter(Boolean).join('\n\n').trim();
  const roleCategory = isCenter ? '自我' : normalizeRoleCategory(data);
  const baseData = {
    name: isCenter ? data?.name || '我' : data?.name || data?.nickname || '未命名联系人',
    relationshipType: isCenter ? '中心' : data?.relationshipType || roleCategory,
    subjectiveFavorability: String(clampScore(data?.subjectiveFavorability, isCenter ? 100 : 50)),
    familiarity: String(clampScore(data?.familiarity, isCenter ? 100 : 50)),
    trust: String(clampScore(data?.trust, isCenter ? 100 : 50)),
    interactionFrequency: String(clampScore(data?.interactionFrequency, isCenter ? 100 : 45)),
    emotionalCloseness: String(clampScore(data?.emotionalCloseness, isCenter ? 100 : 50)),
    influenceWeight: String(clampScore(data?.influenceWeight, isCenter ? 100 : 45)),
    roleCategory,
    lastInteractionDate: data?.lastInteractionDate || '',
    notes: isCenter ? data?.notes || '关系地图的中心节点' : mergedNotes,
    bio: data?.bio || '',
    currentSocialState: data?.currentSocialState || '',
    avatarInitial: data?.avatarInitial || (data?.name || data?.nickname || '未').slice(0, 1),
    manualPosition: Boolean(data?.manualPosition),
    angle: normalizeAngle(data?.angle),
    color: data?.color,
  } satisfies SocialPersonData;
  const cluster = isCenter ? 'center' : clusterFor(baseData).id;
  const color = data?.color || (isCenter ? CENTER_NODE_COLOR : socialClusters.find((item) => item.id === cluster)?.color ?? DEFAULT_PERSON_COLOR);
  return { ...baseData, cluster, color };
}

function seedNodes(): SocialNode[] {
  return [meNode()];
}

function normalizeNodes(nodes: unknown, options: NormalizeNodesOptions = {}): SocialNode[] {
  if (!Array.isArray(nodes) || nodes.length === 0) return seedNodes();
  const rawPeople = nodes.filter((node): node is LegacySocialNode => Boolean(node) && typeof node === 'object').filter((node) => node.id !== 'me');
  const prepared = rawPeople.map((node, index) => {
    const id = String(node.id || crypto.randomUUID());
    const data = normalizeSocialData(node.data);
    const storedPosition = isValidSocialPosition(node.position) ? node.position : undefined;
    const angle = normalizeAngle(data.angle) ?? angleFromPosition(storedPosition) ?? (socialClusters.find((cluster) => cluster.id === data.cluster)?.angle ?? 0) + stableOffset(id, 0.72);
    const shouldKeepStoredPosition = Boolean(storedPosition) && !options.relayout;
    const position = shouldKeepStoredPosition ? storedPosition! : targetPosition({ id, position: { x: 0, y: 0 }, data: { ...data, angle, manualPosition: false } }, index);
    return { id, position, data: { ...data, angle, manualPosition: shouldKeepStoredPosition ? data.manualPosition : false } };
  });
  const laidOut = options.relayout ? avoidCollisions(prepared) : prepared;
  return [meNode(), ...laidOut];
}

function getSocialData(node: SocialNode): SocialPersonData {
  return normalizeSocialData(node.data, node.id === 'me');
}

function buildRelationshipEdges(nodes: SocialNode[]): Edge<{ familiarity: number }>[] {
  return nodes.filter((node) => node.id !== 'me').map((node) => ({ id: `me-${node.id}`, source: 'me', target: node.id, data: { familiarity: relationshipStrength(getSocialData(node)) } }));
}

const favorabilityField: { key: keyof SocialPersonData; label: string } = { key: 'subjectiveFavorability', label: '好感度' };

function formatLastInteraction(value?: string): string {
  if (!value) return '未记录';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '未记录';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

export function SocialPage() {
  const [storedNodes, setStoredNodes] = useLocalStorage<SocialNode[]>(storageKeys.socialNodes, seedNodes());
  const [layoutVersion, setLayoutVersion] = useLocalStorage<number>(storageKeys.socialLayoutVersion, 0);
  const normalizedNodes = useMemo(() => normalizeNodes(storedNodes), [storedNodes]);
  const relationshipEdges = useMemo(() => buildRelationshipEdges(normalizedNodes), [normalizedNodes]);
  const [editingNode, setEditingNode] = useState<SocialNode | undefined>();
  const [contactSort, setContactSort] = useState<ContactSortState | undefined>();
  const contacts = normalizedNodes.filter((node) => node.id !== 'me');
  const sortedContacts = contactSort
    ? [...contacts].sort((a, b) => {
        const aData = getSocialData(a);
        const bData = getSocialData(b);
        const directionMultiplier = contactSort.direction === 'asc' ? 1 : -1;
        if (contactSort.field === 'favorability') return (clampScore(aData.subjectiveFavorability) - clampScore(bData.subjectiveFavorability)) * directionMultiplier;
        return aData.name.localeCompare(bData.name, 'zh-CN', { numeric: true, sensitivity: 'base' }) * directionMultiplier;
      })
    : contacts;
  const clusterCounts = socialClusters.map((cluster) => ({ ...cluster, count: contacts.filter((node) => node.data?.cluster === cluster.id).length })).filter((cluster) => cluster.count > 0);

  useEffect(() => {
    if (layoutVersion < CURRENT_SOCIAL_LAYOUT_VERSION) {
      setStoredNodes(normalizeNodes(storedNodes, { relayout: true }));
      setLayoutVersion(CURRENT_SOCIAL_LAYOUT_VERSION);
      return;
    }
    if (JSON.stringify(storedNodes) !== JSON.stringify(normalizedNodes)) setStoredNodes(normalizedNodes);
  }, [layoutVersion, normalizedNodes, setLayoutVersion, setStoredNodes, storedNodes]);

  function handleNodesChange(changes: NodeChange<SocialNode>[]) {
    const movedNodeIds = new Set(changes.filter((change) => change.type === 'position' && change.position).map((change) => change.id));
    setStoredNodes((nodes) => {
      const currentNodes = normalizeNodes(nodes);
      const changedNodes = applyNodeChanges(changes, currentNodes);
      return currentNodes.map((node) => {
        if (node.id === 'me') return meNode();
        if (!movedNodeIds.has(node.id)) return node;
        const changedNode = changedNodes.find((item) => item.id === node.id);
        if (!changedNode || !isValidSocialPosition(changedNode.position)) return node;
        const angle = angleFromPosition(changedNode.position) ?? node.data?.angle;
        const data = { ...getSocialData(node), angle, manualPosition: true };
        return { ...node, position: changedNode.position, data };
      });
    });
  }

  function updateEditingData(field: keyof SocialPersonData, value: string) {
    if (editingNode) setEditingNode({ ...editingNode, data: { ...getSocialData(editingNode), [field]: value } });
  }

  function addPerson() {
    const baseNodes = normalizeNodes(storedNodes);
    const id = crypto.randomUUID();
    const data = normalizeSocialData({ name: '未命名联系人', relationshipType: '朋友', roleCategory: '朋友' });
    const newNode: SocialNode = { id, position: targetPosition({ id, position: { x: 0, y: 0 }, data }, baseNodes.length), data };
    setStoredNodes([...baseNodes, newNode]);
    setEditingNode(newNode);
  }

  function saveNode() {
    if (!editingNode) return;
    const sanitizedData = getSocialData(editingNode);
    const existingNode = normalizedNodes.find((node) => node.id === editingNode.id);
    const shouldKeepPosition = editingNode.id !== 'me' && sanitizedData.manualPosition && isValidSocialPosition(existingNode?.position);
    const position = editingNode.id === 'me'
      ? meNode().position
      : shouldKeepPosition
        ? existingNode!.position
        : targetPosition({ ...editingNode, data: sanitizedData }, normalizedNodes.findIndex((node) => node.id === editingNode.id));
    const sanitizedNode = { ...editingNode, data: sanitizedData, position };
    setStoredNodes((nodes) => normalizeNodes(nodes).map((node) => (node.id === sanitizedNode.id ? sanitizedNode : node)));
    setEditingNode(undefined);
  }

  function cycleContactSort(field: ContactSortField) {
    setContactSort((current) => {
      if (!current || current.field !== field) return { field, direction: 'asc' };
      if (current.direction === 'asc') return { field, direction: 'desc' };
      return undefined;
    });
  }

  function sortArrow(field: ContactSortField): string {
    if (!contactSort || contactSort.field !== field) return '▵';
    return contactSort.direction === 'asc' ? '▲' : '▼';
  }

  function relayoutSocialGraph() {
    setStoredNodes((nodes) => normalizeNodes(nodes, { relayout: true }));
    setLayoutVersion(CURRENT_SOCIAL_LAYOUT_VERSION);
  }

  function deleteNode() {
    if (!editingNode || editingNode.id === 'me') return;
    setStoredNodes((nodes) => normalizeNodes(nodes).filter((node) => node.id !== editingNode.id));
    setEditingNode(undefined);
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.24em] text-slate-400">社交图谱</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">社交</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">好感度决定关系距离；拖动联系人只移动并固定当前节点。</p>
          </div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={relayoutSocialGraph} className="rounded-full bg-white/85 px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">重新布局</button><button type="button" onClick={addPerson} className="rounded-full bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">添加联系人</button></div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {clusterCounts.length === 0 ? <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-400">暂无联系人</span> : clusterCounts.map((cluster) => <span key={cluster.id} className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-white/80" style={{ backgroundColor: cluster.color }}>{cluster.label} · {cluster.count}</span>)}
        </div>
      </div>

      <div className="relative h-[72vh] min-h-[560px] overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 p-3 shadow-xl shadow-slate-200/60 backdrop-blur md:min-h-[680px]">
        <div className="pointer-events-none absolute left-5 top-5 z-10 max-w-md rounded-2xl bg-white/85 px-4 py-3 text-xs leading-5 text-slate-500 shadow-sm ring-1 ring-white/80 backdrop-blur">好感度决定距离；拖动只移动当前节点并固定位置。Ctrl/⌘ + 滚轮或按钮缩放。</div>
        {contacts.length === 0 ? <div className="pointer-events-none absolute inset-x-0 top-24 z-10 text-center text-sm font-medium text-slate-400">添加对你重要的人，构建你的关系地图。</div> : null}
        <ReactFlow nodes={normalizedNodes} edges={relationshipEdges} onNodesChange={handleNodesChange} onNodeClick={(_, node) => setEditingNode(node)} selectedNodeId={editingNode?.id} fitView className="rounded-[1.5rem] bg-slate-50/80"><Background /><Controls /></ReactFlow>
      </div>
      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">通讯录</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">所有联系人</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">所有社交节点的列表视图，方便查找、编辑和复盘。微信通讯录导入：未来支持。</p>
          </div>
          <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-white/80">{contacts.length} 人</span>
        </div>

        {contacts.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">暂无联系人。添加联系人后会出现在这里。</div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white/70">
            <div className="hidden grid-cols-[1fr_1fr_0.75fr_0.9fr_1.4fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-semibold text-slate-400 md:grid">
              <button type="button" onClick={() => cycleContactSort('name')} className="text-left font-semibold text-slate-500 hover:text-slate-900">姓名 <span className="ml-1 text-slate-400">{sortArrow('name')}</span></button>
              <span>关系</span>
              <button type="button" onClick={() => cycleContactSort('favorability')} className="text-left font-semibold text-slate-500 hover:text-slate-900">好感度 <span className="ml-1 text-slate-400">{sortArrow('favorability')}</span></button>
              <span>最近互动</span><span>备注</span><span>操作</span>
            </div>
            <div className="divide-y divide-slate-100">
              {sortedContacts.map((node) => {
                const data = getSocialData(node);
                const favorability = clampScore(data.subjectiveFavorability);
                return (
                  <article key={node.id} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1fr_1fr_0.75fr_0.9fr_1.4fr_auto] md:items-center">
                    <button type="button" onClick={() => setEditingNode(node)} className="text-left font-semibold text-slate-950 hover:text-sky-700">{data.name}</button>
                    <div className="text-slate-500"><span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold ring-1 ring-white/80">{data.roleCategory || data.relationshipType}</span></div>
                    <div className="font-semibold text-slate-700">{favorability}/100</div>
                    <div className="text-slate-500">{formatLastInteraction(data.lastInteractionDate)}</div>
                    <p className="line-clamp-2 text-slate-500">{data.notes || '暂无备注'}</p>
                    <button type="button" onClick={() => setEditingNode(node)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-lg font-semibold leading-none text-slate-500 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">⋯</button>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {editingNode ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/15 px-4 backdrop-blur-sm">
          <section className="w-full max-w-2xl rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-2xl shadow-slate-300/60">
            <h2 className="text-2xl font-semibold text-slate-950">{editingNode.id === 'me' ? '编辑中心节点' : '编辑关系'}</h2>
            <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">表单只保留当前最必要的信息；旧数据中的熟悉度、信任等字段会继续保留在本地存储中。</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-600">
                {editingNode.id === 'me' ? '昵称' : '姓名'}
                <input value={editingNode.data?.name ?? ''} onChange={(event) => updateEditingData('name', event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" />
              </label>
              {editingNode.id === 'me' ? (
                <>
                  <label className="text-sm font-medium text-slate-600">当前社交状态<input value={editingNode.data?.currentSocialState ?? ''} onChange={(event) => updateEditingData('currentSocialState', event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
                  <label className="text-sm font-medium text-slate-600 md:col-span-2">简介<textarea value={editingNode.data?.bio ?? ''} onChange={(event) => updateEditingData('bio', event.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
                </>
              ) : (
                <>
                  <label className="text-sm font-medium text-slate-600">角色/分类<input value={editingNode.data?.roleCategory ?? ''} onChange={(event) => updateEditingData('roleCategory', event.target.value)} placeholder="同学、家人、线上朋友……" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
                  <label className="text-sm font-medium text-slate-600 md:col-span-2">{favorabilityField.label}<div className="mt-2 flex items-center gap-3"><input type="range" min="0" max="100" value={clampScore(editingNode.data?.[favorabilityField.key])} onChange={(event) => updateEditingData(favorabilityField.key, event.target.value)} className="w-full accent-slate-900" /><input type="number" min="0" max="100" value={clampScore(editingNode.data?.[favorabilityField.key])} onChange={(event) => updateEditingData(favorabilityField.key, String(clampScore(event.target.value)))} className="w-24 rounded-2xl border border-slate-200 px-3 py-2" /></div><p className="mt-2 text-xs text-slate-400">{socialRing(clampScore(editingNode.data?.subjectiveFavorability)).label}</p></label>
                </>
              )}
              <label className="text-sm font-medium text-slate-600">节点颜色<input type="color" value={editingNode.data?.color ?? DEFAULT_PERSON_COLOR} onChange={(event) => updateEditingData('color', event.target.value)} className="mt-2 h-12 w-24 rounded-2xl border border-slate-200 bg-white p-1" /></label>
              <label className="text-sm font-medium text-slate-600 md:col-span-2">关系备注<textarea value={editingNode.data?.notes ?? ''} onChange={(event) => updateEditingData('notes', event.target.value)} placeholder="记忆、互动提醒、共同话题、未来跟进……" className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
            </div>
            <div className="mt-6 flex flex-wrap justify-between gap-3"><button type="button" disabled={editingNode.id === 'me'} onClick={deleteNode} className="rounded-full px-4 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300">删除</button><div className="flex gap-3"><button type="button" onClick={() => setEditingNode(undefined)} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">取消</button><button type="button" onClick={saveNode} className="rounded-full bg-white/85 px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">保存</button></div></div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
