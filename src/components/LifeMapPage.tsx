import { useEffect, useMemo, useState } from 'react';
import { applyNodeChanges, Background, Controls, ReactFlow, type Edge, type Node, type NodeChange } from '@xyflow/react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { LifeMapNodeData } from '../types/task';

const LIFE_MAP_NODES_KEY = 'visualized-deadline.lifeMap.nodes';
const LIFE_CENTER = { x: 620, y: 430 };
const ORBIT_STEP = 120;
const NODE_GAP = 170;

type LifeNode = Node<LifeMapNodeData>;

const domainSeeds: LifeMapNodeData[] = [
  { title: '学习', description: '课程、技能与日常学习节奏。', color: '#bfdbfe' },
  { title: '研究', description: '长期问题、论文与实验推进。', color: '#ddd6fe' },
  { title: '健身', description: '训练、力量与身体状态。', color: '#bbf7d0' },
  { title: '资产管理', description: '收入、支出、储蓄与风险边界。', color: '#fde68a' },
  { title: '社交', description: '关系维护与社交能量。', color: '#fecdd3' },
  { title: '内容', description: '表达、作品与内容资产。', color: '#bae6fd' },
  { title: '健康', description: '睡眠、饮食与基础健康信号。', color: '#d9f99d' },
];

function orbitPoint(index: number, radius = 260): LifeNode['position'] {
  const angle = (Math.PI * 2 * index) / Math.max(domainSeeds.length, 8) - Math.PI / 2;
  return { x: Math.round(LIFE_CENTER.x + Math.cos(angle) * radius), y: Math.round(LIFE_CENTER.y + Math.sin(angle) * radius) };
}

function hasCollision(position: LifeNode['position'], nodes: LifeNode[]): boolean {
  return nodes.some((node) => Math.hypot(node.position.x - position.x, node.position.y - position.y) < NODE_GAP);
}

function findAvailablePosition(nodes: LifeNode[]): LifeNode['position'] {
  for (let ring = 0; ring < 5; ring += 1) {
    const radius = 240 + ring * ORBIT_STEP;
    const slots = 8 + ring * 6;
    for (let slot = 0; slot < slots; slot += 1) {
      const angle = (Math.PI * 2 * slot) / slots - Math.PI / 2;
      const position = { x: Math.round(LIFE_CENTER.x + Math.cos(angle) * radius), y: Math.round(LIFE_CENTER.y + Math.sin(angle) * radius) };
      if (!hasCollision(position, nodes)) return position;
    }
  }
  return { x: LIFE_CENTER.x + 420, y: LIFE_CENTER.y + 220 };
}

function createSeedNodes(): LifeNode[] {
  return [
    { id: 'me', position: LIFE_CENTER, data: { title: '我', description: 'LifeOS 的中心节点', currentStage: '', notes: '', color: '#cbd5e1' } },
    ...domainSeeds.map((domain, index) => ({ id: `life-${index}`, position: orbitPoint(index), data: domain })),
  ];
}

function createEdges(nodes: LifeNode[]): Edge[] {
  return nodes.filter((node) => node.id !== 'me').map((node) => ({ id: `me-${node.id}`, source: 'me', target: node.id }));
}

function normalizeNodes(nodes: unknown): LifeNode[] {
  if (!Array.isArray(nodes) || nodes.length === 0) return createSeedNodes();
  const existing: LifeNode[] = [];
  const safeNodes = nodes
    .filter((node): node is Partial<LifeNode> => Boolean(node) && typeof node === 'object')
    .map((node) => {
      const isCenter = node.id === 'me';
      const nextNode: LifeNode = {
        id: node.id || crypto.randomUUID(),
        position: isCenter ? LIFE_CENTER : node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number' ? node.position : findAvailablePosition(existing),
        data: {
          title: isCenter ? node.data?.title || '我' : node.data?.title || '未命名节点',
          description: node.data?.description || '',
          currentStage: node.data?.currentStage || '',
          notes: node.data?.notes || '',
          color: node.data?.color || (isCenter ? '#cbd5e1' : '#e2e8f0'),
        },
      };
      existing.push(nextNode);
      return nextNode;
    });
  return safeNodes.some((node) => node.id === 'me') ? safeNodes.map((node) => (node.id === 'me' ? { ...node, position: LIFE_CENTER } : node)) : [createSeedNodes()[0], ...safeNodes];
}

function getLifeMapData(node: LifeNode): LifeMapNodeData {
  return { title: node.data?.title ?? '', description: node.data?.description ?? '', currentStage: node.data?.currentStage ?? '', notes: node.data?.notes ?? '', color: node.data?.color ?? '#e2e8f0' };
}

