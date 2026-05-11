import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { AchievementToast } from './components/AchievementToast';
import { AchievementsPanel } from './components/AchievementsPanel';
import { ActivityLog } from './components/ActivityLog';
import { LifeMapPage } from './components/LifeMapPage';
import { LifeOSNav } from './components/LifeOSNav';
import { LogPage } from './components/LogPage';
import { OnboardingFlow } from './components/OnboardingFlow';
import { ProfilePage } from './components/ProfilePage';
import { PressureCard } from './components/PressureCard';
import { PriorityMap } from './components/PriorityMap';
import { RecommendationCard } from './components/RecommendationCard';
import { TaskForm } from './components/TaskForm';
import { SocialPage } from './components/SocialPage';
import { TaskList } from './components/TaskList';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { Achievement, ActivityType, LifecycleStatus, LifeOSModule, PressureBreakdown, PressureCalibrationSnapshot, Task, TaskInput, UserProfile } from './types/task';
import {
  achievementCatalog,
  calculatePressureIndex,
  calculateTaskLoad,
  createPressureCalibration,
  clampImportance,
  clampPressure,
  clampProgress,
  getTaskScore,
  normalizePressureCalibration,
  migrateLegacyImportance,
  normalizeActivityType,
  normalizeLifecycleStatus,
} from './utils/taskScoring';

const STORAGE_KEY = 'visualized-deadline.tasks';
const BASELINE_PRESSURE_STORAGE_KEY = 'visualized-deadline.baselinePressure';
const ACHIEVEMENTS_STORAGE_KEY = 'visualized-deadline.achievements';
const PROFILE_STORAGE_KEY = 'visualized-deadline.profile';
const ONBOARDING_STORAGE_KEY = 'visualized-deadline.onboardingComplete';
const PRESSURE_CALIBRATION_STORAGE_KEY = 'visualized-deadline.pressureCalibration';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const defaultProfile: UserProfile = {
  nickname: '',
  height: '',
  weight: '',
  identity: '',
  skills: '',
  longTermGoals: '',
  currentStage: '',
  avatarDataUrl: undefined,
};

type LegacyTask = Partial<Omit<Task, 'schemaVersion' | 'activityType' | 'lifecycleStatus'>> & {
  activityType?: ActivityType | string;
  lifecycleStatus?: LifecycleStatus | string;
  status?: 'todo' | 'doing' | 'done';
  schemaVersion?: number;
};

function readBaselinePressure(): number | null {
  try {
    const storedPressure = window.localStorage.getItem(BASELINE_PRESSURE_STORAGE_KEY);
    return storedPressure === null ? null : clampPressure(JSON.parse(storedPressure));
  } catch {
    return null;
  }
}

