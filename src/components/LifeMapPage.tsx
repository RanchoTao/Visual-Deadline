import { useEffect, useMemo, useState } from 'react';
import { applyNodeChanges, Background, Controls, ReactFlow, type Edge, type Node, type NodeChange } from '@xyflow/react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { storageKeys } from '../storage';
import type { LifeMapNodeData } from '../types/task';

const CURRENT_LIFE_MAP_LAYOUT_VERSION = 4;
const LIFE_CENTER = { x: 600, y: 560 };
const NODE_GAP = 150;
const TREE_COLUMNS = [120, 360, 600, 840];
const TREE_ROWS = [150, 330];

type LifeNode = Node<LifeMapNodeData>;
type LifeEdgeData = { route: 'orthogonal'; label?: string };

const domainSeeds: LifeMapNodeData[] = [
  { title: '学习', description: '课程、技能与日常学习节奏。', color: '#dbeafe' },
  { title: '研究', description: '长期问题、论文与实验推进。', color: '#ede9fe' },
  { title: '健身', description: '训练、力量与身体状态。', color: '#dcfce7' },
  { title: '健康', description: '睡眠、饮食与基础健康信号。', color: '#ecfccb' },
  { title: '社交', description: '关系维护与社交能量。', color: '#ffe4e6' },
  { title: '资产管理', description: '收入、支出、储蓄与风险边界。', color: '#fef3c7' },
  { title: '内容', description: '表达、作品与内容资产。', color: '#cffafe' },
  { title: '个人思考', description: '复盘、价值观与长期判断。', color: '#e2e8f0' },
];

const legacyDomainTitleMap: Record<string, string> = {
  Academic: '学习',
  Research: '研究',
  Fitness: '健身',
  Finance: '资产管理',
  Social: '社交',
  Content: '内容',
  Health: '健康',
  学术研究: '学习',
  学习工作: '学习',
  社会交流: '社交',
  内容创作: '内容',
  身体健康: '健康',
};

function normalizeLifeTitle(title: string, nodeId?: string): string {
  const legacyTitle = legacyDomainTitleMap[title];
  if (legacyTitle) return legacyTitle;
  if (nodeId?.startsWith('life-')) {
    const seedIndex = Number(nodeId.replace('life-', ''));
    if (Number.isInteger(seedIndex) && domainSeeds[seedIndex]) return domainSeeds[seedIndex].title;
  }
  return title || '未命名节点';
}

function treePosition(index: number): LifeNode['position'] {
  if (index < 4) return { x: TREE_COLUMNS[index], y: TREE_ROWS[1] };
  if (index < 8) return { x: TREE_COLUMNS[index - 4], y: TREE_ROWS[0] };
  const extraIndex = index - 8;
  const row = Math.floor(extraIndex / 4);
  const column = extraIndex % 4;
  return { x: TREE_COLUMNS[column], y: Math.max(40, TREE_ROWS[0] - (row + 1) * 135) };
}

function hasCollision(position: LifeNode['position'], nodes: LifeNode[]): boolean {
  return nodes.some((node) => Math.hypot(node.position.x - position.x, node.position.y - position.y) < NODE_GAP);
}

function findAvailablePosition(nodes: LifeNode[]): LifeNode['position'] {
  for (let index = 0; index < 40; index += 1) {
    const position = treePosition(index);
    if (!hasCollision(position, nodes)) return position;
  }
  return { x: LIFE_CENTER.x + 360, y: LIFE_CENTER.y - 520 };
}

function createSeedNodes(): LifeNode[] {
  return [
    { id: 'me', type: 'life', position: LIFE_CENTER, data: { title: '我', description: 'LifeOS 的中心节点', currentStage: '', notes: '', color: '#cbd5e1' } },
    ...domainSeeds.map((domain, index) => ({ id: `life-${index}`, type: 'life', position: treePosition(index), data: domain })),
  ];
}

function createEdges(nodes: LifeNode[]): Edge<LifeEdgeData>[] {
  return nodes.filter((node) => node.id !== 'me').map((node) => ({ id: `me-${node.id}`, source: 'me', target: node.id, data: { route: 'orthogonal' } }));
}

