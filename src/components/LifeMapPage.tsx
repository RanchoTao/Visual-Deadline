import type { AIArtifactInput, Goal, GoalInput, Task } from '../types/task';
import type { Roadmap } from '../types/roadmap';
import { GoalRoadmapPanel } from './GoalRoadmapPanel';
import { RoadmapGenerator } from './RoadmapGenerator';
import { LifeOSPlanner } from './life-planner/LifeOSPlanner';
interface LifeMapPageProps { goals: Goal[]; tasks: Task[]; roadmaps: Roadmap[]; onSaveGoal:(input:GoalInput,goalId?:string)=>void; onDeleteGoal:(goalId:string)=>void; onSaveRoadmap:(roadmap:Roadmap)=>void; onRoadmapGenerated?:(artifact:AIArtifactInput)=>void; onAddTasks:(tasks:import('../types/task').TaskInput[])=>void; onCompleteTask:(task:Task)=>void }
export function LifeMapPage({goals,tasks,roadmaps,onSaveGoal,onDeleteGoal,onSaveRoadmap,onRoadmapGenerated,onAddTasks,onCompleteTask}:LifeMapPageProps){return <section className="space-y-6"><LifeOSPlanner goals={goals} tasks={tasks} onAddTasks={onAddTasks} onCompleteTask={onCompleteTask}/><details className="rounded-[2rem] border border-slate-200 bg-white/70 p-5"><summary className="cursor-pointer text-sm font-bold text-slate-600">长期目标编辑与 AI Roadmap</summary><div className="mt-5 space-y-6"><GoalRoadmapPanel goals={goals} tasks={tasks} onSaveGoal={onSaveGoal} onDeleteGoal={onDeleteGoal} onRoadmapGenerated={onRoadmapGenerated}/><RoadmapGenerator goals={goals} roadmaps={roadmaps} onSave={onSaveRoadmap}/></div></details></section>}
