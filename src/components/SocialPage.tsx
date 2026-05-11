import { useEffect, useMemo, useState } from 'react';
import { applyNodeChanges, Background, Controls, ReactFlow, type Edge, type Node, type NodeChange } from '@xyflow/react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { SocialPersonData } from '../types/task';

const SOCIAL_NODES_KEY = 'visualized-deadline.social.nodes';
const CENTER = { x: 680, y: 560 };
const DEFAULT_PERSON_COLOR = '#d8e2dc';
const CENTER_NODE_COLOR = '#cbd5e1';
const NODE_GAP = 170;

type SocialNode = Node<SocialPersonData>;
type LegacySocialData = Partial<SocialPersonData> & { details?: string; nickname?: string };
type LegacySocialNode = Partial<Node<LegacySocialData>>;

function clampScore(value: unknown, fallback = 50): number {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(100, Math.max(0, Math.round(numericValue)));
}

function orbitRadius(favorability: number): number {
  if (favorability >= 80) return 140;
  if (favorability >= 60) return 250;
  if (favorability >= 40) return 360;
  return 470;
}

function orbitPosition(node: SocialNode, index: number, siblings: SocialNode[]): SocialNode['position'] {
  if (node.id === 'me') return CENTER;
  const favorability = clampScore(node.data?.subjectiveFavorability);
  let radius = orbitRadius(favorability);
  const sameBand = siblings.filter((item) => item.id !== 'me' && orbitRadius(clampScore(item.data?.subjectiveFavorability)) === radius);
  const bandIndex = Math.max(0, sameBand.findIndex((item) => item.id === node.id));
  const slots = Math.max(8, sameBand.length + 3);

  for (let ringOffset = 0; ringOffset < 4; ringOffset += 1) {
    const candidateRadius = radius + ringOffset * 46;
    for (let offset = 0; offset < slots; offset += 1) {
      const angle = ((bandIndex + offset * 0.37) / slots) * Math.PI * 2 - Math.PI / 2 + index * 0.09;
      const position = { x: Math.round(CENTER.x + Math.cos(angle) * candidateRadius), y: Math.round(CENTER.y + Math.sin(angle) * candidateRadius) };
      const collides = siblings.some((sibling) => sibling.id !== node.id && Math.hypot(sibling.position.x - position.x, sibling.position.y - position.y) < NODE_GAP);
      if (!collides) return position;
    }
  }
  return { x: CENTER.x + radius, y: CENTER.y + index * NODE_GAP };
}

function meNode(): SocialNode {
  return { id: 'me', position: CENTER, data: { name: '我', relationshipType: '中心', subjectiveFavorability: '100', familiarity: '100', lastInteractionDate: '', notes: '关系地图的中心节点', bio: '', currentSocialState: '', color: CENTER_NODE_COLOR } };
}

function normalizeSocialData(data?: LegacySocialData, isCenter = false): SocialPersonData {
  const mergedNotes = [data?.notes, data?.details].filter(Boolean).join('\n\n').trim();
  return {
    name: isCenter ? data?.name || '我' : data?.name || data?.nickname || '未命名联系人',
    relationshipType: isCenter ? '中心' : data?.relationshipType || '',
    subjectiveFavorability: String(clampScore(data?.subjectiveFavorability, isCenter ? 100 : 50)),
    familiarity: String(clampScore(data?.familiarity, isCenter ? 100 : 50)),
    lastInteractionDate: data?.lastInteractionDate || '',
    notes: isCenter ? data?.notes || '关系地图的中心节点' : mergedNotes,
    bio: data?.bio || '',
    currentSocialState: data?.currentSocialState || '',
    color: data?.color || (isCenter ? CENTER_NODE_COLOR : DEFAULT_PERSON_COLOR),
  };
}

function seedNodes(): SocialNode[] { return [meNode()]; }

function normalizeNodes(nodes: unknown): SocialNode[] {
  if (!Array.isArray(nodes) || nodes.length === 0) return seedNodes();
  const people = nodes
    .filter((node): node is LegacySocialNode => Boolean(node) && typeof node === 'object')
    .filter((node) => node.id !== 'me')
    .map((node) => ({ id: node.id || crypto.randomUUID(), position: { x: 0, y: 0 }, data: normalizeSocialData(node.data) }));
  const positioned: SocialNode[] = [meNode()];
  people.forEach((node, index) => positioned.push({ ...node, position: orbitPosition(node, index, positioned) }));
  return positioned;
}

