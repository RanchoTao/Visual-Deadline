import { useEffect, useMemo, useState } from 'react';
import { applyNodeChanges, Background, Controls, ReactFlow, type Edge, type Node, type NodeChange } from '@xyflow/react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { storageKeys } from '../storage';
import type { SocialPersonData } from '../types/task';

const CURRENT_SOCIAL_LAYOUT_VERSION = 6;
const CENTER = { x: 720, y: 560 };
const DEFAULT_PERSON_COLOR = '#d8e2dc';
const CENTER_NODE_COLOR = '#1e293b';
const MAX_SOCIAL_DISTANCE = 1400;
const NODE_WIDTH = 132;
const NODE_HEIGHT = 62;
const MIN_NODE_GAP = 118;

type SocialNode = Node<SocialPersonData>;
type LegacySocialData = Partial<SocialPersonData> & { details?: string; nickname?: string };
type LegacySocialNode = Partial<Node<LegacySocialData>>;

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

function daysSince(date: string): number {
  if (!date) return 365;
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return 365;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
}

function recencyScore(date: string): number {
  return Math.max(0, 100 - Math.min(180, daysSince(date)) * 0.55);
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
  return Math.round(
    clampScore(data.subjectiveFavorability) * 0.2 +
    clampScore(data.familiarity) * 0.18 +
    clampScore(data.trust) * 0.2 +
    clampScore(data.interactionFrequency) * 0.14 +
    recencyScore(data.lastInteractionDate) * 0.1 +
    clampScore(data.emotionalCloseness) * 0.13 +
    clampScore(data.influenceWeight) * 0.05,
  );
}

function targetPosition(node: SocialNode, index: number): SocialNode['position'] {
  const data = node.data ?? normalizeSocialData(undefined);
  const cluster = socialClusters.find((item) => item.id === data.cluster) ?? clusterFor(data);
  const strength = relationshipStrength(data);
  const influence = clampScore(data.influenceWeight);
  const radius = 170 + (1 - strength / 100) * 560 - influence * 0.55 + (index % 4) * 16;
  const angle = normalizeAngle(data.angle) ?? cluster.angle + stableOffset(node.id, 0.72);
  return {
    x: Math.round(CENTER.x + Math.cos(angle) * radius - NODE_WIDTH / 2),
    y: Math.round(CENTER.y + Math.sin(angle) * radius - NODE_HEIGHT / 2),
  };
}

