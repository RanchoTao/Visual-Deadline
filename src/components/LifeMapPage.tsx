import type { AIArtifactInput, Goal, GoalInput, Task } from '../types/task';
import type { Roadmap } from '../types/roadmap';
import { GoalRoadmapPanel } from './GoalRoadmapPanel';
import { RoadmapGenerator } from './RoadmapGenerator';
import { LifeTimelineSection } from './life-timeline/LifeTimelineSection';
interface LifeMapPageProps { goals: Goal[]; tasks: Task[]; roadmaps: Roadmap[]; onSaveGoal:(input:GoalInput,goalId?:string)=>void; onDeleteGoal:(goalId:string)=>void; onSaveRoadmap:(roadmap:Roadmap)=>void; onRoadmapGenerated?:(artifact:AIArtifactInput)=>void }
export function LifeMapPage({goals,tasks,roadmaps,onSaveGoal,onDeleteGoal,onSaveRoadmap,onRoadmapGenerated}:LifeMapPageProps){return <section className="space-y-6"><LifeTimelineSection goals={goals} tasks={tasks}/><GoalRoadmapPanel goals={goals} tasks={tasks} onSaveGoal={onSaveGoal} onDeleteGoal={onDeleteGoal} onRoadmapGenerated={onRoadmapGenerated}/><RoadmapGenerator goals={goals} roadmaps={roadmaps} onSave={onSaveRoadmap}/></section>}
