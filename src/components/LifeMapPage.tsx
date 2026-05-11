import { useEffect, useMemo, useState } from 'react';
import { applyNodeChanges, Background, Controls, ReactFlow, type Edge, type Node, type NodeChange } from '@xyflow/react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { LifeMapNodeData } from '../types/task';

const LIFE_MAP_NODES_KEY = 'visualized-deadline.lifeMap.nodes';
const LIFE_MAP_EDGES_KEY = 'visualized-deadline.lifeMap.edges';

const domainSeeds: LifeMapNodeData[] = [
  { title: 'Academic', description: '课程、考试与学术节奏。', color: '#bfdbfe' },
  { title: 'Research', description: '研究问题、论文与实验推进。', color: '#ddd6fe' },
  { title: 'Fitness', description: '训练、恢复与身体能力。', color: '#bbf7d0' },
  { title: 'Finance', description: '收入、支出与风险边界。', color: '#fde68a' },
  { title: 'Social', description: '关系维护与社交能量。', color: '#fecdd3' },
  { title: 'Content', description: '表达、作品与内容资产。', color: '#bae6fd' },
  { title: 'Health', description: '睡眠、饮食与基础健康信号。', color: '#d9f99d' },
];

function createSeedNodes(): Node<LifeMapNodeData>[] {
  const centerX = 360;
  const centerY = 250;
  const radius = 230;
  return [
    { id: 'me', position: { x: centerX, y: centerY }, data: { title: '我', description: 'LifeOS 的中心节点', color: '#cbd5e1' } },
    ...domainSeeds.map((domain, index) => {
      const angle = (Math.PI * 2 * index) / domainSeeds.length - Math.PI / 2;
      return { id: `life-${domain.title.toLowerCase()}`, position: { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius }, data: domain };
    }),
  ];
}

function createEdges(nodes: Node<LifeMapNodeData>[]): Edge[] {
  return nodes.filter((node) => node.id !== 'me').map((node) => ({ id: `me-${node.id}`, source: 'me', target: node.id }));
}

function normalizeNodes(nodes: unknown): Node<LifeMapNodeData>[] {
  if (!Array.isArray(nodes) || nodes.length === 0) return createSeedNodes();
  const safeNodes = nodes
    .filter((node): node is Partial<Node<LifeMapNodeData>> => Boolean(node) && typeof node === 'object')
    .map((node) => ({
      id: node.id || crypto.randomUUID(),
      position: node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number' ? node.position : { x: 120, y: 120 },
      data: {
        title: node.data?.title || '未命名节点',
        description: node.data?.description || '',
        color: node.data?.color || '#e2e8f0',
      },
    }));
  return safeNodes.some((node) => node.id === 'me') ? safeNodes : [createSeedNodes()[0], ...safeNodes];
}

function getLifeMapData(node: Node<LifeMapNodeData>): LifeMapNodeData {
  return {
    title: node.data?.title ?? '',
    description: node.data?.description ?? '',
    color: node.data?.color ?? '#e2e8f0',
  };
}

function normalizeEdges(edges: unknown, nodes: Node<LifeMapNodeData>[]): Edge[] {
  if (!Array.isArray(edges) || edges.length === 0) return createEdges(nodes);
  const nodeIds = new Set(nodes.map((node) => node.id));
  return edges.filter((edge): edge is Edge => Boolean(edge) && typeof edge === 'object' && nodeIds.has((edge as Edge).source) && nodeIds.has((edge as Edge).target));
}

