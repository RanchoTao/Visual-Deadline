import { useEffect, useMemo, useState } from 'react';
import { applyNodeChanges, Background, Controls, ReactFlow, type Edge, type Node, type NodeChange } from '@xyflow/react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { SocialPersonData } from '../types/task';

const SOCIAL_NODES_KEY = 'visualized-deadline.social.nodes';
const SOCIAL_EDGES_KEY = 'visualized-deadline.social.edges';

function meNode(): Node<SocialPersonData> {
  return { id: 'me', position: { x: 360, y: 260 }, data: { name: '我', relationshipType: 'self', subjectiveFavorability: '', familiarity: '', lastInteractionDate: '', notes: '中心节点', details: '', color: '#cbd5e1' } };
}

function seedNodes(): Node<SocialPersonData>[] {
  return [meNode()];
}

function normalizeNodes(nodes: unknown): Node<SocialPersonData>[] {
  if (!Array.isArray(nodes) || nodes.length === 0) return seedNodes();
  const safeNodes = nodes
    .filter((node): node is Partial<Node<SocialPersonData>> => Boolean(node) && typeof node === 'object')
    .map((node) => ({
      id: node.id || crypto.randomUUID(),
      position: node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number' ? node.position : { x: 180, y: 180 },
      data: {
        name: node.data?.name || '未命名联系人',
        relationshipType: node.data?.relationshipType || '',
        subjectiveFavorability: node.data?.subjectiveFavorability || '',
        familiarity: node.data?.familiarity || '',
        lastInteractionDate: node.data?.lastInteractionDate || '',
        notes: node.data?.notes || '',
        details: node.data?.details || '',
        color: node.data?.color || '#e0f2fe',
      },
    }));
  return safeNodes.some((node) => node.id === 'me') ? safeNodes : [meNode(), ...safeNodes];
}

function getSocialData(node: Node<SocialPersonData>): SocialPersonData {
  return {
    name: node.data?.name ?? '',
    relationshipType: node.data?.relationshipType ?? '',
    subjectiveFavorability: node.data?.subjectiveFavorability ?? '',
    familiarity: node.data?.familiarity ?? '',
    lastInteractionDate: node.data?.lastInteractionDate ?? '',
    notes: node.data?.notes ?? '',
    details: node.data?.details ?? '',
    color: node.data?.color ?? '#dbeafe',
  };
}

function normalizeEdges(edges: unknown, nodes: Node<SocialPersonData>[]): Edge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!Array.isArray(edges)) return nodes.filter((node) => node.id !== 'me').map((node) => ({ id: `me-${node.id}`, source: 'me', target: node.id, animated: true }));
  return edges.filter((edge): edge is Edge => Boolean(edge) && typeof edge === 'object' && nodeIds.has((edge as Edge).source) && nodeIds.has((edge as Edge).target));
}

export function SocialPage() {
  const [storedNodes, setStoredNodes] = useLocalStorage<Node<SocialPersonData>[]>(SOCIAL_NODES_KEY, seedNodes());
  const normalizedNodes = useMemo(() => normalizeNodes(storedNodes), [storedNodes]);
  const [storedEdges, setStoredEdges] = useLocalStorage<Edge[]>(SOCIAL_EDGES_KEY, []);
  const normalizedEdges = useMemo(() => normalizeEdges(storedEdges, normalizedNodes), [storedEdges, normalizedNodes]);
  const [editingNode, setEditingNode] = useState<Node<SocialPersonData> | undefined>();

  useEffect(() => {
    if (JSON.stringify(storedNodes) !== JSON.stringify(normalizedNodes)) setStoredNodes(normalizedNodes);
  }, [normalizedNodes, setStoredNodes, storedNodes]);

  useEffect(() => {
    if (JSON.stringify(storedEdges) !== JSON.stringify(normalizedEdges)) setStoredEdges(normalizedEdges);
  }, [normalizedEdges, setStoredEdges, storedEdges]);

  function handleNodesChange(changes: NodeChange<Node<SocialPersonData>>[]) {
    setStoredNodes((nodes) => applyNodeChanges(changes, normalizeNodes(nodes)));
  }

  function addPerson() {
    const id = crypto.randomUUID();
    const newNode: Node<SocialPersonData> = {
      id,
      position: { x: 160 + Math.random() * 420, y: 120 + Math.random() * 320 },
      data: { name: '新的联系人', relationshipType: '', subjectiveFavorability: '', familiarity: '', lastInteractionDate: '', notes: '', details: '', color: '#dbeafe' },
    };
    setStoredNodes((nodes) => [...normalizeNodes(nodes), newNode]);
    setStoredEdges((edges) => [...normalizeEdges(edges, normalizedNodes), { id: `me-${id}`, source: 'me', target: id, animated: true }]);
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
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Social Graph</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">社交</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">以“我”为中心记录关系节点。这里不做排名或评判，只帮助你温和地观察关系结构。</p>
        </div>
        <button type="button" onClick={addPerson} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">添加联系人</button>
      </div>

      <div className="h-[620px] overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 p-3 shadow-xl shadow-slate-200/60 backdrop-blur">
        <ReactFlow nodes={normalizedNodes} edges={normalizedEdges} onNodesChange={handleNodesChange} onNodeClick={(_, node) => setEditingNode(node)} fitView className="rounded-[1.5rem] bg-slate-50/80">
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      {editingNode ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/15 px-4 backdrop-blur-sm">
          <section className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-2xl shadow-slate-300/60">
            <h2 className="text-2xl font-semibold text-slate-950">编辑关系节点</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-600">name / nickname<input value={editingNode.data?.name ?? ''} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getSocialData(editingNode), name: event.target.value } })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
              <label className="text-sm font-medium text-slate-600">relationshipType<input value={editingNode.data?.relationshipType ?? ''} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getSocialData(editingNode), relationshipType: event.target.value } })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
              <label className="text-sm font-medium text-slate-600">subjectiveFavorability<input value={editingNode.data?.subjectiveFavorability ?? ''} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getSocialData(editingNode), subjectiveFavorability: event.target.value } })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
              <label className="text-sm font-medium text-slate-600">familiarity<input value={editingNode.data?.familiarity ?? ''} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getSocialData(editingNode), familiarity: event.target.value } })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
              <label className="text-sm font-medium text-slate-600">lastInteractionDate<input type="date" value={editingNode.data?.lastInteractionDate ?? ''} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getSocialData(editingNode), lastInteractionDate: event.target.value } })} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
              <label className="text-sm font-medium text-slate-600">color<input type="color" value={editingNode.data?.color ?? '#dbeafe'} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getSocialData(editingNode), color: event.target.value } })} className="mt-2 h-12 w-24 rounded-2xl border border-slate-200 bg-white p-1" /></label>
              <label className="text-sm font-medium text-slate-600 md:col-span-2">notes<textarea value={editingNode.data?.notes ?? ''} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getSocialData(editingNode), notes: event.target.value } })} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
              <label className="text-sm font-medium text-slate-600 md:col-span-2">details<textarea value={editingNode.data?.details ?? ''} onChange={(event) => setEditingNode({ ...editingNode, data: { ...getSocialData(editingNode), details: event.target.value } })} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
            </div>
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
