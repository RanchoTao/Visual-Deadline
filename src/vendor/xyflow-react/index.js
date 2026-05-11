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
        const y1 = source.position.y + 28;
        const x2 = target.position.x + 80;
        const y2 = target.position.y + 28;
        return React.createElement('g', { key: edge.id },
          edge.animated ? React.createElement('defs', null, React.createElement('marker', { id: `arrow-${edge.id}`, viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto-start-reverse' }, React.createElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'rgba(100,116,139,0.55)' }))) : null,
          React.createElement('line', { x1, y1, x2, y2, stroke: 'rgba(148,163,184,0.55)', strokeWidth: '1.5', markerEnd: edge.animated ? `url(#arrow-${edge.id})` : undefined }),
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
      className: 'absolute min-w-36 cursor-grab rounded-3xl border border-white/80 bg-white/90 px-4 py-3 text-left shadow-xl shadow-slate-200/60 ring-1 ring-white/80 backdrop-blur active:cursor-grabbing',
      style: { left: node.position.x, top: node.position.y, borderColor: node.data?.color ?? undefined },
    },
      React.createElement('p', { className: 'text-sm font-semibold text-slate-950' }, node.data?.label ?? node.data?.title ?? node.id),
      node.data?.description ? React.createElement('p', { className: 'mt-1 line-clamp-2 text-xs text-slate-500' }, node.data.description) : null,
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