export function LifeMapPage() {
  const [storedNodes, setStoredNodes] = useLocalStorage<Node<LifeMapNodeData>[]>(LIFE_MAP_NODES_KEY, createSeedNodes());
  const normalizedNodes = useMemo(() => normalizeNodes(storedNodes), [storedNodes]);
  const [storedEdges, setStoredEdges] = useLocalStorage<Edge[]>(LIFE_MAP_EDGES_KEY, createEdges(normalizedNodes));
  const normalizedEdges = useMemo(() => normalizeEdges(storedEdges, normalizedNodes), [storedEdges, normalizedNodes]);
  const [editingNode, setEditingNode] = useState<Node<LifeMapNodeData> | undefined>();

  useEffect(() => {
    if (JSON.stringify(storedNodes) !== JSON.stringify(normalizedNodes)) setStoredNodes(normalizedNodes);
  }, [normalizedNodes, setStoredNodes, storedNodes]);

  useEffect(() => {
    if (JSON.stringify(storedEdges) !== JSON.stringify(normalizedEdges)) setStoredEdges(normalizedEdges);
  }, [normalizedEdges, setStoredEdges, storedEdges]);

  function handleNodesChange(changes: NodeChange<Node<LifeMapNodeData>>[]) {
    setStoredNodes((nodes) => applyNodeChanges(changes, normalizeNodes(nodes)));
  }

  function addNode() {
    const id = crypto.randomUUID();
    const newNode: Node<LifeMapNodeData> = { id, position: { x: 140 + Math.random() * 360, y: 120 + Math.random() * 260 }, data: { title: '新的生活节点', description: '', color: '#e0f2fe' } };
    setStoredNodes((nodes) => [...normalizeNodes(nodes), newNode]);
    setStoredEdges((edges) => [...normalizeEdges(edges, normalizedNodes), { id: `me-${id}`, source: 'me', target: id }]);
    setEditingNode(newNode);
  }

  function saveNode() {
    if (!editingNode) return;
    setStoredNodes((nodes) => normalizeNodes(nodes).map((node) => (node.id === editingNode.id ? editingNode : node)));
    setEditingNode(undefined);
  }

  function deleteNode() {
    if (!editingNode || editingNode.id === 'me') return;
    setStoredNodes((nodes) => normalizeNodes(nodes).filter((node) => node.id !== editingNode.id));
    setStoredEdges((edges) => normalizeEdges(edges, normalizedNodes).filter((edge) => edge.source !== editingNode.id && edge.target !== editingNode.id));
    setEditingNode(undefined);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Life Map</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">人生地图</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">以“我”为中心整理生活结构。当前是本地图谱原型，节点位置和内容会保存在浏览器中。</p>
        </div>
        <button type="button" onClick={addNode} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">添加节点</button>
      </div>

      <div className="h-[620px] overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 p-3 shadow-xl shadow-slate-200/60 backdrop-blur">
        {/* Future versions may connect life-map nodes to VD tasks and vary node size/color by investment, progress, or life load. */}
        <ReactFlow nodes={normalizedNodes} edges={normalizedEdges} onNodesChange={handleNodesChange} onNodeClick={(_, node) => setEditingNode(node)} fitView className="rounded-[1.5rem] bg-slate-50/80">
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      {editingNode ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/15 px-4 backdrop-blur-sm">
          <section className="w-full max-w-lg rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-2xl shadow-slate-300/60">
            <h2 className="text-2xl font-semibold text-slate-950">编辑人生节点</h2>
            <label className="mt-4 block text-sm font-medium text-slate-600">名称<input value={editingNode.data?.title ?? ''} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getLifeMapData(editingNode), title: event.target.value } })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
            <label className="mt-4 block text-sm font-medium text-slate-600">描述<textarea value={editingNode.data?.description ?? ''} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getLifeMapData(editingNode), description: event.target.value } })} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
            <label className="mt-4 block text-sm font-medium text-slate-600">颜色<input type="color" value={editingNode.data?.color ?? '#e2e8f0'} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getLifeMapData(editingNode), color: event.target.value } })} className="mt-2 h-12 w-24 rounded-2xl border border-slate-200 bg-white p-1" /></label>
            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <button type="button" disabled={editingNode.id === 'me'} onClick={deleteNode} className="rounded-full px-4 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300">删除</button>
              <div className="flex gap-3"><button type="button" onClick={() => setEditingNode(undefined)} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">取消</button><button type="button" onClick={saveNode} className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white">保存</button></div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