function readInitialOnboardingComplete(): boolean {
  try {
    const storedFlag = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (storedFlag !== null) return JSON.parse(storedFlag) === true;

    // Existing users may have tasks or a baseline before onboardingComplete existed.
    // Treat that as already onboarded so migration never blocks their current data.
    return window.localStorage.getItem(STORAGE_KEY) !== null || window.localStorage.getItem(BASELINE_PRESSURE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function normalizeTaskInput(input: TaskInput): TaskInput {
  const lifecycleStatus = input.progress >= 100 ? 'completed' : input.lifecycleStatus;

  return {
    title: input.title,
    description: input.description,
    importance: clampImportance(input.importance),
    deadline: input.deadline,
    progress: clampProgress(input.progress),
    activityType: normalizeActivityType(input.activityType),
    lifecycleStatus,
  };
}

function normalizeStoredTask(task: LegacyTask): Task {
  const now = new Date().toISOString();
  const progress = clampProgress(task.progress ?? (task.status === 'done' ? 100 : 0));
  const migratedLifecycleStatus = task.status === 'done' || progress >= 100 ? 'completed' : normalizeLifecycleStatus(task.lifecycleStatus);
  const isCurrentSchema = task.schemaVersion === 3;
  const completedAt = task.completedAt ?? (migratedLifecycleStatus === 'completed' ? task.updatedAt ?? now : undefined);
  const abandonedAt = task.abandonedAt ?? (migratedLifecycleStatus === 'abandoned' ? task.updatedAt ?? now : undefined);

  return {
    id: task.id || crypto.randomUUID(),
    title: task.title || '未命名项目',
    description: task.description || undefined,
    importance: isCurrentSchema ? clampImportance(task.importance) : migrateLegacyImportance(task.importance),
    deadline: task.deadline || undefined,
    progress,
    activityType: normalizeActivityType(task.activityType),
    lifecycleStatus: migratedLifecycleStatus,
    completedAt,
    abandonedAt,
    reviewNote: typeof task.reviewNote === 'string' ? task.reviewNote : undefined,
    schemaVersion: 3,
    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt || now,
  };
}

function normalizeStoredAchievements(achievements: Achievement[]): Achievement[] {
  if (!Array.isArray(achievements)) return [];
  const knownIds = new Set(achievementCatalog.map((achievement) => achievement.id));

  return achievements.filter((achievement) => knownIds.has(achievement.id) && Boolean(achievement.unlockedAt));
}

function normalizeProfile(profile: unknown): UserProfile {
  if (!profile || typeof profile !== 'object') return defaultProfile;
  const storedProfile = profile as Partial<UserProfile>;

  return {
    nickname: storedProfile.nickname ?? '',
    height: storedProfile.height ?? '',
    weight: storedProfile.weight ?? '',
    identity: storedProfile.identity ?? '',
    skills: storedProfile.skills ?? '',
    longTermGoals: storedProfile.longTermGoals ?? '',
    currentStage: storedProfile.currentStage ?? '',
    avatarDataUrl: storedProfile.avatarDataUrl || undefined,
  };
}

function createTask(input: TaskInput): Task {
  const now = new Date().toISOString();
  const normalizedInput = normalizeTaskInput(input);

  return {
    ...normalizedInput,
    id: crypto.randomUUID(),
    completedAt: normalizedInput.lifecycleStatus === 'completed' ? now : undefined,
    abandonedAt: normalizedInput.lifecycleStatus === 'abandoned' ? now : undefined,
    reviewNote: undefined,
    schemaVersion: 3,
    createdAt: now,
    updatedAt: now,
  };
}

function createAchievement(id: string): Achievement | undefined {
  const achievement = achievementCatalog.find((item) => item.id === id);
  if (!achievement) return undefined;

  return {
    ...achievement,
    unlockedAt: new Date().toISOString(),
  };
}

function App() {
  const [tasks, setTasks] = useLocalStorage<Task[]>(STORAGE_KEY, []);
  const [achievements, setAchievements] = useLocalStorage<Achievement[]>(ACHIEVEMENTS_STORAGE_KEY, []);
  const [profile, setProfile] = useLocalStorage<UserProfile>(PROFILE_STORAGE_KEY, defaultProfile);
  const [onboardingComplete, setOnboardingComplete] = useLocalStorage<boolean>(ONBOARDING_STORAGE_KEY, readInitialOnboardingComplete());
  const legacyReferencePressure = readBaselinePressure() ?? 35;
  const [pressureCalibration, setPressureCalibration] = useLocalStorage<PressureCalibrationSnapshot>(PRESSURE_CALIBRATION_STORAGE_KEY, normalizePressureCalibration(null, legacyReferencePressure));
  const [activeModule, setActiveModule] = useState<LifeOSModule>('vd');
  const [isRecalibrationOpen, setIsRecalibrationOpen] = useState(false);
  const [recalibrationPressure, setRecalibrationPressure] = useState(legacyReferencePressure);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [toastAchievement, setToastAchievement] = useState<Achievement | undefined>();

  const normalizedTasks = useMemo(() => {
    const storedTasks = Array.isArray(tasks) ? tasks : [];
    return storedTasks.map((task) => normalizeStoredTask(task));
  }, [tasks]);
  const normalizedAchievements = useMemo(() => normalizeStoredAchievements(achievements), [achievements]);
  const normalizedProfile = useMemo(() => normalizeProfile(profile), [profile]);
  const normalizedPressureCalibration = useMemo(() => normalizePressureCalibration(pressureCalibration, legacyReferencePressure), [legacyReferencePressure, pressureCalibration]);
  const activeTasks = useMemo(() => normalizedTasks.filter((task) => task.lifecycleStatus === 'active'), [normalizedTasks]);
  const recommendedTasks = useMemo(() => normalizedTasks.filter((task) => task.lifecycleStatus === 'active').sort((a, b) => getTaskScore(b) - getTaskScore(a)).slice(0, 3), [normalizedTasks]);
  const pressure = useMemo<PressureBreakdown>(() => calculatePressureIndex(normalizedTasks, normalizedPressureCalibration, legacyReferencePressure), [normalizedTasks, normalizedPressureCalibration, legacyReferencePressure]);

  useEffect(() => {
    if (JSON.stringify(tasks) !== JSON.stringify(normalizedTasks)) {
      setTasks(normalizedTasks);
    }
  }, [normalizedTasks, setTasks, tasks]);

  useEffect(() => {
    if (JSON.stringify(achievements) !== JSON.stringify(normalizedAchievements)) {
      setAchievements(normalizedAchievements);
    }
  }, [achievements, normalizedAchievements, setAchievements]);

  useEffect(() => {
    if (JSON.stringify(profile) !== JSON.stringify(normalizedProfile)) {
      setProfile(normalizedProfile);
    }
  }, [normalizedProfile, profile, setProfile]);

  useEffect(() => {
    if (JSON.stringify(pressureCalibration) !== JSON.stringify(normalizedPressureCalibration)) {
      setPressureCalibration(normalizedPressureCalibration);
    }
  }, [normalizedPressureCalibration, pressureCalibration, setPressureCalibration]);

  useEffect(() => {
    if (!toastAchievement) return;
    const timeoutId = window.setTimeout(() => setToastAchievement(undefined), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [toastAchievement]);

  function unlockAchievement(id: string) {
    setAchievements((currentAchievements) => {
      const isAlreadyStored = Array.isArray(currentAchievements) && currentAchievements.some((achievement) => achievement.id === id);
      if (isAlreadyStored) return currentAchievements;

      const safeAchievements = normalizeStoredAchievements(currentAchievements);
      if (safeAchievements.some((achievement) => achievement.id === id)) return safeAchievements;

      const unlockedAchievement = createAchievement(id);
      if (!unlockedAchievement) return safeAchievements;

      setToastAchievement(unlockedAchievement);
      return [...safeAchievements, unlockedAchievement];
    });
  }

  useEffect(() => {
    if (!onboardingComplete) return;

    unlockAchievement('first-entry');

    if (normalizedTasks.some((task) => !task.id.startsWith('demo-'))) unlockAchievement('first-task-created');
    if (normalizedTasks.some((task) => task.lifecycleStatus === 'completed')) unlockAchievement('first-task-completed');
    if (normalizedTasks.some((task) => task.lifecycleStatus === 'abandoned' && task.importance <= 4)) unlockAchievement('first-low-value-abandoned');
    if (pressure.state === 'manageable') unlockAchievement('first-manageable-pressure');
    if (normalizedTasks.filter((task) => task.lifecycleStatus === 'completed').length >= 3) unlockAchievement('first-three-completed');
    if (
      normalizedTasks.some((task) => {
        if (!task.completedAt) return false;
        return new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime() <= 7 * MS_PER_DAY;
      })
    ) {
      unlockAchievement('first-seven-day-progress');
    }
    if (normalizedTasks.some((task) => task.lifecycleStatus === 'completed' && ['recovery', 'entertainment'].includes(task.activityType))) unlockAchievement('first-recovery-relief');
  }, [onboardingComplete, normalizedTasks, pressure.state]);

  function savePressureCalibration(referencePressure: number, sourceTasks = normalizedTasks) {
    const activeLoad = calculateTaskLoad(sourceTasks);
    const activeCount = sourceTasks.filter((task) => task.lifecycleStatus === 'active').length;
    const calibration = createPressureCalibration(referencePressure, activeLoad, activeCount);
    setPressureCalibration(calibration);
    // Keep the legacy key in sync only for older app versions; it is no longer an additive base layer.
    window.localStorage.setItem(BASELINE_PRESSURE_STORAGE_KEY, JSON.stringify(calibration.referencePressure));
  }

  function openRecalibration() {
    setRecalibrationPressure(pressure.referencePressure);
    setIsRecalibrationOpen(true);
  }

  function submitRecalibration() {
    savePressureCalibration(recalibrationPressure);
    setIsRecalibrationOpen(false);
  }

  function completeOnboarding(importedTasks: TaskInput[], _referencePressure: number, calibration: PressureCalibrationSnapshot) {
    const createdTasks = importedTasks.map((task) => createTask(task));
    setTasks((currentTasks) => [...createdTasks, ...currentTasks]);
    setPressureCalibration(calibration);
    window.localStorage.setItem(BASELINE_PRESSURE_STORAGE_KEY, JSON.stringify(calibration.referencePressure));
    setOnboardingComplete(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingTask(undefined);
  }

  function handleSubmit(input: TaskInput) {
    const normalizedInput = normalizeTaskInput(input);
    const now = new Date().toISOString();

    if (editingTask) {
      setTasks((currentTasks) =>
        currentTasks.map((task) => {
          if (task.id !== editingTask.id) return task;
          const lifecycleChanged = task.lifecycleStatus !== normalizedInput.lifecycleStatus;
          return {
            ...task,
            ...normalizedInput,
            completedAt: normalizedInput.lifecycleStatus === 'completed' ? task.completedAt ?? now : lifecycleChanged ? undefined : task.completedAt,
            abandonedAt: normalizedInput.lifecycleStatus === 'abandoned' ? task.abandonedAt ?? now : lifecycleChanged ? undefined : task.abandonedAt,
            updatedAt: now,
          };
        }),
      );
    } else {
      setTasks((currentTasks) => [createTask(normalizedInput), ...currentTasks]);
    }
    closeForm();
  }

  function archiveTask(task: Task, lifecycleStatus: Exclude<LifecycleStatus, 'active'>) {
    const now = new Date().toISOString();
    setTasks((currentTasks) =>
      currentTasks.map((item) =>
        item.id === task.id
          ? {
              ...item,
              lifecycleStatus,
              progress: lifecycleStatus === 'completed' ? 100 : item.progress,
              completedAt: lifecycleStatus === 'completed' ? now : item.completedAt,
              abandonedAt: lifecycleStatus === 'abandoned' ? now : item.abandonedAt,
              updatedAt: now,
            }
          : item,
      ),
    );
  }

  function deleteTask(taskId: string) {
    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
  }


  function updateReviewNote(taskId: string, reviewNote: string) {
    const now = new Date().toISOString();
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              reviewNote,
              updatedAt: now,
            }
          : task,
      ),
    );
  }

  function startEditing(task: Task) {
    setEditingTask(task);
    setIsFormOpen(true);
  }

  const vdModule = (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Visualized Deadline · v0.6.1</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">可视化 Deadline，非传统 Todo List。</h1>
          <p className="mt-3 max-w-2xl text-slate-600">系统记录任务、时间压力与人生节奏；你只需要观察状态，选择下一步。</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-700">
          添加项目
        </button>
      </header>

      <PressureCard pressure={pressure} onRecalibrate={openRecalibration} />
      <RecommendationCard tasks={recommendedTasks} />

      {isFormOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/15 px-4 py-6 backdrop-blur-sm">
          <section className="max-h-[calc(100vh-3rem)] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-2xl shadow-slate-300/60">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Project Sheet</p>
                <h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{editingTask ? '编辑项目' : '新建项目'}</h2>
              </div>
              <button type="button" onClick={closeForm} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">
                关闭
              </button>
            </div>
            <TaskForm task={editingTask} onCancel={closeForm} onSubmit={handleSubmit} />
          </section>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <PriorityMap tasks={activeTasks} />
        <div className="space-y-6">
          <TaskList tasks={activeTasks} onArchive={archiveTask} onDelete={deleteTask} onEdit={startEditing} />
          <ActivityLog tasks={normalizedTasks} onDelete={deleteTask} onReviewNoteChange={updateReviewNote} />
        </div>
      </div>

      <AchievementsPanel achievements={normalizedAchievements} />
    </>
  );

  const moduleContent: Record<LifeOSModule, ReactElement> = {
    'life-map': <LifeMapPage />,
    vd: vdModule,
    social: <SocialPage />,
    profile: <ProfilePage profile={normalizedProfile} onProfileChange={setProfile} />,
    log: <LogPage tasks={normalizedTasks} onDelete={deleteTask} onReviewNoteChange={updateReviewNote} />,
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_32%),radial-gradient(circle_at_top_right,#f8fafc,transparent_30%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-8 text-slate-900 md:px-8">
      {!onboardingComplete ? <OnboardingFlow onComplete={completeOnboarding} /> : null}
      {isRecalibrationOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/15 px-4 backdrop-blur-sm">
          <section className="w-full max-w-lg rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-2xl shadow-slate-300/60">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Pressure Recalibration</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">此刻这组任务让你感觉有多大压力？</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">系统会读取当前进行中任务负载，并用你的主观感受重新计算个体压力映射系数。</p>
            <div className="mt-6 rounded-3xl bg-slate-50/90 p-5 ring-1 ring-white/80">
              <div className="flex items-end justify-between gap-4"><span className="text-sm font-medium text-slate-600">主观压力</span><span className="text-5xl font-semibold text-slate-950">{recalibrationPressure}</span></div>
              <input type="range" min="0" max="100" value={recalibrationPressure} onChange={(event) => setRecalibrationPressure(clampPressure(Number(event.target.value)))} className="mt-5 w-full accent-slate-700" />
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setIsRecalibrationOpen(false)} className="rounded-full px-5 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">取消</button><button type="button" onClick={submitRecalibration} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">保存校准</button></div>
          </section>
        </div>
      ) : null}
      <AchievementToast achievement={toastAchievement} />

      <div className="mx-auto max-w-6xl space-y-6">
        <LifeOSNav activeModule={activeModule} onModuleChange={setActiveModule} />
        {moduleContent[activeModule]}
      </div>
    </main>
  );
}

export default App;
