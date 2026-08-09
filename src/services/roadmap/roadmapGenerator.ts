import type { RoadmapDraft, RoadmapEdge, RoadmapNode } from '../../types/roadmap';
const nodeTypes = new Set(['ROOT','STAGE','MILESTONE','TASK_GROUP','KNOWLEDGE','SKILL','PROJECT','GOAL']);
const statuses = new Set(['LOCKED','AVAILABLE','IN_PROGRESS','COMPLETED','SKIPPED']);
const edgeTypes = new Set(['PREREQUISITE','RECOMMENDED','OPTIONAL','PARALLEL']);
export function validateRoadmapDraft(input: unknown): RoadmapDraft {
  if (!input || typeof input !== 'object') throw new Error('Roadmap 必须是对象。');
  const raw = input as Partial<RoadmapDraft>;
  if (!raw.title?.trim() || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) throw new Error('Roadmap 缺少 title、nodes 或 edges。');
  const nodes = raw.nodes.map((item) => ({ ...item, id: String(item.id), title: String(item.title), type: item.type || 'STAGE', status: item.status || 'LOCKED' } as RoadmapNode));
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) throw new Error('节点 id 必须唯一。');
  if (!nodes.some((node) => node.type === 'ROOT') || !nodes.some((node) => node.type === 'GOAL')) throw new Error('Roadmap 必须包含 ROOT 与 GOAL。');
  if (nodes.some((node) => !node.title.trim() || !nodeTypes.has(node.type) || !statuses.has(node.status))) throw new Error('节点类型、状态或标题无效。');
  const edgeKeys = new Set<string>();
  const edges = raw.edges.map((edge, index) => ({ ...edge, id: edge.id || `edge-${index}`, type: edge.type || 'PREREQUISITE' } as RoadmapEdge));
  edges.forEach((edge) => { if (!ids.has(edge.sourceNodeId) || !ids.has(edge.targetNodeId)) throw new Error('边引用了不存在的节点。'); if (!edgeTypes.has(edge.type)) throw new Error('边类型无效。'); const key=`${edge.sourceNodeId}:${edge.targetNodeId}:${edge.type}`; if(edgeKeys.has(key)) throw new Error('存在重复边。'); edgeKeys.add(key); });
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]])); edges.forEach((edge) => adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId));
  const visiting = new Set<string>(), visited = new Set<string>(); function visit(id:string){ if(visiting.has(id)) throw new Error('Roadmap 不支持环。'); if(visited.has(id)) return; visiting.add(id); adjacency.get(id)?.forEach(visit); visiting.delete(id); visited.add(id); } nodes.forEach((node)=>visit(node.id));
  const connected = new Set<string>(); edges.forEach((edge)=>{connected.add(edge.sourceNodeId);connected.add(edge.targetNodeId)}); if(nodes.length > 1 && nodes.some((node)=>!connected.has(node.id))) throw new Error('存在孤立节点。');
  return { title: raw.title.trim(), description: raw.description?.trim(), domain: raw.domain, goalId: raw.goalId, nodes, edges };
}
export function layoutRoadmap(draft: RoadmapDraft): RoadmapDraft { const incoming=new Map(draft.nodes.map(n=>[n.id,0])); draft.edges.forEach(e=>incoming.set(e.targetNodeId,(incoming.get(e.targetNodeId)||0)+1)); const levels=new Map<string,number>(); const roots=draft.nodes.filter(n=>n.type==='ROOT'||incoming.get(n.id)===0); const queue=roots.map(n=>n.id); roots.forEach(n=>levels.set(n.id,0)); while(queue.length){const id=queue.shift()!; draft.edges.filter(e=>e.sourceNodeId===id).forEach(e=>{const next=(levels.get(id)||0)+1;if(next>(levels.get(e.targetNodeId)??-1)){levels.set(e.targetNodeId,next);queue.push(e.targetNodeId)}})} const groups=new Map<number,RoadmapNode[]>(); draft.nodes.forEach(n=>{const level=levels.get(n.id)||0;groups.set(level,[...(groups.get(level)||[]),n])}); return {...draft,nodes:draft.nodes.map(n=>{const level=levels.get(n.id)||0;const group=groups.get(level)!;const index=group.findIndex(x=>x.id===n.id);return {...n,positionX:80+level*250,positionY:70+index*140}})}; }
export function createStarterRoadmap(goal: string, goalId?: string): RoadmapDraft { const safe=goal.trim(); return layoutRoadmap(validateRoadmapDraft({title:safe,description:`“${safe}”的可确认路线草稿。`,goalId,nodes:[{id:'root',title:'当前位置',type:'ROOT',status:'IN_PROGRESS'},{id:'diagnose',title:'现状诊断',type:'STAGE',status:'AVAILABLE'},{id:'foundation',title:'建立基础',type:'SKILL',status:'LOCKED'},{id:'practice',title:'阶段实践',type:'PROJECT',status:'LOCKED'},{id:'review',title:'复盘与补强',type:'MILESTONE',status:'LOCKED'},{id:'goal',title:safe,type:'GOAL',status:'LOCKED'}],edges:[['root','diagnose'],['diagnose','foundation'],['foundation','practice'],['practice','review'],['review','goal']].map(([sourceNodeId,targetNodeId],i)=>({id:`edge-${i}`,sourceNodeId,targetNodeId,type:'PREREQUISITE'}))})); }
export function parseRoadmapResponse(content:string):RoadmapDraft { const match=content.match(/\{[\s\S]*\}/); if(!match) throw new Error('AI 未返回 JSON。'); return layoutRoadmap(validateRoadmapDraft(JSON.parse(match[0]))); }
export const roadmapSystemPrompt = `你是 RoadmapGenerator。只输出 JSON：{title,description,domain,nodes,edges}。节点 type 只能为 ROOT/STAGE/MILESTONE/TASK_GROUP/KNOWLEDGE/SKILL/PROJECT/GOAL，status 只能为 LOCKED/AVAILABLE/IN_PROGRESS/COMPLETED/SKIPPED；边使用 sourceNodeId,targetNodeId,type，type 只能为 PREREQUISITE/RECOMMENDED/OPTIONAL/PARALLEL。图必须有唯一 id、ROOT、GOAL，无环、无孤点、无重复边。`;
