import React, { useEffect, useMemo, useRef, useState } from 'react';

const NODE_WIDTH = 132;
const NODE_HEIGHT = 62;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.2;
const DRAG_THRESHOLD = 6;

function setDocumentDragging(isDragging) {
  if (typeof document === 'undefined') return;
  document.body.style.userSelect = isDragging ? 'none' : '';
  document.body.style.webkitUserSelect = isDragging ? 'none' : '';
  document.body.style.cursor = isDragging ? 'grabbing' : '';
  if (isDragging) window.getSelection?.()?.removeAllRanges?.();
}

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
    className: 'absolute bottom-4 left-4 select-none rounded-2xl bg-white/80 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-white/80 backdrop-blur',
    style: { userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' },
  }, 'Ctrl/⌘ + 滚轮缩放 · 按钮缩放 · 拖动画布/节点');
}


function softenColor(color) {
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return color || '#e2e8f0';
  const amount = 0.72;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const mix = (value) => Math.round(value + (255 - value) * amount).toString(16).padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function nodeVisual(node) {
  const isCenter = node.id === 'me';
  const isLife = node.type === 'life';
  const softColor = softenColor(node.data?.color);
  if (isCenter) {
    return {
      className: isLife ? 'border-slate-300 bg-white/95 text-slate-950 ring-slate-200' : 'border-slate-500 text-white ring-slate-300',
      style: { backgroundColor: isLife ? '#ffffff' : '#1e293b', borderColor: isLife ? '#cbd5e1' : '#0f172a', color: isLife ? '#0f172a' : '#f8fafc' },
      badgeStyle: { backgroundColor: isLife ? '#e2e8f0' : '#f8fafc', color: '#0f172a' },
      titleColor: isLife ? '#020617' : '#f8fafc',
      subtitleColor: isLife ? '#64748b' : '#cbd5e1',
    };
  }
  return {
    className: 'border-white/80 bg-white/95 text-slate-950 ring-white/80',
    style: { borderColor: softColor, color: '#020617' },
    badgeStyle: { backgroundColor: softColor, color: '#0f172a' },
    titleColor: '#020617',
    subtitleColor: '#64748b',
  };
}

function orthogonalPath(x1, y1, x2, y2) {
  const midY = Math.round((y1 + y2) / 2);
  return `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
}

function isReasonablePosition(position) {
  return Number.isFinite(position?.x) && Number.isFinite(position?.y) && Math.abs(position.x) < 10000 && Math.abs(position.y) < 10000;
}

function getGraphBounds(nodes) {
  const validNodes = nodes.filter((node) => isReasonablePosition(node.position));
  if (!validNodes.length) return { minX: 0, minY: 0, maxX: NODE_WIDTH, maxY: NODE_HEIGHT };
  return validNodes.reduce((bounds, node) => ({
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

export function ReactFlow({ nodes = [], edges = [], onNodesChange, onNodeClick, className = '', fitView, selectedNodeId, children }) {
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
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    event.stopPropagation?.();
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const wheelListener = (event) => handleWheel(event);
    container.addEventListener('wheel', wheelListener, { passive: false });
    return () => container.removeEventListener('wheel', wheelListener);
  }, [viewport.zoom]);

  useEffect(() => () => setDocumentDragging(false), []);

  function startPan(event) {
    if (event.button !== 0 || event.target.closest?.('button')) return;
    event.preventDefault();
    window.getSelection?.()?.removeAllRanges?.();
    dragStateRef.current = { type: 'pan', id: null, startX: event.clientX, startY: event.clientY, startViewport: viewport, startPosition: null, moved: false };
    setPanning(true);
    setDocumentDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function movePan(event) {
    if (!panning || dragStateRef.current.type !== 'pan') return;
    event.preventDefault();
    window.getSelection?.()?.removeAllRanges?.();
    const distance = Math.hypot(event.clientX - dragStateRef.current.startX, event.clientY - dragStateRef.current.startY);
    if (distance > DRAG_THRESHOLD) dragStateRef.current.moved = true;
    const startViewport = dragStateRef.current.startViewport;
    setViewport({ ...startViewport, x: startViewport.x + event.clientX - dragStateRef.current.startX, y: startViewport.y + event.clientY - dragStateRef.current.startY });
  }

  function endPan() {
    setPanning(false);
    if (dragStateRef.current.type === 'pan') {
      setDocumentDragging(false);
      dragStateRef.current = { type: null, id: null, startX: 0, startY: 0, startViewport: null, startPosition: null, moved: false };
    }
  }

  function updateNodePosition(event, nodeId) {
    event.preventDefault();
    window.getSelection?.()?.removeAllRanges?.();
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
    className: `relative h-full w-full overflow-hidden select-none ${panning ? 'cursor-grabbing' : 'cursor-grab'} ${className}`,
    style: { userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none', overscrollBehavior: 'contain', WebkitTapHighlightColor: 'transparent' },
    onPointerDown: startPan,
    onPointerMove: movePan,
    onPointerUp: endPan,
    onPointerCancel: endPan,
  },
    children,
    React.createElement('div', {
      className: 'absolute right-4 top-4 z-20 flex select-none gap-2 rounded-2xl bg-white/85 p-2 shadow-sm ring-1 ring-white/80 backdrop-blur',
      onPointerDown: (event) => event.stopPropagation(),
      onClick: (event) => event.stopPropagation(),
      style: { userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' },
    },
      React.createElement('button', { type: 'button', onClick: () => zoomBy(1.18), className: 'select-none rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100' }, '缩放 +'),
      React.createElement('button', { type: 'button', onClick: () => zoomBy(0.85), className: 'select-none rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100' }, '缩放 -'),
      React.createElement('button', { type: 'button', onClick: fitToView, className: 'select-none rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700' }, '适应画布'),
    ),
    React.createElement('div', {
      className: 'absolute left-0 top-0 h-full w-full origin-top-left select-none',
      style: { transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' },
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
          if (edge.data?.route === 'orthogonal') return React.createElement('path', { key: edge.id, d: orthogonalPath(x1, y1, x2, y2), fill: 'none', stroke: `rgba(100,116,139,${opacity})`, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' });
          return React.createElement('line', { key: edge.id, x1, y1, x2, y2, stroke: `rgba(100,116,139,${opacity})`, strokeWidth, strokeLinecap: 'round' });
        }),
      ),
      nodes.map((node) => {
        const visual = nodeVisual(node);
        return React.createElement('button', {
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
          event.preventDefault();
          event.stopPropagation();
          window.getSelection?.()?.removeAllRanges?.();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          dragStateRef.current = { type: 'node', id: node.id, startX: event.clientX, startY: event.clientY, startViewport: null, startPosition: node.position, moved: false };
          setDocumentDragging(true);
          setDraggingId(node.id);
        },
        onPointerMove: (event) => {
          if (draggingId === node.id) updateNodePosition(event, node.id);
        },
        onPointerUp: () => { setDocumentDragging(false); setDraggingId(null); },
        onPointerCancel: () => { setDocumentDragging(false); setDraggingId(null); },
        className: `absolute flex w-[8.25rem] cursor-grab select-none items-center gap-2 rounded-2xl border px-2.5 py-2 text-left shadow-lg shadow-slate-200/60 ring-1 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-xl active:cursor-grabbing ${selectedNodeId === node.id ? 'ring-2 ring-slate-400' : ''} ${visual.className}`,
        style: { left: node.position.x, top: node.position.y, ...visual.style, userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' },
      },
        React.createElement('span', { className: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-inner', style: visual.badgeStyle }, node.data?.avatarInitial || (node.data?.name || node.data?.label || node.data?.title || '未').slice(0, 1)),
        React.createElement('span', { className: 'min-w-0 flex-1' },
          React.createElement('span', { className: 'block truncate text-sm font-semibold', style: { color: visual.titleColor } }, node.data?.name || node.data?.label || node.data?.title || '未命名联系人'),
          node.data?.relationshipType ? React.createElement('span', { className: 'mt-0.5 block truncate text-[11px]', style: { color: visual.subtitleColor } }, node.data.roleCategory || node.data.relationshipType) : node.data?.description ? React.createElement('span', { className: 'mt-0.5 block truncate text-[11px]', style: { color: '#64748b' } }, node.data.description) : null,
        ),
      );
      }),
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