function getSocialData(node: SocialNode): SocialPersonData { return normalizeSocialData(node.data, node.id === 'me'); }

function buildRelationshipEdges(nodes: SocialNode[]): Edge<{ familiarity: number }>[] {
  return nodes.filter((node) => node.id !== 'me').map((node) => ({ id: `me-${node.id}`, source: 'me', target: node.id, data: { familiarity: clampScore(node.data?.familiarity) } }));
}

function applyVisualOverrides(nodes: SocialNode[], overrides: Record<string, SocialNode['position']>): SocialNode[] {
  return nodes.map((node) => (node.id === 'me' ? { ...node, position: CENTER } : { ...node, position: overrides[node.id] ?? node.position }));
}

export function SocialPage() {
  const [storedNodes, setStoredNodes] = useLocalStorage<SocialNode[]>(SOCIAL_NODES_KEY, seedNodes());
  const normalizedNodes = useMemo(() => normalizeNodes(storedNodes), [storedNodes]);
  const relationshipEdges = useMemo(() => buildRelationshipEdges(normalizedNodes), [normalizedNodes]);
  const [editingNode, setEditingNode] = useState<SocialNode | undefined>();
  const [visualOverrides, setVisualOverrides] = useState<Record<string, SocialNode['position']>>({});
  const graphNodes = useMemo(() => applyVisualOverrides(normalizedNodes, visualOverrides), [normalizedNodes, visualOverrides]);
  const hasContacts = normalizedNodes.some((node) => node.id !== 'me');

  useEffect(() => { if (JSON.stringify(storedNodes) !== JSON.stringify(normalizedNodes)) setStoredNodes(normalizedNodes); }, [normalizedNodes, setStoredNodes, storedNodes]);

  function handleNodesChange(changes: NodeChange<SocialNode>[]) {
    setVisualOverrides((overrides) => {
      const changedNodes = applyNodeChanges(changes, graphNodes);
      const nextOverrides = { ...overrides };
      changedNodes.forEach((node) => { if (node.id !== 'me') nextOverrides[node.id] = node.position; });
      return nextOverrides;
    });
  }

  function updateEditingData(field: keyof SocialPersonData, value: string) { if (editingNode) setEditingNode({ ...editingNode, data: { ...getSocialData(editingNode), [field]: value } }); }

  function addPerson() {
    const newNode: SocialNode = { id: crypto.randomUUID(), position: CENTER, data: { name: '未命名联系人', relationshipType: '', subjectiveFavorability: '50', familiarity: '50', lastInteractionDate: '', notes: '', color: DEFAULT_PERSON_COLOR } };
    const baseNodes = normalizeNodes(storedNodes);
    const positionedNode = { ...newNode, position: orbitPosition(newNode, baseNodes.length, baseNodes) };
    setStoredNodes([...baseNodes, positionedNode]);
    setEditingNode(positionedNode);
  }

  function saveNode() {
    if (!editingNode) return;
    const sanitizedNode = { ...editingNode, data: getSocialData(editingNode) };
    setStoredNodes((nodes) => normalizeNodes(nodes).map((node, index, all) => node.id === sanitizedNode.id ? { ...sanitizedNode, position: sanitizedNode.id === 'me' ? CENTER : orbitPosition(sanitizedNode, index, all) } : node));
    setVisualOverrides((overrides) => { const { [sanitizedNode.id]: _removed, ...rest } = overrides; return rest; });
    setEditingNode(undefined);
  }

  function deleteNode() {
    if (!editingNode || editingNode.id === 'me') return;
    setStoredNodes((nodes) => normalizeNodes(nodes).filter((node) => node.id !== editingNode.id));
    setVisualOverrides((overrides) => { const { [editingNode.id]: _removed, ...rest } = overrides; return rest; });
    setEditingNode(undefined);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/60 backdrop-blur"><div><p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">关系宇宙</p><h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">社交关系</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">以“我”为中心，按主观好感度观察关系距离。</p></div><button type="button" onClick={addPerson} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">添加联系人</button></div>
      <div className="relative h-[78vh] min-h-[680px] overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 p-3 shadow-xl shadow-slate-200/60 backdrop-blur">
        {!hasContacts ? <div className="pointer-events-none absolute inset-x-0 top-24 z-10 text-center text-sm font-medium text-slate-400">添加对你重要的人，构建你的关系地图。</div> : null}
        <ReactFlow nodes={graphNodes} edges={relationshipEdges} onNodesChange={handleNodesChange} onNodeClick={(_, node) => setEditingNode(node)} fitView className="rounded-[1.5rem] bg-slate-50/80"><Background /><Controls /></ReactFlow>
      </div>
      {editingNode ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/15 px-4 backdrop-blur-sm"><section className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-2xl shadow-slate-300/60"><h2 className="text-2xl font-semibold text-slate-950">{editingNode.id === 'me' ? '编辑中心节点' : '编辑关系'}</h2><div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-600">{editingNode.id === 'me' ? '昵称' : '姓名'}<input value={editingNode.data?.name ?? ''} onChange={(event) => updateEditingData('name', event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
        {editingNode.id === 'me' ? <><label className="text-sm font-medium text-slate-600">当前社交状态<input value={editingNode.data?.currentSocialState ?? ''} onChange={(event) => updateEditingData('currentSocialState', event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium text-slate-600 md:col-span-2">简介<textarea value={editingNode.data?.bio ?? ''} onChange={(event) => updateEditingData('bio', event.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label></> : <><label className="text-sm font-medium text-slate-600">关系类型<input value={editingNode.data?.relationshipType ?? ''} onChange={(event) => updateEditingData('relationshipType', event.target.value)} placeholder="朋友、导师、家人……" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label><label className="text-sm font-medium text-slate-600 md:col-span-2">主观好感度<div className="mt-2 flex items-center gap-3"><input type="range" min="0" max="100" value={clampScore(editingNode.data?.subjectiveFavorability)} onChange={(event) => updateEditingData('subjectiveFavorability', event.target.value)} className="w-full accent-slate-900" /><input type="number" min="0" max="100" value={clampScore(editingNode.data?.subjectiveFavorability)} onChange={(event) => updateEditingData('subjectiveFavorability', String(clampScore(event.target.value)))} className="w-24 rounded-2xl border border-slate-200 px-3 py-2" /></div></label><label className="text-sm font-medium text-slate-600 md:col-span-2">熟悉程度<div className="mt-2 flex items-center gap-3"><input type="range" min="0" max="100" value={clampScore(editingNode.data?.familiarity)} onChange={(event) => updateEditingData('familiarity', event.target.value)} className="w-full accent-slate-900" /><input type="number" min="0" max="100" value={clampScore(editingNode.data?.familiarity)} onChange={(event) => updateEditingData('familiarity', String(clampScore(event.target.value)))} className="w-24 rounded-2xl border border-slate-200 px-3 py-2" /></div></label><label className="text-sm font-medium text-slate-600">最近互动时间<input type="date" value={editingNode.data?.lastInteractionDate ?? ''} onChange={(event) => updateEditingData('lastInteractionDate', event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label></>}
        <label className="text-sm font-medium text-slate-600">节点颜色<input type="color" value={editingNode.data?.color ?? DEFAULT_PERSON_COLOR} onChange={(event) => updateEditingData('color', event.target.value)} className="mt-2 h-12 w-24 rounded-2xl border border-slate-200 bg-white p-1" /></label><label className="text-sm font-medium text-slate-600 md:col-span-2">关系备注<textarea value={editingNode.data?.notes ?? ''} onChange={(event) => updateEditingData('notes', event.target.value)} placeholder="记忆、互动提醒、情绪观察、共同话题、未来跟进……" className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label></div><div className="mt-6 flex flex-wrap justify-between gap-3"><button type="button" disabled={editingNode.id === 'me'} onClick={deleteNode} className="rounded-full px-4 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300">删除</button><div className="flex gap-3"><button type="button" onClick={() => setEditingNode(undefined)} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">取消</button><button type="button" onClick={saveNode} className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white">保存</button></div></div></section></div> : null}
    </section>
  );
}