export function LifeMapPage() {
  const [storedNodes, setStoredNodes] = useLocalStorage<LifeNode[]>(LIFE_MAP_NODES_KEY, createSeedNodes());
  const normalizedNodes = useMemo(() => normalizeNodes(storedNodes), [storedNodes]);
  const edges = useMemo(() => createEdges(normalizedNodes), [normalizedNodes]);
  const [editingNode, setEditingNode] = useState<LifeNode | undefined>();

  useEffect(() => {
    if (JSON.stringify(storedNodes) !== JSON.stringify(normalizedNodes)) setStoredNodes(normalizedNodes);
  }, [normalizedNodes, setStoredNodes, storedNodes]);

  function handleNodesChange(changes: NodeChange<LifeNode>[]) {
    setStoredNodes((nodes) => applyNodeChanges(changes, normalizeNodes(nodes)).map((node) => (node.id === 'me' ? { ...node, position: LIFE_CENTER } : node)));
  }

  function addNode() {
    const baseNodes = normalizeNodes(storedNodes);
    const newNode: LifeNode = { id: crypto.randomUUID(), position: findAvailablePosition(baseNodes), data: { title: '新的生活节点', description: '', currentStage: '', notes: '', color: '#e0f2fe' } };
    setStoredNodes([...baseNodes, newNode]);
    setEditingNode(newNode);
  }

  function saveNode() {
    if (!editingNode) return;
    setStoredNodes((nodes) => normalizeNodes(nodes).map((node) => (node.id === editingNode.id ? { ...editingNode, data: getLifeMapData(editingNode), position: editingNode.id === 'me' ? LIFE_CENTER : editingNode.position } : node)));
    setEditingNode(undefined);
  }

  function deleteNode() {
    if (!editingNode || editingNode.id === 'me') return;
    setStoredNodes((nodes) => normalizeNodes(nodes).filter((node) => node.id !== editingNode.id));
    setEditingNode(undefined);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
        <div><p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">人生地图</p><h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">人生地图</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">把生活领域摊开成一张可拖动的地图。点击节点编辑，拖动时不会误开弹窗。</p></div>
        <button type="button" onClick={addNode} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">添加节点</button>
      </div>

      <div className="h-[78vh] min-h-[680px] overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 p-3 shadow-xl shadow-slate-200/60 backdrop-blur">
        <ReactFlow nodes={normalizedNodes} edges={edges} onNodesChange={handleNodesChange} onNodeClick={(_, node) => setEditingNode(node)} fitView className="rounded-[1.5rem] bg-slate-50/80"><Background /><Controls /></ReactFlow>
      </div>

      {editingNode ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/15 px-4 backdrop-blur-sm"><section className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-2xl shadow-slate-300/60">
          <h2 className="text-2xl font-semibold text-slate-950">{editingNode.id === 'me' ? '编辑中心节点' : '编辑生活节点'}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-600">{editingNode.id === 'me' ? '昵称' : '节点名称'}<input value={editingNode.data?.title ?? ''} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getLifeMapData(editingNode), title: event.target.value } })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
            <label className="text-sm font-medium text-slate-600">当前阶段<input value={editingNode.data?.currentStage ?? ''} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getLifeMapData(editingNode), currentStage: event.target.value } })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
            <label className="text-sm font-medium text-slate-600 md:col-span-2">简介<textarea value={editingNode.data?.description ?? ''} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getLifeMapData(editingNode), description: event.target.value } })} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
            <label className="text-sm font-medium text-slate-600">节点颜色<input type="color" value={editingNode.data?.color ?? '#e2e8f0'} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getLifeMapData(editingNode), color: event.target.value } })} className="mt-2 h-12 w-24 rounded-2xl border border-slate-200 bg-white p-1" /></label>
            <label className="text-sm font-medium text-slate-600 md:col-span-2">备注<textarea value={editingNode.data?.notes ?? ''} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getLifeMapData(editingNode), notes: event.target.value } })} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
          </div>
          <div className="mt-6 flex flex-wrap justify-between gap-3"><button type="button" disabled={editingNode.id === 'me'} onClick={deleteNode} className="rounded-full px-4 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300">删除</button><div className="flex gap-3"><button type="button" onClick={() => setEditingNode(undefined)} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">取消</button><button type="button" onClick={saveNode} className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white">保存</button></div></div>
        </section></div>
      ) : null}
    </section>
  );
}