function relaxCollisions(nodes: SocialNode[]): SocialNode[] {
  const relaxed = nodes.map((node) => ({ ...node, position: { ...node.position } }));
  for (let iteration = 0; iteration < 34; iteration += 1) {
    for (let a = 0; a < relaxed.length; a += 1) {
      for (let b = a + 1; b < relaxed.length; b += 1) {
        const left = relaxed[a];
        const right = relaxed[b];
        const dx = right.position.x - left.position.x;
        const dy = right.position.y - left.position.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        if (distance >= MIN_NODE_GAP) continue;
        const push = (MIN_NODE_GAP - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        left.position.x = Math.round(left.position.x - ux * push);
        left.position.y = Math.round(left.position.y - uy * push);
        right.position.x = Math.round(right.position.x + ux * push);
        right.position.y = Math.round(right.position.y + uy * push);
      }
    }
  }
  return relaxed;
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

function normalizeNodes(nodes: unknown): SocialNode[] {
  if (!Array.isArray(nodes) || nodes.length === 0) return seedNodes();
  const rawPeople = nodes.filter((node): node is LegacySocialNode => Boolean(node) && typeof node === 'object').filter((node) => node.id !== 'me');
  const sortedPeople = rawPeople.map((node) => ({ ...node, id: node.id || crypto.randomUUID() })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const prepared = sortedPeople.map((node, index) => {
    const data = normalizeSocialData(node.data);
    const angle = normalizeAngle(data.angle) ?? angleFromPosition(node.position) ?? (socialClusters.find((cluster) => cluster.id === data.cluster)?.angle ?? 0) + stableOffset(String(node.id), 0.72);
    const position = data.manualPosition && isValidSocialPosition(node.position) ? node.position : targetPosition({ id: String(node.id), position: { x: 0, y: 0 }, data: { ...data, angle } }, index);
    return { id: String(node.id), position, data: { ...data, angle } };
  });
  return [meNode(), ...relaxCollisions(prepared)];
}

function getSocialData(node: SocialNode): SocialPersonData {
  return normalizeSocialData(node.data, node.id === 'me');
}

function buildRelationshipEdges(nodes: SocialNode[]): Edge<{ familiarity: number }>[] {
  return nodes.filter((node) => node.id !== 'me').map((node) => ({ id: `me-${node.id}`, source: 'me', target: node.id, data: { familiarity: relationshipStrength(getSocialData(node)) } }));
}

const metricFields: { key: keyof SocialPersonData; label: string }[] = [
  { key: 'subjectiveFavorability', label: '好感度' },
  { key: 'familiarity', label: '熟悉度' },
  { key: 'trust', label: '信任' },
  { key: 'interactionFrequency', label: '互动频率' },
  { key: 'emotionalCloseness', label: '情感亲近' },
  { key: 'influenceWeight', label: '影响权重' },
];

export function SocialPage() {
  const [storedNodes, setStoredNodes] = useLocalStorage<SocialNode[]>(storageKeys.socialNodes, seedNodes());
  const [layoutVersion, setLayoutVersion] = useLocalStorage<number>(storageKeys.socialLayoutVersion, 0);
  const normalizedNodes = useMemo(() => normalizeNodes(storedNodes), [storedNodes]);
  const relationshipEdges = useMemo(() => buildRelationshipEdges(normalizedNodes), [normalizedNodes]);
  const [editingNode, setEditingNode] = useState<SocialNode | undefined>();
  const contacts = normalizedNodes.filter((node) => node.id !== 'me');
  const clusterCounts = socialClusters.map((cluster) => ({ ...cluster, count: contacts.filter((node) => node.data?.cluster === cluster.id).length })).filter((cluster) => cluster.count > 0);

  useEffect(() => {
    if (layoutVersion < CURRENT_SOCIAL_LAYOUT_VERSION || JSON.stringify(storedNodes) !== JSON.stringify(normalizedNodes)) {
      setStoredNodes(normalizedNodes);
      setLayoutVersion(CURRENT_SOCIAL_LAYOUT_VERSION);
    }
  }, [layoutVersion, normalizedNodes, setLayoutVersion, setStoredNodes, storedNodes]);

  function handleNodesChange(changes: NodeChange<SocialNode>[]) {
    setStoredNodes((nodes) => {
      const currentNodes = normalizeNodes(nodes);
      const changedNodes = applyNodeChanges(changes, currentNodes);
      return currentNodes.map((node) => {
        if (node.id === 'me') return meNode();
        const changedNode = changedNodes.find((item) => item.id === node.id);
        if (!changedNode) return node;
        const angle = angleFromPosition(changedNode.position) ?? node.data?.angle;
        return { ...node, position: changedNode.position, data: { ...getSocialData(node), angle, manualPosition: true } };
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
    const sanitizedNode = { ...editingNode, data: sanitizedData, position: editingNode.id === 'me' ? meNode().position : editingNode.position };
    setStoredNodes((nodes) => normalizeNodes(nodes).map((node) => (node.id === sanitizedNode.id ? sanitizedNode : node)));
    setEditingNode(undefined);
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
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Social Memory Map · v0.8</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">社交</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">多因素嵌入会综合好感、熟悉、信任、互动、亲近与影响力来形成距离和软聚类。</p>
          </div>
          <button type="button" onClick={addPerson} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">添加联系人</button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {clusterCounts.length === 0 ? <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-400">暂无联系人</span> : clusterCounts.map((cluster) => <span key={cluster.id} className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-white/80" style={{ backgroundColor: cluster.color }}>{cluster.label} · {cluster.count}</span>)}
        </div>
      </div>

      <div className="relative h-[72vh] min-h-[560px] overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 p-3 shadow-xl shadow-slate-200/60 backdrop-blur md:min-h-[680px]">
        <div className="pointer-events-none absolute left-5 top-5 z-10 max-w-md rounded-2xl bg-white/85 px-4 py-3 text-xs leading-5 text-slate-500 shadow-sm ring-1 ring-white/80 backdrop-blur">距离由多因素强度决定；颜色代表自动聚类；拖动节点可固定手动位置。Ctrl/⌘ + 滚轮或按钮缩放。</div>
        {contacts.length === 0 ? <div className="pointer-events-none absolute inset-x-0 top-24 z-10 text-center text-sm font-medium text-slate-400">添加对你重要的人，构建你的关系地图。</div> : null}
        <ReactFlow nodes={normalizedNodes} edges={relationshipEdges} onNodesChange={handleNodesChange} onNodeClick={(_, node) => setEditingNode(node)} selectedNodeId={editingNode?.id} fitView className="rounded-[1.5rem] bg-slate-50/80"><Background /><Controls /></ReactFlow>
      </div>

      {editingNode ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/15 px-4 backdrop-blur-sm"><section className="max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-2xl shadow-slate-300/60"><h2 className="text-2xl font-semibold text-slate-950">{editingNode.id === 'me' ? '编辑中心节点' : '编辑关系'}</h2><p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">社交图谱会根据多维指标重新计算软聚类与距离；手动拖动的位置会被保留。</p><div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-600">{editingNode.id === 'me' ? '昵称' : '姓名'}<input value={editingNode.data?.name ?? ''} onChange={(event) => updateEditingData('name', event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
        {editingNode.id === 'me' ? <><label className="text-sm font-medium text-slate-600">当前社交状态<input value={editingNode.data?.currentSocialState ?? ''} onChange={(event) => updateEditingData('currentSocialState', event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium text-slate-600 md:col-span-2">简介<textarea value={editingNode.data?.bio ?? ''} onChange={(event) => updateEditingData('bio', event.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label></> : <><label className="text-sm font-medium text-slate-600">关系类型<input value={editingNode.data?.relationshipType ?? ''} onChange={(event) => updateEditingData('relationshipType', event.target.value)} placeholder="朋友、导师、家人……" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium text-slate-600">角色/分类<input value={editingNode.data?.roleCategory ?? ''} onChange={(event) => updateEditingData('roleCategory', event.target.value)} placeholder="同学、家人、线上朋友……" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium text-slate-600">最近互动时间<input type="date" value={editingNode.data?.lastInteractionDate ?? ''} onChange={(event) => updateEditingData('lastInteractionDate', event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label></>}
        {editingNode.id !== 'me' ? metricFields.map((field) => <label key={field.key} className="text-sm font-medium text-slate-600 md:col-span-2">{field.label}<div className="mt-2 flex items-center gap-3"><input type="range" min="0" max="100" value={clampScore(editingNode.data?.[field.key])} onChange={(event) => updateEditingData(field.key, event.target.value)} className="w-full accent-slate-900" /><input type="number" min="0" max="100" value={clampScore(editingNode.data?.[field.key])} onChange={(event) => updateEditingData(field.key, String(clampScore(event.target.value)))} className="w-24 rounded-2xl border border-slate-200 px-3 py-2" /></div></label>) : null}
        <label className="text-sm font-medium text-slate-600">节点颜色<input type="color" value={editingNode.data?.color ?? DEFAULT_PERSON_COLOR} onChange={(event) => updateEditingData('color', event.target.value)} className="mt-2 h-12 w-24 rounded-2xl border border-slate-200 bg-white p-1" /></label><label className="text-sm font-medium text-slate-600 md:col-span-2">关系备注<textarea value={editingNode.data?.notes ?? ''} onChange={(event) => updateEditingData('notes', event.target.value)} placeholder="记忆、互动提醒、情绪观察、共同话题、未来跟进……" className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label></div><div className="mt-6 flex flex-wrap justify-between gap-3"><button type="button" disabled={editingNode.id === 'me'} onClick={deleteNode} className="rounded-full px-4 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300">删除</button><div className="flex gap-3"><button type="button" onClick={() => setEditingNode(undefined)} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">取消</button><button type="button" onClick={saveNode} className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white">保存</button></div></div></section></div> : null}
    </section>
  );
}
