import React, { useEffect, useMemo, useRef, useState } from 'react';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 72;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.2;
const DRAG_THRESHOLD = 6;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function Background() {
  return React.createElement('div', {
    className: 'pointer-events-none absolute inset-0 opacity-70',
    style: {
      backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.22) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
    },
  });
}

export function Controls() {
  return React.createElement('div', {
    className: 'absolute bottom-4 left-4 rounded-2xl bg-white/80 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-white/80 backdrop-blur',
  }, '滚轮缩放 · 拖动画布平移 · 拖动节点调整位置');
}

function getGraphBounds(nodes) {
  if (!nodes.length) return { minX: 0, minY: 0, maxX: NODE_WIDTH, maxY: NODE_HEIGHT };
  return nodes.reduce((bounds, node) => ({
    minX: Math.min(bounds.minX, node.position.x),
    minY: Math.min(bounds.minY, node.position.y),
    maxX: Math.max(bounds.maxX, node.position.x + NODE_WIDTH),
    maxY: Math.max(bounds.maxY, node.position.y + NODE_HEIGHT),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function fitViewport(nodes, bounds) {
  const graphBounds = getGraphBounds(nodes);
  const width = Math.max(1, graphBounds.maxX - graphBounds.minX);
  const height = Math.max(1, graphBounds.maxY - graphBounds.minY);
  const zoom = clamp(Math.min((bounds.width - 96) / width, (bounds.height - 96) / height), MIN_ZOOM, 1.15);
  return {
    zoom,
    x: (bounds.width - width * zoom) / 2 - graphBounds.minX * zoom,
    y: (bounds.height - height * zoom) / 2 - graphBounds.minY * zoom,
  };
}

export function ReactFlow({ nodes = [], edges = [], onNodesChange, onNodeClick, className = '', fitView, children }) {
  const containerRef = useRef(null);
  const hasFitRef = useRef(false);
  const dragStateRef = useRef({ type: null, id: null, startX: 0, startY: 0, startViewport: null, startPosition: null, moved: false });
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [draggingId, setDraggingId] = useState(null);
  const [panning, setPanning] = useState(false);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  function fitToView() {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setViewport(fitViewport(nodes, bounds));
  }

  useEffect(() => {
    if (!fitView || hasFitRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      fitToView();
      hasFitRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitView, nodes.length]);

  function zoomBy(multiplier) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const centerX = bounds.width / 2;
    const centerY = bounds.height / 2;
    setViewport((current) => {
      const nextZoom = clamp(current.zoom * multiplier, MIN_ZOOM, MAX_ZOOM);
      const worldX = (centerX - current.x) / current.zoom;
      const worldY = (centerY - current.y) / current.zoom;
      return { zoom: nextZoom, x: centerX - worldX * nextZoom, y: centerY - worldY * nextZoom };
    });
  }

  function handleWheel(event) {
    event.preventDefault();
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    setViewport((current) => {
      const nextZoom = clamp(current.zoom * (event.deltaY > 0 ? 0.9 : 1.1), MIN_ZOOM, MAX_ZOOM);
      const worldX = (pointerX - current.x) / current.zoom;
      const worldY = (pointerY - current.y) / current.zoom;
      return { zoom: nextZoom, x: pointerX - worldX * nextZoom, y: pointerY - worldY * nextZoom };
    });
  }

  function startPan(event) {
    if (event.button !== 0 || event.target.closest?.('button')) return;
    dragStateRef.current = { type: 'pan', id: null, startX: event.clientX, startY: event.clientY, startViewport: viewport, startPosition: null, moved: false };
    setPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function movePan(event) {
    if (!panning || dragStateRef.current.type !== 'pan') return;
    const distance = Math.hypot(event.clientX - dragStateRef.current.startX, event.clientY - dragStateRef.current.startY);
    if (distance > DRAG_THRESHOLD) dragStateRef.current.moved = true;
    const startViewport = dragStateRef.current.startViewport;
    setViewport({ ...startViewport, x: startViewport.x + event.clientX - dragStateRef.current.startX, y: startViewport.y + event.clientY - dragStateRef.current.startY });
  }

  function endPan() {
    setPanning(false);
    if (dragStateRef.current.type === 'pan') dragStateRef.current = { type: null, id: null, startX: 0, startY: 0, startViewport: null, startPosition: null, moved: false };
  }

  function updateNodePosition(event, nodeId) {
    const startPosition = dragStateRef.current.startPosition;
    if (!startPosition) return;
    const distance = Math.hypot(event.clientX - dragStateRef.current.startX, event.clientY - dragStateRef.current.startY);
    if (distance > DRAG_THRESHOLD) dragStateRef.current.moved = true;
    const position = {
      x: Math.max(24, startPosition.x + (event.clientX - dragStateRef.current.startX) / viewport.zoom),
      y: Math.max(24, startPosition.y + (event.clientY - dragStateRef.current.startY) / viewport.zoom),
    };
    onNodesChange?.([{ type: 'position', id: nodeId, position }]);
  }

  return React.createElement('div', {
    ref: containerRef,
    className: `relative h-full w-full overflow-hidden touch-none ${panning ? 'cursor-grabbing' : 'cursor-grab'} ${className}`,
    onWheel: handleWheel,
    onPointerDown: startPan,
    onPointerMove: movePan,
    onPointerUp: endPan,
    onPointerCancel: endPan,
  },
    children,
    React.createElement('div', {
      className: 'absolute right-4 top-4 z-20 flex gap-2 rounded-2xl bg-white/85 p-2 shadow-sm ring-1 ring-white/80 backdrop-blur',
      onPointerDown: (event) => event.stopPropagation(),
      onClick: (event) => event.stopPropagation(),
    },
      React.createElement('button', { type: 'button', onClick: () => zoomBy(1.18), className: 'rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100' }, '缩放 +'),
      React.createElement('button', { type: 'button', onClick: () => zoomBy(0.85), className: 'rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100' }, '缩放 -'),
      React.createElement('button', { type: 'button', onClick: fitToView, className: 'rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700' }, '适应画布'),
    ),
    React.createElement('div', {
      className: 'absolute left-0 top-0 h-full w-full origin-top-left',
      style: { transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` },
    },
      React.createElement('svg', { className: 'pointer-events-none absolute left-0 top-0 h-[2400px] w-[2400px] overflow-visible' },
        edges.map((edge) => {
          const source = nodeById.get(edge.source);
          const target = nodeById.get(edge.target);
          if (!source || !target) return null;
          const x1 = source.position.x + NODE_WIDTH / 2;
          const y1 = source.position.y + NODE_HEIGHT / 2;
          const x2 = target.position.x + NODE_WIDTH / 2;
          const y2 = target.position.y + NODE_HEIGHT / 2;
          const familiarity = Math.min(100, Math.max(0, Number(edge.data?.familiarity ?? 50)));
          const opacity = 0.22 + familiarity / 220;
          const strokeWidth = 1 + familiarity / 60;
          return React.createElement('line', { key: edge.id, x1, y1, x2, y2, stroke: `rgba(100,116,139,${opacity})`, strokeWidth, strokeLinecap: 'round' });
        }),
      ),
      nodes.map((node) => React.createElement('button', {
        key: node.id,
        type: 'button',
        onClick: (event) => {
          if (dragStateRef.current.id === node.id && dragStateRef.current.moved) {
            event.preventDefault();
            event.stopPropagation();
            dragStateRef.current = { type: null, id: null, startX: 0, startY: 0, startViewport: null, startPosition: null, moved: false };
            return;
          }
          onNodeClick?.(event, node);
        },
        onPointerDown: (event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          dragStateRef.current = { type: 'node', id: node.id, startX: event.clientX, startY: event.clientY, startViewport: null, startPosition: node.position, moved: false };
          setDraggingId(node.id);
        },
        onPointerMove: (event) => {
          if (draggingId === node.id) updateNodePosition(event, node.id);
        },
        onPointerUp: () => setDraggingId(null),
        onPointerCancel: () => setDraggingId(null),
        className: `absolute w-40 cursor-grab rounded-3xl border bg-white/95 px-4 py-3 text-center shadow-xl shadow-slate-200/60 ring-1 ring-white/80 backdrop-blur active:cursor-grabbing ${node.id === 'me' ? 'border-slate-950 bg-slate-950 text-white' : 'border-white/80 text-slate-950'}`,
        style: { left: node.position.x, top: node.position.y, borderColor: node.id === 'me' ? '#020617' : node.data?.color ?? undefined },
      },
        React.createElement('p', { className: `truncate text-sm font-semibold ${node.id === 'me' ? 'text-white' : 'text-slate-950'}` }, node.data?.name || node.data?.label || node.data?.title || '未命名联系人'),
        node.data?.relationshipType ? React.createElement('p', { className: `mt-1 truncate text-xs ${node.id === 'me' ? 'text-slate-300' : 'text-slate-500'}` }, node.data.relationshipType) : node.data?.description ? React.createElement('p', { className: `mt-1 truncate text-xs ${node.id === 'me' ? 'text-slate-300' : 'text-slate-500'}` }, node.data.description) : null,
      )),
    ),
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
