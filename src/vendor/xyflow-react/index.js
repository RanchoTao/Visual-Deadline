import React, { useMemo, useRef, useState } from 'react';

export function Background() {
  return React.createElement('div', {
    className: 'pointer-events-none absolute inset-0 opacity-70',
    style: {
      backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.28) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
    },
  });
}

export function Controls() {
  return React.createElement('div', {
    className: 'absolute bottom-4 left-4 rounded-2xl bg-white/80 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-white/80 backdrop-blur',
  }, '拖动节点调整位置');
}

function resolveNodePosition(event, bounds) {
  return {
    x: Math.max(20, event.clientX - bounds.left - 80),
    y: Math.max(20, event.clientY - bounds.top - 28),
  };
}

export function ReactFlow({ nodes = [], edges = [], onNodesChange, onNodeClick, className = '', fitView, children }) {
  const containerRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  function updateNodePosition(event, nodeId) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const position = resolveNodePosition(event, bounds);
    onNodesChange?.([{ type: 'position', id: nodeId, position }]);
  }

  return React.createElement('div', { ref: containerRef, className: `relative h-full w-full overflow-hidden ${className}` },
    children,
    React.createElement('svg', { className: 'pointer-events-none absolute inset-0 h-full w-full' },
      edges.map((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) return null;
        const x1 = source.position.x + 80;
        const y1 = source.position.y + 36;
        const x2 = target.position.x + 80;
        const y2 = target.position.y + 36;
        const familiarity = Math.min(100, Math.max(0, Number(edge.data?.familiarity ?? 50)));
        const opacity = 0.22 + familiarity / 180;
        const strokeWidth = 1 + familiarity / 45;
        return React.createElement('g', { key: edge.id },
          React.createElement('line', { x1, y1, x2, y2, stroke: `rgba(100,116,139,${opacity})`, strokeWidth, strokeLinecap: 'round' }),
        );
      }),
    ),
    nodes.map((node) => React.createElement('button', {
      key: node.id,
      type: 'button',
      onClick: (event) => onNodeClick?.(event, node),
      onPointerDown: (event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDraggingId(node.id);
      },
      onPointerMove: (event) => {
        if (draggingId === node.id) updateNodePosition(event, node.id);
      },
      onPointerUp: () => setDraggingId(null),
      className: `absolute min-w-36 cursor-grab rounded-3xl border bg-white/90 px-4 py-3 text-center shadow-xl shadow-slate-200/60 ring-1 ring-white/80 backdrop-blur active:cursor-grabbing ${node.id === 'me' ? 'border-slate-300 bg-slate-950 text-white' : 'border-white/80 text-slate-950'}`,
      style: { left: node.position.x, top: node.position.y, borderColor: node.data?.color ?? undefined },
    },
      React.createElement('p', { className: `text-sm font-semibold ${node.id === 'me' ? 'text-white' : 'text-slate-950'}` }, node.data?.name || node.data?.label || node.data?.title || '未命名联系人'),
      node.data?.relationshipType ? React.createElement('p', { className: `mt-1 text-xs ${node.id === 'me' ? 'text-slate-300' : 'text-slate-500'}` }, node.data.relationshipType) : null,
    )),
  );
}

export function applyNodeChanges(changes, nodes) {
  return nodes.map((node) => {
    const change = changes.find((item) => item.id === node.id);
    if (!change) return node;
    if (change.type === 'position' && change.position) return { ...node, position: change.position };
    return node;
  });
}

export function applyEdgeChanges(_changes, edges) {
  return edges;
}