function normalizeNodes(nodes: unknown, forceRelayout = false): LifeNode[] {
  if (!Array.isArray(nodes) || nodes.length === 0) return createSeedNodes();
  const rawNodes = nodes.filter((node): node is Partial<LifeNode> => Boolean(node) && typeof node === 'object');
  const storedCenter = rawNodes.find((node) => node.id === 'me');
  const centerNode: LifeNode = {
    id: 'me',
    type: 'life',
    position: LIFE_CENTER,
    data: {
      title: storedCenter?.data?.title || '我',
      description: storedCenter?.data?.description || 'LifeOS 的中心节点',
      currentStage: storedCenter?.data?.currentStage || '',
      notes: storedCenter?.data?.notes || '',
      color: storedCenter?.data?.color || '#cbd5e1',
    },
  };
  const existing: LifeNode[] = [centerNode];
  const lifeNodes = rawNodes
    .filter((node) => node.id !== 'me')
    .map((node, index) => {
      const position = forceRelayout ? treePosition(index) : node.position && Number.isFinite(node.position.x) && Number.isFinite(node.position.y) && !hasCollision(node.position, existing) ? node.position : findAvailablePosition(existing);
      const nextNode: LifeNode = {
        id: node.id || crypto.randomUUID(),
        type: 'life',
        position,
        data: {
          title: normalizeLifeTitle(node.data?.title || '', node.id),
          description: node.data?.description || '',
          currentStage: node.data?.currentStage || '',
          notes: node.data?.notes || '',
          color: node.data?.color || domainSeeds[index]?.color || '#e2e8f0',
        },
      };
      existing.push(nextNode);
      return nextNode;
    });
  return [centerNode, ...lifeNodes];
}

function getLifeMapData(node: LifeNode): LifeMapNodeData {
  return { title: node.data?.title ?? '', description: node.data?.description ?? '', currentStage: node.data?.currentStage ?? '', notes: node.data?.notes ?? '', color: node.data?.color ?? '#e2e8f0' };
}

export function LifeMapPage() {
  const [storedNodes, setStoredNodes] = useLocalStorage<LifeNode[]>(storageKeys.lifeMapNodes, createSeedNodes());
  const [layoutVersion, setLayoutVersion] = useLocalStorage<number>(storageKeys.lifeMapLayoutVersion, 0);
  const normalizedNodes = useMemo(() => normalizeNodes(storedNodes, layoutVersion < CURRENT_LIFE_MAP_LAYOUT_VERSION), [layoutVersion, storedNodes]);
  const edges = useMemo(() => createEdges(normalizedNodes), [normalizedNodes]);
  const [editingNode, setEditingNode] = useState<LifeNode | undefined>();

  useEffect(() => {
    if (layoutVersion < CURRENT_LIFE_MAP_LAYOUT_VERSION || JSON.stringify(storedNodes) !== JSON.stringify(normalizedNodes)) {
      setStoredNodes(normalizedNodes);
      setLayoutVersion(CURRENT_LIFE_MAP_LAYOUT_VERSION);
    }
  }, [layoutVersion, normalizedNodes, setLayoutVersion, setStoredNodes, storedNodes]);

  function handleNodesChange(changes: NodeChange<LifeNode>[]) {
    setStoredNodes((nodes) => applyNodeChanges(changes, normalizeNodes(nodes)).map((node) => (node.id === 'me' ? { ...node, position: LIFE_CENTER } : node)));
  }

  function addNode() {
    const baseNodes = normalizeNodes(storedNodes);
    const newNode: LifeNode = { id: crypto.randomUUID(), type: 'life', position: findAvailablePosition(baseNodes), data: { title: '新的生活节点', description: '', currentStage: '', notes: '', color: '#e0f2fe' } };
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
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-slate-400">人生结构树</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">人生地图</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">用路线图 / 技能树方式整理生活领域：底部是“我”，分支向上展开。点击节点编辑，拖动时不会误开弹窗。</p>
        </div>
        <button type="button" onClick={addNode} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">添加节点</button>
      </div>

      <div className="h-[78vh] min-h-[680px] touch-none select-none overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 p-3 shadow-xl shadow-slate-200/60 backdrop-blur">
        <ReactFlow nodes={normalizedNodes} edges={edges} onNodesChange={handleNodesChange} onNodeClick={(_, node) => setEditingNode(node)} fitView className="rounded-[1.5rem] bg-slate-50/80"><Background /><Controls /></ReactFlow>
      </div>

      {editingNode ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/15 px-4 backdrop-blur-sm"><section className="w-full max-w-2xl rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-2xl shadow-slate-300/60">
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
