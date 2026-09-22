import { useEffect, useMemo, useRef, useState } from 'react';
import { AchievementToast } from './components/AchievementToast';
import { AuthPanel } from './components/AuthPanel';
import { GuestImportPanel } from './components/GuestImportPanel';
import { HomePage } from './components/HomePage';
import { LifeMapPage } from './components/LifeMapPage';
import { LogPage } from './components/LogPage';
import { OnboardingFlow } from './components/OnboardingFlow';
import { ProfilePage } from './components/ProfilePage';
import { PrivacyPolicyPage } from './components/PrivacyPolicyPage';
import { TaskForm } from './components/TaskForm';
import { TaskPage } from './components/TaskPage';
import { TermsPage } from './components/TermsPage';
import { V2AppShell } from './components/V2AppShell';
import { PublicNotFound, PublicSite, isPublicSurface } from './components/PublicSite';
import { useWorkspaceLocalStorage, WorkspaceOwnerProvider } from './hooks/useLocalStorage';
import { useWorkspaceOwner } from './hooks/useWorkspaceOwner';
import { useSupabaseAuth } from './hooks/useSupabaseAuth';
import type { Roadmap } from './types/roadmap';
import type { VDNotification } from './types/notification';
import type { BuiltInLifeEventType, LifeEventStore } from './types/lifeController';
import type { Achievement, AIArtifact, AIArtifactInput, ActivityType, DailyQuest, DailyReview, Goal, GoalInput, LifecycleStatus, PressureBreakdown, PressureCalibrationSnapshot, PressureHistoryEventType, PressureHistoryRecord, ReminderSettings, Task, TaskInput, UserProfile } from './types/task';
import {
  achievementCatalog,
  calculatePressureIndex,
  calculateTaskLoad,
  createPressureCalibration,
  clampImportance,
  clampPressure,
  clampProgress,
  getTaskScore,
  getUrgencyScore,
  normalizePressureCalibration,
  migrateLegacyImportance,
  normalizeActivityType,
  normalizeLifecycleStatus,
  normalizeProgressMode,
} from './utils/taskScoring';
import { appendPressureHistoryRecord, createPressureHistoryRecord, normalizePressureHistory, replaceTaskDerivedPressureHistory } from './utils/pressureHistory';
import { sortActiveTasksByProgress } from './utils/taskDerivedState';
import { generateDailyQuest } from './utils/dailyQuest';
import { deleteCloudLifeEvent, loadCloudData, loadCloudLifeEvents, saveCloudGoals, saveCloudPressureHistory, saveCloudProfile, saveCloudTasks, upsertCloudLifeEvents } from './lib/cloudSync';
import { assertWorkspaceSessionOwner, browserStorageAdapter, loadValue, mergeAuthenticatedWorkspaceRecords, saveValue, storageKeys, workspaceOnboardingFallback, workspaceOwnerKey } from './storage';
import { createDefaultLifePreferences, createLifeEvent, deriveLifeState, getLifeEventsForOwner, mergeLifeEvents, planLifeController, setLifeEventsForOwner, undoLatestLifeEvent as removeLatestLifeEvent } from './domain/life-controller';
import { buildHomeRecommendationComparison } from './domain/execution/homeProjection';
import { advanceGuestImportState, assertGuestCloudImportRuntimeEnabled, captureGuestImportSource, createGuestImportPreviewFromPending, readPendingGuestImport, validatePendingGuestImportConfirmation, type GuestImportPreview, type PendingGuestImportSnapshot } from './domain/v2/guestImport';
import { createOwnerScopedUiState, transitionOwnerScopedUiState } from './domain/v2/workspaceUiTransition';
import { isAuthenticatedPath, isKnownAuthenticatedEntryPath, legacyRouteRedirect, safeAuthenticatedNext } from './lib/appRoutes';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WELCOME_BACK_GAP_MS = 2 * 60 * 60 * 1000;
const WELCOME_BACK_ACTIVE_WRITE_MS = 60 * 1000;

const defaultReminderSettings: ReminderSettings = {
  reminderEnabled: false,
  reminderTime: '08:30',
  reminderType: ['daily_quest', 'evening_review', 'deadline'],
  notificationPermission: 'default',
};

const defaultProfile: UserProfile = {
  nickname: '',
  username: '',
  height: '',
  weight: '',
  identity: '',
  skills: '',
  longTermGoals: '',
  currentStage: '',
  avatarUrl: undefined,
};

type LegacyTask = Partial<Omit<Task, 'schemaVersion' | 'activityType' | 'lifecycleStatus'>> & {
  activityType?: ActivityType | string;
  lifecycleStatus?: LifecycleStatus | string;
  status?: 'todo' | 'doing' | 'done';
  progressMode?: 'manual' | 'auto' | string;
  taskProgress?: number;
  timeProgress?: number;
  estimatedDuration?: number;
  decomposition?: string[];
  stages?: string[];
  milestoneSuggestions?: string[];
  linkedGoalIds?: string[];
  schemaVersion?: number;
};

type WelcomeBackMessage = {
  greeting: string;
  name: string;
  currentTime: string;
  detail: string;
};


function formatWelcomeTime(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getTimeGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function isDeadlinePressureTask(task: Task): boolean {
  return getUrgencyScore(task.deadline) >= 30;
}


function normalizeTaskInput(input: TaskInput): TaskInput {
  const lifecycleStatus = input.progress >= 100 ? 'completed' : input.lifecycleStatus;

  return {
    title: input.title,
    description: input.description,
    importance: clampImportance(input.importance),
    deadline: input.deadline,
    startDate: input.startDate,
    dependencyIds: input.dependencyIds?.filter(Boolean),
    assignee: input.assignee?.trim() || undefined,
    progress: clampProgress(input.progress),
    taskProgress: clampProgress(input.taskProgress ?? input.progress),
    timeProgress: undefined,
    estimatedDuration: input.estimatedDuration,
    progressMode: normalizeProgressMode(input.progressMode, clampProgress(input.progress), input.deadline),
    decomposition: input.decomposition?.filter(Boolean),
    stages: input.stages?.filter(Boolean),
    milestoneSuggestions: input.milestoneSuggestions?.filter(Boolean),
    linkedGoalIds: input.linkedGoalIds?.filter(Boolean),
    nextAction: input.nextAction?.trim() || undefined,
    plannerTaskId: input.plannerTaskId,
    plannerLocked: input.plannerLocked,
    activityType: normalizeActivityType(input.activityType),
    lifecycleStatus,
    completedAt: lifecycleStatus === 'completed' ? input.completedAt : undefined,
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
    startDate: typeof task.startDate === 'string' ? task.startDate : undefined,
    dependencyIds: Array.isArray(task.dependencyIds) ? task.dependencyIds.filter((id): id is string => typeof id === 'string') : undefined,
    assignee: typeof task.assignee === 'string' ? task.assignee : undefined,
    progress,
    taskProgress: clampProgress(task.taskProgress ?? progress),
    timeProgress: undefined,
    estimatedDuration: typeof task.estimatedDuration === 'number' && Number.isFinite(task.estimatedDuration) ? Math.max(0, Math.round(task.estimatedDuration)) : undefined,
    progressMode: normalizeProgressMode(task.progressMode, progress, task.deadline || undefined),
    activityType: normalizeActivityType(task.activityType),
    lifecycleStatus: migratedLifecycleStatus,
    completedAt,
    abandonedAt,
    reviewNote: typeof task.reviewNote === 'string' ? task.reviewNote : undefined,
    decomposition: Array.isArray(task.decomposition) ? task.decomposition.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : undefined,
    stages: Array.isArray(task.stages) ? task.stages.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : undefined,
    milestoneSuggestions: Array.isArray(task.milestoneSuggestions) ? task.milestoneSuggestions.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : undefined,
    linkedGoalIds: Array.isArray(task.linkedGoalIds) ? task.linkedGoalIds.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : undefined,
    nextAction: typeof task.nextAction === 'string' ? task.nextAction : undefined,
    plannerTaskId: typeof task.plannerTaskId === 'string' ? task.plannerTaskId : undefined,
    plannerLocked: task.plannerLocked === true,
    schemaVersion: 3,
    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt || now,
  };
}

function normalizeStoredAchievements(achievements: Achievement[]): Achievement[] {
  if (!Array.isArray(achievements)) return [];
  const catalogById = new Map(achievementCatalog.map((achievement) => [achievement.id, achievement]));

  return achievements.flatMap((achievement) => {
    if (!achievement.unlockedAt) return [];
    const catalogAchievement = catalogById.get(achievement.id);
    if (!catalogAchievement) return [];
    return [{ ...catalogAchievement, unlockTime: achievement.unlockedAt, unlockedAt: achievement.unlockedAt }];
  });
}


function normalizeAIArtifacts(artifacts: AIArtifact[]): AIArtifact[] {
  if (!Array.isArray(artifacts)) return [];

  return artifacts.flatMap((artifact) => {
    if (!artifact || typeof artifact !== 'object' || !artifact.content || !artifact.createdAt) return [];
    return [{
      id: artifact.id || crypto.randomUUID(),
      kind: artifact.kind || 'review',
      title: artifact.title || 'AI 记录',
      content: artifact.content,
      createdAt: artifact.createdAt,
      relatedTaskIds: Array.isArray(artifact.relatedTaskIds) ? artifact.relatedTaskIds.filter((id): id is string => typeof id === 'string') : [],
      relatedGoalIds: Array.isArray(artifact.relatedGoalIds) ? artifact.relatedGoalIds.filter((id): id is string => typeof id === 'string') : [],
      pressure: typeof artifact.pressure === 'number' ? artifact.pressure : undefined,
      model: typeof artifact.model === 'string' ? artifact.model : undefined,
      metadata: artifact.metadata && typeof artifact.metadata === 'object' ? artifact.metadata : undefined,
    }];
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 120);
}

function createAIArtifact(input: AIArtifactInput): AIArtifact {
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    relatedTaskIds: input.relatedTaskIds ?? [],
    relatedGoalIds: input.relatedGoalIds ?? [],
  };
}

function getLocalDateKey(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hasCompletedInFinalHour(task: Task): boolean {
  if (!task.completedAt || !task.deadline) return false;
  const completedAt = new Date(task.completedAt).getTime();
  const deadline = new Date(task.deadline).getTime();
  if (!Number.isFinite(completedAt) || !Number.isFinite(deadline)) return false;
  const diff = deadline - completedAt;
  return diff >= 0 && diff <= 60 * 60 * 1000;
}

function hasConsecutiveDateRun(dateKeys: string[], targetDays: number): boolean {
  const uniqueDates = [...new Set(dateKeys)].sort();
  if (uniqueDates.length < targetDays) return false;
  let run = 1;
  for (let index = 1; index < uniqueDates.length; index += 1) {
    const previous = new Date(`${uniqueDates[index - 1]}T00:00:00`).getTime();
    const current = new Date(`${uniqueDates[index]}T00:00:00`).getTime();
    run = current - previous === MS_PER_DAY ? run + 1 : 1;
    if (run >= targetDays) return true;
  }
  return false;
}

function getMaxFinalHourCompletionRun(tasks: Task[]): number {
  let currentRun = 0;
  let maxRun = 0;
  tasks
    .filter((task) => task.lifecycleStatus === 'completed' && task.completedAt)
    .sort((left, right) => new Date(left.completedAt as string).getTime() - new Date(right.completedAt as string).getTime())
    .forEach((task) => {
      currentRun = hasCompletedInFinalHour(task) ? currentRun + 1 : 0;
      maxRun = Math.max(maxRun, currentRun);
    });
  return maxRun;
}

function normalizeProfile(profile: unknown): UserProfile {
  if (!profile || typeof profile !== 'object') return defaultProfile;
  const storedProfile = profile as Partial<UserProfile>;

  return {
    nickname: storedProfile.nickname ?? '',
    username: storedProfile.username ?? '',
    height: storedProfile.height ?? '',
    weight: storedProfile.weight ?? '',
    identity: storedProfile.identity ?? '',
    skills: storedProfile.skills ?? '',
    longTermGoals: storedProfile.longTermGoals ?? '',
    currentStage: storedProfile.currentStage ?? '',
    avatarUrl: typeof storedProfile.avatarUrl === 'string' && !storedProfile.avatarUrl.startsWith('data:') ? storedProfile.avatarUrl : undefined,
  };
}

function normalizeGoal(goal: Partial<Goal>): Goal {
  const now = new Date().toISOString();
  return {
    id: goal.id || crypto.randomUUID(),
    title: goal.title?.trim() || '未命名目标',
    targetDate: goal.targetDate || undefined,
    startDate: typeof goal.startDate === 'string' ? goal.startDate : undefined,
    lifeLayer: goal.lifeLayer,
    planningStatus: goal.planningStatus,
    category: normalizeActivityType(goal.category),
    priority: clampImportance(goal.priority),
    linkedTaskIds: Array.isArray(goal.linkedTaskIds) ? goal.linkedTaskIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())) : [],
    roadmapSuggestions: Array.isArray(goal.roadmapSuggestions) ? goal.roadmapSuggestions.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : undefined,
    createdAt: goal.createdAt || now,
    updatedAt: goal.updatedAt || now,
  };
}

function normalizeGoals(goals: unknown): Goal[] {
  if (!Array.isArray(goals)) return [];
  return goals.filter((goal): goal is Partial<Goal> => Boolean(goal) && typeof goal === 'object').map(normalizeGoal);
}

function createGoal(input: GoalInput): Goal {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: input.title.trim() || '未命名目标',
    targetDate: input.targetDate || undefined,
    category: normalizeActivityType(input.category),
    priority: clampImportance(input.priority),
    linkedTaskIds: input.linkedTaskIds ?? [],
    roadmapSuggestions: input.roadmapSuggestions?.filter(Boolean),
    createdAt: now,
    updatedAt: now,
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

  const unlockedAt = new Date().toISOString();

  return {
    ...achievement,
    unlockTime: unlockedAt,
    unlockedAt,
  };
}

function AuthenticatedApp() {
  const [publicPath, setPublicPath] = useState(() => window.location.pathname);
  const { session, isLoading: isAuthLoading, error: authError, status: authStatus, authDebugInfo, isConfigured: isSupabaseConfigured, featureFlags: authFeatureFlags, signIn, signUp, resendVerificationEmail, signOut, signInWithOAuth, requestPhoneOtp, verifyPhoneOtp, verifyEmailOtp, phoneResendRemainingMs, emailResendRemainingMs } = useSupabaseAuth();
  const { owner: workspaceOwner, isReady: isWorkspaceOwnerReady } = useWorkspaceOwner(session?.user.id, !isAuthLoading);
  const authoritativeOwnerKey = workspaceOwner ? workspaceOwnerKey(workspaceOwner) : undefined;
  const currentAuthoritativeOwnerKey = useRef<string | undefined>(authoritativeOwnerKey);
  currentAuthoritativeOwnerKey.current = authoritativeOwnerKey;
  const [, setCloudStatus] = useState<string | undefined>();
  const [cloudToast, setCloudToast] = useState<string | undefined>();
  const [, setCloudError] = useState<string | undefined>();
  const [lifeEventCloudError, setLifeEventCloudError] = useState<string | undefined>();
  const [, setIsCloudLoading] = useState(false);
  const [isCloudReady, setIsCloudReady] = useState(false);
  const [isLifeEventCloudReady, setIsLifeEventCloudReady] = useState(false);
  const isApplyingCloudData = useRef(false);
  const guestImportPreviewRef = useRef<GuestImportPreview | undefined>(undefined);
  const [guestImportPreview, setGuestImportPreview] = useState<GuestImportPreview | undefined>();
  const [pendingGuestImport, setPendingGuestImport] = useState<PendingGuestImportSnapshot | null>(() => readPendingGuestImport(browserStorageAdapter));
  const [tasks, setTasks, tasksReady] = useWorkspaceLocalStorage<Task[]>(workspaceOwner, storageKeys.tasks, []);
  const [goals, setGoals, goalsReady] = useWorkspaceLocalStorage<Goal[]>(workspaceOwner, storageKeys.goals, []);
  const [achievements, setAchievements, achievementsReady] = useWorkspaceLocalStorage<Achievement[]>(workspaceOwner, storageKeys.achievements, []);
  const [aiArtifacts, setAIArtifacts, aiArtifactsReady] = useWorkspaceLocalStorage<AIArtifact[]>(workspaceOwner, storageKeys.aiArtifacts, []);
  const [roadmaps, setRoadmaps, roadmapsReady] = useWorkspaceLocalStorage<Roadmap[]>(workspaceOwner, storageKeys.roadmaps, []);
  const [, , notificationsReady] = useWorkspaceLocalStorage<VDNotification[]>(workspaceOwner, storageKeys.notifications, [{ id: 'notification-ia', type: 'SYSTEM', title: '消息中心已启用', summary: '周报、风险提醒与系统建议将统一在这里送达。', content: 'VD 的后台分析结果会写入消息中心，不再占用首页的行动空间。', isRead: false, createdAt: new Date().toISOString() }]);
  const [profile, setProfile, profileReady] = useWorkspaceLocalStorage<UserProfile>(workspaceOwner, storageKeys.profile, defaultProfile);
  const [socialNodes, setSocialNodes, socialNodesReady] = useWorkspaceLocalStorage<unknown[]>(workspaceOwner, storageKeys.socialNodes, []);
  const [socialLayoutVersion, setSocialLayoutVersion, socialLayoutReady] = useWorkspaceLocalStorage<number>(workspaceOwner, storageKeys.socialLayoutVersion, 0);
  const [onboardingComplete, setOnboardingComplete, onboardingReady] = useWorkspaceLocalStorage<boolean>(workspaceOwner, storageKeys.onboardingComplete, workspaceOnboardingFallback(browserStorageAdapter, workspaceOwner));
  const [baselinePressure, setBaselinePressure, baselinePressureReady] = useWorkspaceLocalStorage<number | null>(workspaceOwner, storageKeys.baselinePressure, null);
  const legacyReferencePressure = baselinePressure ?? 35;
  const [pressureCalibration, setPressureCalibration, pressureCalibrationReady] = useWorkspaceLocalStorage<PressureCalibrationSnapshot | null>(workspaceOwner, storageKeys.pressureCalibration, null);
  const [pressureHistory, setPressureHistory, pressureHistoryReady] = useWorkspaceLocalStorage<PressureHistoryRecord[]>(workspaceOwner, storageKeys.pressureHistory, []);
  const [storedDailyQuest, setStoredDailyQuest, dailyQuestReady] = useWorkspaceLocalStorage<DailyQuest | null>(workspaceOwner, storageKeys.dailyQuest, null);
  const [dailyReview, , dailyReviewReady] = useWorkspaceLocalStorage<DailyReview | null>(workspaceOwner, storageKeys.dailyReview, null);
  const [, , reminderSettingsReady] = useWorkspaceLocalStorage<ReminderSettings>(workspaceOwner, storageKeys.reminderSettings, defaultReminderSettings);
  const [lifeEventsByOwner, setLifeEventsByOwner, lifeEventsReady] = useWorkspaceLocalStorage<LifeEventStore>(workspaceOwner, storageKeys.lifeEventsByOwner, {});
  const isWorkspaceReady = isWorkspaceOwnerReady && [tasksReady, goalsReady, achievementsReady, aiArtifactsReady, roadmapsReady, notificationsReady, profileReady, socialNodesReady, socialLayoutReady, onboardingReady, baselinePressureReady, pressureCalibrationReady, pressureHistoryReady, dailyQuestReady, dailyReviewReady, reminderSettingsReady, lifeEventsReady].every(Boolean);
  const [, setViewportWidth] = useState(() => window.innerWidth);
  const [isRecalibrationOpen, setIsRecalibrationOpen] = useState(false);
  const [recalibrationPressure, setRecalibrationPressure] = useState(legacyReferencePressure);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [toastAchievement, setToastAchievement] = useState<Achievement | undefined>();
  const [welcomeBackMessage, setWelcomeBackMessage] = useState<WelcomeBackMessage | undefined>();
  const [pressureClock, setPressureClock] = useState(() => Date.now());
  const hasCheckedWelcomeBack = useRef(false);
  const hasLoggedHydration = useRef(false);
  const ownerScopedUiState = useRef(createOwnerScopedUiState(undefined));
  const recalibrationOwnerKey = useRef<string | undefined>(undefined);

  const lifeEventOwner = session?.user.id ?? 'guest';
  const lifeEvents = useMemo(() => getLifeEventsForOwner(lifeEventsByOwner, lifeEventOwner), [lifeEventOwner, lifeEventsByOwner]);
  const lifePreferences = useMemo(() => createDefaultLifePreferences(), []);

  useEffect(() => {
    const reset = transitionOwnerScopedUiState(ownerScopedUiState.current, authoritativeOwnerKey);
    if (reset === ownerScopedUiState.current) return;
    ownerScopedUiState.current = reset;
    setIsFormOpen(reset.isFormOpen);
    setEditingTask(undefined);
    setIsRecalibrationOpen(reset.isRecalibrationOpen);
    setRecalibrationPressure(reset.recalibrationPressure);
    setToastAchievement(undefined);
    setWelcomeBackMessage(undefined);
    setCloudToast(undefined);
    setCloudStatus(undefined);
    setCloudError(undefined);
    setLifeEventCloudError(undefined);
    setIsCloudLoading(false);
    setIsCloudReady(false);
    setIsLifeEventCloudReady(false);
    setGuestImportPreview(undefined);
    guestImportPreviewRef.current = undefined;
    isApplyingCloudData.current = false;
    hasCheckedWelcomeBack.current = false;
    hasLoggedHydration.current = false;
    recalibrationOwnerKey.current = undefined;
  }, [authoritativeOwnerKey]);

  const normalizedTasks = useMemo(() => {
    const storedTasks = Array.isArray(tasks) ? tasks : [];
    return storedTasks.map((task) => normalizeStoredTask(task));
  }, [tasks]);
  const normalizedGoals = useMemo(() => normalizeGoals(goals), [goals]);
  const normalizedAchievements = useMemo(() => normalizeStoredAchievements(achievements), [achievements]);
  const normalizedAIArtifacts = useMemo(() => normalizeAIArtifacts(aiArtifacts), [aiArtifacts]);
  const normalizedProfile = useMemo(() => normalizeProfile(profile), [profile]);
  const normalizedPressureCalibration = useMemo(() => normalizePressureCalibration(pressureCalibration, legacyReferencePressure), [legacyReferencePressure, pressureCalibration]);
  const normalizedPressureHistory = useMemo(() => normalizePressureHistory(pressureHistory), [pressureHistory]);
  const activeTasks = useMemo(() => sortActiveTasksByProgress(normalizedTasks.filter((task) => task.lifecycleStatus === 'active')), [normalizedTasks]);
  const recommendedTasks = useMemo(() => normalizedTasks.filter((task) => task.lifecycleStatus === 'active').sort((a, b) => getTaskScore(b) - getTaskScore(a)).slice(0, 3), [normalizedTasks]);
  const homeRecommendationComparison = useMemo(
    () => buildHomeRecommendationComparison(normalizedGoals, normalizedTasks, recommendedTasks),
    [normalizedGoals, normalizedTasks, recommendedTasks],
  );
  const deadlinePressureTasks = useMemo(() => activeTasks.filter(isDeadlinePressureTask).sort((a, b) => getTaskScore(b) - getTaskScore(a)), [activeTasks]);
  const pressure = useMemo<PressureBreakdown>(() => calculatePressureIndex(normalizedTasks, normalizedPressureCalibration, legacyReferencePressure, new Date(pressureClock)), [normalizedTasks, normalizedPressureCalibration, legacyReferencePressure, pressureClock]);
  const recalibrationPreview = useMemo<PressureBreakdown>(() => {
    const previewCalibration = createPressureCalibration(recalibrationPressure, normalizedTasks, 0, new Date().toISOString());
    return calculatePressureIndex(normalizedTasks, previewCalibration, legacyReferencePressure);
  }, [legacyReferencePressure, normalizedTasks, recalibrationPressure]);
  const lifeState = useMemo(() => deriveLifeState(lifeEvents, new Date(pressureClock), lifePreferences.timezone), [lifeEvents, lifePreferences.timezone, pressureClock]);
  const lifePlan = useMemo(() => planLifeController({ currentTime: new Date(pressureClock), lifeState, lifePreferences, availableTasks: [] }), [lifePreferences, lifeState, pressureClock]);

  const lifeEventSyncStatus = session
    ? (lifeEventCloudError || (isLifeEventCloudReady ? '生活记录已启用用户隔离云同步。' : '生活记录保存在本机，正在检查云端 migration。'))
    : '访客记录仅保存在当前浏览器。';

  useEffect(() => {
    if (!isWorkspaceReady || !authoritativeOwnerKey || recalibrationOwnerKey.current === authoritativeOwnerKey) return;
    recalibrationOwnerKey.current = authoritativeOwnerKey;
    setRecalibrationPressure(legacyReferencePressure);
  }, [authoritativeOwnerKey, isWorkspaceReady, legacyReferencePressure]);

  const dailyQuest = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (storedDailyQuest?.date === today) return storedDailyQuest;
    return generateDailyQuest(normalizedTasks, dailyReview ?? undefined);
  }, [dailyReview, normalizedTasks, storedDailyQuest]);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    if (storedDailyQuest?.id === dailyQuest.id && JSON.stringify(storedDailyQuest) === JSON.stringify(dailyQuest)) return;
    setStoredDailyQuest(dailyQuest);
  }, [dailyQuest, isWorkspaceReady, setStoredDailyQuest, storedDailyQuest]);

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth);
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!session || !pendingGuestImport) {
      guestImportPreviewRef.current = undefined;
      setGuestImportPreview(undefined);
      return;
    }
    if (!authFeatureFlags.guestImport) {
      if (pendingGuestImport.state !== 'GUEST_IMPORT_DISABLED') setPendingGuestImport(advanceGuestImportState(browserStorageAdapter, pendingGuestImport, 'GUEST_IMPORT_DISABLED'));
      guestImportPreviewRef.current = undefined;
      setGuestImportPreview(undefined);
      return;
    }
    if (pendingGuestImport.state !== 'preview_ready') {
      setPendingGuestImport(advanceGuestImportState(browserStorageAdapter, pendingGuestImport, 'preview_ready'));
      return;
    }
    const preview = createGuestImportPreviewFromPending(pendingGuestImport, session.user.id);
    guestImportPreviewRef.current = preview;
    setGuestImportPreview(preview);
  }, [authFeatureFlags.guestImport, isAuthLoading, pendingGuestImport, session?.user.id]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!session) {
      setIsCloudReady(false);
      setIsLifeEventCloudReady(false);
      setCloudStatus(undefined);
      setCloudError(undefined);
      setLifeEventCloudError(undefined);
      return;
    }

    if (!isWorkspaceReady || !workspaceOwner) {
      setIsCloudReady(false);
      setIsLifeEventCloudReady(false);
      setCloudStatus('正在切换到当前账号的隔离工作区…');
      return;
    }
    assertWorkspaceSessionOwner(workspaceOwner, session.user.id);

    let isMounted = true;
    setIsCloudLoading(true);
    setCloudError(undefined);
    setLifeEventCloudError(undefined);
    setCloudStatus('正在从 Supabase 读取云端数据…');
    loadCloudData(session, workspaceOwner)
      .then(async (cloudData) => {
        if (!isMounted) return;
        isApplyingCloudData.current = true;
        const mergedTasks = mergeAuthenticatedWorkspaceRecords(workspaceOwner, session.user.id, normalizedTasks, cloudData.tasks);
        const mergedGoals = mergeAuthenticatedWorkspaceRecords(workspaceOwner, session.user.id, normalizedGoals, cloudData.goals);
        const mergedPressureHistory = mergeAuthenticatedWorkspaceRecords(workspaceOwner, session.user.id, normalizedPressureHistory, cloudData.pressureHistory);
        const mergedSocialNodes = cloudData.socialNodes ?? socialNodes;
        const mergedSocialLayoutVersion = cloudData.socialLayoutVersion ?? socialLayoutVersion;
        setTasks(mergedTasks);
        setGoals(mergedGoals);
        setPressureHistory(mergedPressureHistory);
        setSocialNodes(mergedSocialNodes);
        setSocialLayoutVersion(mergedSocialLayoutVersion);
        if (cloudData.profile) setProfile(cloudData.profile);
        if (cloudData.pressureCalibration) setPressureCalibration(cloudData.pressureCalibration);
        if (cloudData.onboardingComplete !== null) setOnboardingComplete(cloudData.onboardingComplete);
        try {
          const cloudLifeEvents = await loadCloudLifeEvents(session, workspaceOwner);
          if (!isMounted) return;
          const mergedLifeEvents = mergeLifeEvents(getLifeEventsForOwner(lifeEventsByOwner, session.user.id), cloudLifeEvents);
          setLifeEventsByOwner((current) => setLifeEventsForOwner(current, session.user.id, mergedLifeEvents));
          await upsertCloudLifeEvents(mergedLifeEvents, session, workspaceOwner);
          if (!isMounted) return;
          setIsLifeEventCloudReady(true);
          setLifeEventCloudError(undefined);
        } catch (error) {
          if (!isMounted) return;
          setIsLifeEventCloudReady(false);
          setLifeEventCloudError(`生活记录云同步未启用：${error instanceof Error ? error.message : '请先应用 Life Controller migration。'}`);
        }
        if (!isMounted) return;
        setIsCloudReady(true);
        setCloudStatus(pendingGuestImport ? '检测到本机数据，尚未导入到当前账号。' : '已连接云端工作区');
        if (!pendingGuestImport) setCloudToast('已连接云端工作区');
        window.setTimeout(() => {
          if (isMounted) isApplyingCloudData.current = false;
        }, 0);
      })
      .catch((error) => {
        if (!isMounted) return;
        setCloudError(error instanceof Error ? error.message : '云同步读取失败。');
      })
      .finally(() => {
        if (isMounted) setIsCloudLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthLoading, isWorkspaceReady, pendingGuestImport, session?.access_token, session?.user.id, workspaceOwner]);

  function confirmGuestImport(): void {
    if (!session || !guestImportPreview) return;
    try {
      if (!pendingGuestImport) return;
      validatePendingGuestImportConfirmation(browserStorageAdapter, pendingGuestImport, guestImportPreview, {
        snapshotId: guestImportPreview.snapshotId,
        snapshotChecksum: guestImportPreview.snapshotChecksum,
        destinationUserId: session.user.id,
        clientRequestId: crypto.randomUUID(),
      }, session.user.id);
      assertGuestCloudImportRuntimeEnabled();
    } catch (error) {
      setCloudStatus(error instanceof Error && error.message === 'GUEST_IMPORT_RUNTIME_DISABLED_UNTIL_V2_SCHEMA_DEPLOYMENT'
        ? '导入确认已校验；生产 v2 表与服务端执行闸门尚未获准，未写入任何云端记录。'
        : '导入确认失败：本机快照或登录身份已变化。请重新生成预览。');
    }
  }

  function capturePreAuthGuestSource(): void {
    if (session || isAuthLoading) return;
    const snapshot = captureGuestImportSource(browserStorageAdapter);
    if (snapshot) setPendingGuestImport(snapshot);
  }

  async function recordLifeEvent(type: BuiltInLifeEventType): Promise<void> {
    if (type === 'wake' && lifeState.currentSleepState === 'awake') throw new Error('当前已是清醒状态，未重复记录起床。');
    if (type === 'sleep_start' && lifeState.currentSleepState === 'sleeping') throw new Error('当前已是睡眠状态，未重复记录睡觉。');
    const event = createLifeEvent(type);
    setLifeEventsByOwner((current) => {
      return setLifeEventsForOwner(current, lifeEventOwner, mergeLifeEvents(getLifeEventsForOwner(current, lifeEventOwner), [event]));
    });
    setPressureClock(Date.now());

    if (!session || !workspaceOwner || !isWorkspaceReady || !isLifeEventCloudReady) return;
    const requestOwnerKey = authoritativeOwnerKey;
    try {
      await upsertCloudLifeEvents([event], session, workspaceOwner);
      if (currentAuthoritativeOwnerKey.current === requestOwnerKey) setLifeEventCloudError(undefined);
    } catch (error) {
      if (currentAuthoritativeOwnerKey.current === requestOwnerKey) setLifeEventCloudError(`生活记录云同步失败：${error instanceof Error ? error.message : '未知错误'}`);
      throw new Error('记录已保存在本机，但云端同步失败。');
    }
  }

  async function undoLatestLifeEvent(): Promise<void> {
    const latest = removeLatestLifeEvent(lifeEvents).removed;
    if (!latest) throw new Error('没有可撤销的生活记录。');

    setLifeEventsByOwner((current) => {
      return setLifeEventsForOwner(current, lifeEventOwner, removeLatestLifeEvent(getLifeEventsForOwner(current, lifeEventOwner)).events);
    });
    setPressureClock(Date.now());

    if (!session || !workspaceOwner || !isWorkspaceReady || !isLifeEventCloudReady) return;
    const requestOwnerKey = authoritativeOwnerKey;
    try {
      await deleteCloudLifeEvent(latest.id, session, workspaceOwner);
      if (currentAuthoritativeOwnerKey.current === requestOwnerKey) setLifeEventCloudError(undefined);
    } catch (error) {
      setLifeEventsByOwner((current) => {
        return setLifeEventsForOwner(current, lifeEventOwner, mergeLifeEvents(getLifeEventsForOwner(current, lifeEventOwner), [latest]));
      });
      if (currentAuthoritativeOwnerKey.current === requestOwnerKey) setLifeEventCloudError(`撤销云同步失败：${error instanceof Error ? error.message : '未知错误'}`);
      throw new Error('云端撤销失败，最近记录已恢复。');
    }
  }

  useEffect(() => {
    if (!session || !workspaceOwner || !isWorkspaceReady || !isCloudReady || isApplyingCloudData.current) return;
    let isCurrent = true;
    saveCloudTasks(normalizedTasks, session, workspaceOwner).then(() => { if (isCurrent) setCloudStatus('已同步到云端'); }).catch((error) => { if (isCurrent) setCloudError(error instanceof Error ? error.message : '任务云同步失败。'); });
    return () => { isCurrent = false; };
  }, [isCloudReady, isWorkspaceReady, normalizedTasks, session, workspaceOwner]);

  useEffect(() => {
    if (!session || !workspaceOwner || !isWorkspaceReady || !isCloudReady || isApplyingCloudData.current) return;
    let isCurrent = true;
    saveCloudGoals(normalizedGoals, session, workspaceOwner).then(() => { if (isCurrent) setCloudStatus('已同步到云端'); }).catch((error) => { if (isCurrent) setCloudError(error instanceof Error ? error.message : '目标云同步失败。'); });
    return () => { isCurrent = false; };
  }, [isCloudReady, isWorkspaceReady, normalizedGoals, session, workspaceOwner]);

  useEffect(() => {
    if (!session || !workspaceOwner || !isWorkspaceReady || !isCloudReady || isApplyingCloudData.current) return;
    let isCurrent = true;
    saveCloudPressureHistory(normalizedPressureHistory, session, workspaceOwner).then(() => { if (isCurrent) setCloudStatus('已同步到云端'); }).catch((error) => { if (isCurrent) setCloudError(error instanceof Error ? error.message : '压力历史云同步失败。'); });
    return () => { isCurrent = false; };
  }, [isCloudReady, isWorkspaceReady, normalizedPressureHistory, session, workspaceOwner]);

  useEffect(() => {
    if (!session || !workspaceOwner || !isWorkspaceReady || !isCloudReady || isApplyingCloudData.current) return;
    let isCurrent = true;
    saveCloudProfile({ profile: normalizedProfile, pressureCalibration: normalizedPressureCalibration, onboardingComplete, socialNodes, socialLayoutVersion }, session, workspaceOwner)
      .then(() => { if (isCurrent) setCloudStatus('已同步到云端'); })
      .catch((error) => { if (isCurrent) setCloudError(error instanceof Error ? error.message : '个人设置云同步失败。'); });
    return () => { isCurrent = false; };
  }, [isCloudReady, isWorkspaceReady, normalizedPressureCalibration, normalizedProfile, onboardingComplete, session, socialLayoutVersion, socialNodes, workspaceOwner]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setPressureClock(Date.now()), 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    if (hasLoggedHydration.current) return;
    hasLoggedHydration.current = true;
    console.info('[VD_ONBOARDING] hydration/restored state after reload', {
      taskCount: normalizedTasks.length,
      onboardingComplete,
      subjectivePressure: normalizedPressureCalibration.lastSubjectivePressure,
      pressureCoefficient: normalizedPressureCalibration.pressureCoefficient,
      realtimePressure: pressure.rawPressure,
    });
  }, [authoritativeOwnerKey, isWorkspaceReady, normalizedPressureCalibration.lastSubjectivePressure, normalizedPressureCalibration.pressureCoefficient, normalizedTasks.length, onboardingComplete, pressure.rawPressure]);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    if (JSON.stringify(tasks) !== JSON.stringify(normalizedTasks)) {
      setTasks(normalizedTasks);
    }
  }, [isWorkspaceReady, normalizedTasks, setTasks, tasks]);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    if (JSON.stringify(goals) !== JSON.stringify(normalizedGoals)) {
      setGoals(normalizedGoals);
    }
  }, [goals, isWorkspaceReady, normalizedGoals, setGoals]);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    if (JSON.stringify(achievements) !== JSON.stringify(normalizedAchievements)) {
      setAchievements(normalizedAchievements);
    }
  }, [achievements, isWorkspaceReady, normalizedAchievements, setAchievements]);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    if (JSON.stringify(aiArtifacts) !== JSON.stringify(normalizedAIArtifacts)) {
      setAIArtifacts(normalizedAIArtifacts);
    }
  }, [aiArtifacts, isWorkspaceReady, normalizedAIArtifacts, setAIArtifacts]);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    if (JSON.stringify(profile) !== JSON.stringify(normalizedProfile)) {
      setProfile(normalizedProfile);
    }
  }, [isWorkspaceReady, normalizedProfile, profile, setProfile]);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    if (JSON.stringify(pressureCalibration) !== JSON.stringify(normalizedPressureCalibration)) {
      setPressureCalibration(normalizedPressureCalibration);
    }
  }, [isWorkspaceReady, normalizedPressureCalibration, pressureCalibration, setPressureCalibration]);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    if (JSON.stringify(pressureHistory) !== JSON.stringify(normalizedPressureHistory)) {
      setPressureHistory(normalizedPressureHistory);
    }
  }, [isWorkspaceReady, normalizedPressureHistory, pressureHistory, setPressureHistory]);


  useEffect(() => {
    if (!cloudToast) return;
    const timeoutId = window.setTimeout(() => setCloudToast(undefined), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [cloudToast]);

  useEffect(() => {
    if (!toastAchievement) return;
    const timeoutId = window.setTimeout(() => setToastAchievement(undefined), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [toastAchievement]);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    if (hasCheckedWelcomeBack.current) return;
    hasCheckedWelcomeBack.current = true;
    const now = Date.now();
    let previousActiveAt: number | null = null;
    try {
      previousActiveAt = loadValue<number | null>(storageKeys.welcomeLastActive, null);
    } catch {
      previousActiveAt = null;
    }

    const topUrgentTask = deadlinePressureTasks[0];
    if (previousActiveAt && now - previousActiveAt > WELCOME_BACK_GAP_MS) {
      const name = normalizedProfile.nickname.trim() || '用户';
      setWelcomeBackMessage({
        greeting: getTimeGreeting(new Date(now)),
        name,
        currentTime: formatWelcomeTime(new Date(now)),
        detail: topUrgentTask ? `当前有 ${deadlinePressureTasks.length} 个截止压力任务，最高优先级：${topUrgentTask.title}。` : '当前没有明显截止压力，可以推进长期任务或恢复精力。',
      });
    }

    saveValue(storageKeys.welcomeLastActive, now);
    let lastWriteAt = now;
    const markActive = () => {
      const current = Date.now();
      if (current - lastWriteAt < WELCOME_BACK_ACTIVE_WRITE_MS) return;
      lastWriteAt = current;
      saveValue(storageKeys.welcomeLastActive, current);
    };
    const markVisible = () => {
      if (document.visibilityState === 'visible') markActive();
    };

    window.addEventListener('focus', markActive);
    window.addEventListener('pointerdown', markActive);
    window.addEventListener('keydown', markActive);
    document.addEventListener('visibilitychange', markVisible);
    return () => {
      window.removeEventListener('focus', markActive);
      window.removeEventListener('pointerdown', markActive);
      window.removeEventListener('keydown', markActive);
      document.removeEventListener('visibilitychange', markVisible);
    };
  }, [authoritativeOwnerKey, deadlinePressureTasks, isWorkspaceReady, normalizedProfile.nickname]);

  useEffect(() => {
    if (!welcomeBackMessage) return;
    const timeoutId = window.setTimeout(() => setWelcomeBackMessage(undefined), 5200);
    return () => window.clearTimeout(timeoutId);
  }, [welcomeBackMessage]);


  function recordPressureSnapshot(eventType: PressureHistoryEventType, sourceTasks = normalizedTasks, note?: string, calibration = normalizedPressureCalibration) {
    const snapshotPressure = calculatePressureIndex(sourceTasks, calibration, legacyReferencePressure);
    const record = createPressureHistoryRecord(snapshotPressure, sourceTasks, eventType, note);
    setPressureHistory((records) => appendPressureHistoryRecord(records, record));
  }

  function recalculateTaskDerivedPressureHistory(sourceTasks = normalizedTasks, note = '根据当前任务重算压力曲线，已清理可识别的任务推导点。') {
    const snapshotPressure = calculatePressureIndex(sourceTasks, normalizedPressureCalibration, legacyReferencePressure);
    const record = createPressureHistoryRecord(snapshotPressure, sourceTasks, 'auto', note, new Date(), 'task_derived');
    setPressureHistory((records) => replaceTaskDerivedPressureHistory(records, record));
    setCloudToast('已重算任务推导压力点；手动记录和未标记老数据已保留。');
  }

  useEffect(() => {
    if (!isWorkspaceReady) return;
    if (!onboardingComplete) return;
    recordPressureSnapshot('auto');
  }, [activeTasks.length, isWorkspaceReady, onboardingComplete, pressure.rawPressure, pressure.currentTaskLoad, pressure.recoveryRelief]);

  function saveAIArtifact(input: AIArtifactInput): AIArtifact {
    const artifact = createAIArtifact(input);
    setAIArtifacts((currentArtifacts) => normalizeAIArtifacts([artifact, ...normalizeAIArtifacts(currentArtifacts)]));
    return artifact;
  }

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
    if (!isWorkspaceReady) return;
    if (!onboardingComplete) return;

    unlockAchievement('first-entry');

    if (normalizedTasks.some((task) => task.lifecycleStatus === 'completed')) unlockAchievement('first-task-completed');
    if (normalizedTasks.some((task) => task.lifecycleStatus === 'abandoned' && task.importance <= 4)) unlockAchievement('first-low-value-abandoned');
    const completedDateKeys = normalizedTasks.filter((task) => task.lifecycleStatus === 'completed' && task.completedAt).map((task) => getLocalDateKey(task.completedAt as string)).filter((value): value is string => Boolean(value));
    if ([...new Set(completedDateKeys)].some((dateKey) => completedDateKeys.filter((item) => item === dateKey).length >= 6)) unlockAchievement('first-six-in-day');
    if (normalizedTasks.some((task) => task.importance >= 9 && hasCompletedInFinalHour(task))) unlockAchievement('last-survivor');
    if (getMaxFinalHourCompletionRun(normalizedTasks) >= 10) unlockAchievement('knife-edge-streak');
    if (normalizedTasks.filter((task) => task.lifecycleStatus === 'active' && task.deadline && new Date(task.deadline).getTime() < Date.now()).length > 5) unlockAchievement('rotting');
    if (normalizedTasks.filter((task) => task.activityType === 'entertainment').length >= 5) unlockAchievement('hedonism');
  }, [isWorkspaceReady, onboardingComplete, normalizedTasks]);

  useEffect(() => {
    if (!isWorkspaceReady) return;
    if (!onboardingComplete) return;
    const usageDateKeys = normalizedPressureHistory.map((record) => getLocalDateKey(record.timestamp)).filter((value): value is string => Boolean(value));
    if (hasConsecutiveDateRun(usageDateKeys, 7)) unlockAchievement('seven-day-streak');

    const pressureByDate = new Map<string, number[]>();
    normalizedPressureHistory.forEach((record) => {
      const dateKey = getLocalDateKey(record.timestamp);
      if (!dateKey) return;
      pressureByDate.set(dateKey, [...(pressureByDate.get(dateKey) ?? []), record.pressure]);
    });
    const over100Dates = [...pressureByDate.entries()].filter(([, values]) => values.length > 0 && values.every((value) => value > 100)).map(([dateKey]) => dateKey);
    if (hasConsecutiveDateRun(over100Dates, 3)) unlockAchievement('pressure-cooker');
  }, [isWorkspaceReady, normalizedPressureHistory, onboardingComplete]);

  function savePressureCalibration(referencePressure: number, sourceTasks = normalizedTasks) {
    if (!isWorkspaceReady) return;
    const calibration = createPressureCalibration(referencePressure, sourceTasks, 0, new Date().toISOString());
    setPressureCalibration(calibration);
    setBaselinePressure(calibration.lastSubjectivePressure);
    unlockAchievement('first-manageable-pressure');
    recordPressureSnapshot('recalibration', sourceTasks, `用户将主观压力重新校准为 ${calibration.lastSubjectivePressure}，系统已更新压力映射系数。`, calibration);
  }

  function openRecalibration() {
    setRecalibrationPressure(pressure.referencePressure);
    setIsRecalibrationOpen(true);
  }

  function submitRecalibration() {
    savePressureCalibration(recalibrationPressure);
    setIsRecalibrationOpen(false);
  }

  function completeOnboarding(importedTasks: TaskInput[], referencePressure: number, _calibration: PressureCalibrationSnapshot): { ok: boolean; error?: string } {
    console.info('[VD_ONBOARDING] submit reached app pipeline');

    try {
      if (!isWorkspaceReady) throw new Error('工作区仍在切换，请稍后重试。');
      const createdTasks = importedTasks.map((task) => createTask(task));
      const validCreatedTasks = createdTasks.filter((task) => task.lifecycleStatus === 'active' && task.progress < 100 && task.title.trim());
      if (validCreatedTasks.length === 0) throw new Error('请至少保留一个未完成的有效任务后再进入 VD。');

      const nextTasks = [...createdTasks, ...normalizedTasks];
      const totalTaskPressure = calculateTaskLoad(nextTasks);
      console.info('[VD_ONBOARDING] totalTaskPressure', totalTaskPressure);
      if (totalTaskPressure <= 0) throw new Error('当前任务压力为 0，无法完成校准。请检查任务重要性、截止时间或进度。');

      const calibration = createPressureCalibration(referencePressure, nextTasks, 0, new Date().toISOString());
      if (!Number.isFinite(calibration.pressureCoefficient) || calibration.pressureCoefficient < 0) throw new Error('压力校准失败，请重新选择主观压力。');

      const realtimePressure = calculatePressureIndex(nextTasks, calibration, legacyReferencePressure).rawPressure;
      if (!Number.isFinite(realtimePressure)) throw new Error('实时压力计算失败，请检查任务数据。');

      console.info('[VD_ONBOARDING] pressureCoefficient', calibration.pressureCoefficient);
      console.info('[VD_ONBOARDING] realtimePressure', realtimePressure);

      setTasks(nextTasks);
      setBaselinePressure(calibration.lastSubjectivePressure);
      setPressureCalibration(calibration);
      unlockAchievement('first-manageable-pressure');
      recordPressureSnapshot('recalibration', nextTasks, `用户将主观压力重新校准为 ${calibration.lastSubjectivePressure}，系统已更新压力映射系数。`, calibration);
      console.info('[VD_ONBOARDING] redirect started');
      setOnboardingComplete(true);
      return { ok: true };
    } catch (error) {
      setOnboardingComplete(false);
      console.error('[VD_ONBOARDING] onboarding pipeline failed', error);
      return { ok: false, error: error instanceof Error ? error.message : '进入 VD 失败，请稍后重试。' };
    }
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingTask(undefined);
  }

  function handleSubmit(input: TaskInput) {
    const normalizedInput = normalizeTaskInput(input);
    const now = new Date().toISOString();

    if (editingTask) {
      const nextTasks = normalizedTasks.map((task) => {
        if (task.id !== editingTask.id) return task;
        const lifecycleChanged = task.lifecycleStatus !== normalizedInput.lifecycleStatus;
        return {
          ...task,
          ...normalizedInput,
          completedAt: normalizedInput.lifecycleStatus === 'completed' ? normalizedInput.completedAt || task.completedAt || now : undefined,
          abandonedAt: normalizedInput.lifecycleStatus === 'abandoned' ? task.abandonedAt ?? now : lifecycleChanged ? undefined : task.abandonedAt,
          updatedAt: now,
        };
      });
      setTasks(nextTasks);
      recalculateTaskDerivedPressureHistory(nextTasks, `修改任务后重算压力曲线：${normalizedInput.title}`);
    } else {
      const newTask = createTask(normalizedInput);
      const nextTasks = [newTask, ...normalizedTasks];
      setTasks(nextTasks);
      recordPressureSnapshot('task_created', nextTasks, `新建任务：${newTask.title}`);
    }
    closeForm();
  }


  function addTaskDrafts(inputs: TaskInput[]) {
    if (inputs.length === 0) return;
    const newTasks = inputs.map((input) => createTask(normalizeTaskInput(input)));
    const nextTasks = [...newTasks, ...normalizedTasks];
    setTasks(nextTasks);
    recordPressureSnapshot('task_created', nextTasks, `AI 任务录入新增 ${newTasks.length} 个任务。`);
  }


  function archiveTask(task: Task, lifecycleStatus: Exclude<LifecycleStatus, 'active'>) {
    const now = new Date().toISOString();
    const nextTasks = normalizedTasks.map((item) =>
      item.id === task.id
        ? {
            ...item,
            lifecycleStatus,
            progress: lifecycleStatus === 'completed' ? 100 : item.progress,
            taskProgress: lifecycleStatus === 'completed' ? 100 : item.taskProgress,
            progressMode: lifecycleStatus === 'completed' ? 'manual' : item.progressMode,
            completedAt: lifecycleStatus === 'completed' ? now : item.completedAt,
            abandonedAt: lifecycleStatus === 'abandoned' ? now : item.abandonedAt,
            updatedAt: now,
          }
        : item,
    );
    setTasks(nextTasks);
    recalculateTaskDerivedPressureHistory(nextTasks, `${lifecycleStatus === 'completed' ? '完成' : '放弃'}任务后重算压力曲线：${task.title}`);
  }

  function deleteTask(taskId: string) {
    const deletedTask = normalizedTasks.find((task) => task.id === taskId);
    const nextTasks = normalizedTasks.filter((task) => task.id !== taskId);
    setTasks(nextTasks);
    recalculateTaskDerivedPressureHistory(nextTasks, deletedTask ? `删除任务后重算压力曲线：${deletedTask.title}` : '删除任务后重算压力曲线');
  }


  function restoreTask(task: Task) {
    const now = new Date().toISOString();
    const nextTasks = normalizedTasks.map((item) => item.id === task.id ? { ...item, lifecycleStatus: 'active' as const, progress: item.progress >= 100 ? 0 : item.progress, taskProgress: (item.taskProgress ?? item.progress) >= 100 ? 0 : item.taskProgress, completedAt: undefined, abandonedAt: undefined, updatedAt: now } : item);
    setTasks(nextTasks);
    recalculateTaskDerivedPressureHistory(nextTasks, `恢复任务后重算压力曲线：${task.title}`);
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

  const taskFormOverlay = isFormOpen ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/20 px-4 py-6 backdrop-blur-sm">
      <section className="max-h-[calc(100vh-3rem)] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-2xl shadow-slate-300/60">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.22em] text-slate-400">项目表单</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{editingTask ? '编辑项目' : '新建项目'}</h2>
          </div>
          <button type="button" onClick={closeForm} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">
            关闭
          </button>
        </div>
        <TaskForm task={editingTask} onCancel={closeForm} onSubmit={handleSubmit} />
      </section>
    </div>
  ) : null;


  function saveGoal(input: GoalInput, goalId?: string) {
    const now = new Date().toISOString();
    if (goalId) {
      setGoals((currentGoals) => normalizeGoals(currentGoals).map((goal) => (goal.id === goalId ? { ...goal, ...normalizeGoal({ ...input, id: goalId, createdAt: goal.createdAt, updatedAt: now }) } : goal)));
      return;
    }
    setGoals((currentGoals) => [createGoal(input), ...normalizeGoals(currentGoals)]);
  }


  function deleteGoal(goalId: string) {
    setGoals((currentGoals) => normalizeGoals(currentGoals).filter((goal) => goal.id !== goalId));
    setTasks((currentTasks) => currentTasks.map((task) => task.linkedGoalIds?.includes(goalId) ? { ...task, linkedGoalIds: task.linkedGoalIds.filter((id) => id !== goalId), updatedAt: new Date().toISOString() } : task));
  }



  useEffect(() => {
    function syncPublicPath() {
      setPublicPath(window.location.pathname);
    }

    window.addEventListener('popstate', syncPublicPath);
    window.addEventListener('vd:routechange', syncPublicPath);
    return () => {
      window.removeEventListener('popstate', syncPublicPath);
      window.removeEventListener('vd:routechange', syncPublicPath);
    };
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new Event('vd:routechange'));
    setPublicPath(window.location.pathname);
  }

  const navigateHome = () => navigate('/');

  useEffect(() => {
    const legacyPath = legacyRouteRedirect(publicPath);
    if (legacyPath) {
      navigate(legacyPath);
      return;
    }
    if (publicPath === '/auth/callback') {
      if (!isAuthLoading) navigate(session ? '/app' : '/login');
      return;
    }
    if (isAuthenticatedPath(publicPath) && !isAuthLoading && !session) {
      navigate(`/login?next=${encodeURIComponent(`${publicPath}${window.location.search}`)}`);
      return;
    }
    if (publicPath === '/login' && session) {
      navigate(safeAuthenticatedNext(new URLSearchParams(window.location.search).get('next')));
    }
  }, [isAuthLoading, publicPath, session]);

  const taskModule = (
    <TaskPage
      tasks={normalizedTasks}
      activeTasks={activeTasks}
      onAddTask={() => setIsFormOpen(true)}
      onConfirmAITasks={addTaskDrafts}
      onAIArtifactGenerated={saveAIArtifact}
      onArchiveTask={archiveTask}
      onDeleteTask={deleteTask}
      onEditTask={startEditing}
    />
  );

  const profileModule = <ProfilePage profile={normalizedProfile} onProfileChange={setProfile} isEmailVerified={Boolean(session?.user.email_confirmed_at)} />;

  if (publicPath === '/privacy' || publicPath === '/privacy.html') {
    return <PrivacyPolicyPage onBack={navigateHome} />;
  }

  if (publicPath === '/terms') {
    return <TermsPage onBack={navigateHome} />;
  }

  if (publicPath === '/auth/callback') {
    return <main className="flex min-h-screen items-center justify-center bg-[#fbfbfa] px-6 text-center text-sm font-medium text-zinc-500">正在完成安全登录…</main>;
  }

  if (publicPath === '/login') {
    return <AuthPanel isConfigured={isSupabaseConfigured} isLoading={isAuthLoading} error={authError} status={authStatus} authDebugInfo={authDebugInfo} featureFlags={authFeatureFlags} onSignIn={(email, password) => { capturePreAuthGuestSource(); return signIn(email, password); }} onSignUp={(email, password) => { capturePreAuthGuestSource(); return signUp(email, password); }} onResendVerification={resendVerificationEmail} onVerifyEmailOtp={verifyEmailOtp} onOAuth={(provider) => { capturePreAuthGuestSource(); return signInWithOAuth(provider); }} onRequestPhoneOtp={(phone) => { capturePreAuthGuestSource(); return requestPhoneOtp(phone); }} onVerifyPhoneOtp={(phone, token) => { capturePreAuthGuestSource(); return verifyPhoneOtp(phone, token); }} phoneResendRemainingMs={phoneResendRemainingMs} emailResendRemainingMs={emailResendRemainingMs} />;
  }

  if (isAuthenticatedPath(publicPath) && !session) {
    return <main className="flex min-h-screen items-center justify-center bg-[#fbfbfa] px-6 text-center text-sm font-medium text-zinc-500">正在前往登录…</main>;
  }

  if (!isWorkspaceReady) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center text-sm font-medium text-slate-500">正在打开隔离工作区…</main>;
  }

  const appContent = publicPath === '/app'
    ? <HomePage recommendedTasks={recommendedTasks} recommendationComparison={homeRecommendationComparison} activeTasks={activeTasks} onOpenTasks={() => navigate('/app/tasks')} lifeState={lifeState} lifePlan={lifePlan} lifeEvents={lifeEvents} lifePreferences={lifePreferences} onRecordLifeEvent={recordLifeEvent} onUndoLifeEvent={undoLatestLifeEvent} lifeEventSyncStatus={lifeEventSyncStatus} />
    : publicPath === '/app/tasks'
      ? taskModule
      : publicPath === '/app/plan'
        ? <LifeMapPage goals={normalizedGoals} tasks={normalizedTasks} roadmaps={roadmaps} onSaveRoadmap={(roadmap) => setRoadmaps((current) => [roadmap, ...current])} onSaveGoal={saveGoal} onDeleteGoal={deleteGoal} onAddTasks={addTaskDrafts} onCompleteTask={(task) => archiveTask(task, 'completed')} onRoadmapGenerated={(artifact) => { saveAIArtifact(artifact); unlockAchievement('roadmap-generated'); }} />
        : publicPath === '/app/review'
          ? <LogPage tasks={normalizedTasks} goals={normalizedGoals} profile={normalizedProfile} pressure={pressure} pressureHistory={normalizedPressureHistory} achievements={normalizedAchievements} aiArtifacts={normalizedAIArtifacts} onRecalculatePressureHistory={() => recalculateTaskDerivedPressureHistory()} onRecalibrate={openRecalibration} onAIReportGenerated={(artifact) => { saveAIArtifact(artifact); unlockAchievement('ai-report-generated'); }} onDelete={deleteTask} onEdit={startEditing} onRestore={restoreTask} onReviewNoteChange={updateReviewNote} />
          : publicPath === '/settings'
            ? profileModule
            : publicPath === '/billing'
              ? <section className="max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6"><p className="text-xs font-semibold tracking-[.16em] text-zinc-400">ACCOUNT</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Subscription & billing</h1><p className="mt-3 text-sm leading-6 text-zinc-500">Billing is not enabled in this environment. Your account and workspace are unchanged.</p></section>
              : <section className="max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6"><p className="text-xs font-semibold tracking-[.16em] text-zinc-400">OPS</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Operate competing work.</h1><p className="mt-3 text-sm leading-6 text-zinc-500">Capacity, time, attention, energy, conflicts, and rolling replanning will arrive here as the OPS migration becomes available.</p></section>;

  return (
    <WorkspaceOwnerProvider owner={workspaceOwner}>
    <div className="min-h-screen bg-[#fafafa] text-zinc-900">
      {/* Temporary compatibility only; PR I replaces this with Capture-first onboarding. */}
      {!onboardingComplete ? <OnboardingFlow onComplete={completeOnboarding} /> : null}
      {taskFormOverlay}
      {isRecalibrationOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/15 px-4 backdrop-blur-sm">
          <section className="w-full max-w-lg rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-2xl shadow-slate-300/60">
            <p className="text-sm font-semibold tracking-[0.22em] text-slate-400">压力校准</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">此刻这组任务让你感觉有多大压力？</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">系统会读取当前进行中任务负载，并用你的主观感受重新计算个体压力映射系数。</p>
            <div className="mt-6 rounded-3xl bg-slate-50/90 p-5 ring-1 ring-white/80">
              <div className="flex items-end justify-between gap-4"><span className="text-sm font-medium text-slate-600">主观压力</span><span className="text-5xl font-semibold text-slate-950 tabular-nums">{recalibrationPressure}</span></div>
              <input type="range" min="0" max="100" value={recalibrationPressure} onChange={(event) => setRecalibrationPressure(clampPressure(Number(event.target.value)))} className="mt-5 w-full accent-slate-700" />
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-slate-800 transition-all duration-700 ease-out" style={{ width: `${Math.min(100, recalibrationPreview.rawPressure)}%` }} /></div>
              <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                <span className="rounded-full bg-white px-3 py-2">新系数 ×{recalibrationPreview.pressureRatio}</span>
                <span className="rounded-full bg-white px-3 py-2">预估压力 {recalibrationPreview.rawPressure}</span>
                <span className="rounded-full bg-white px-3 py-2">目标 {recalibrationPreview.referencePressure}</span>
              </div>
            </div>
            <p className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-700 ring-1 ring-sky-100">保存后会重算压力映射系数、刷新当前压力指数、记录新的压力曲线节点，并让推荐卡片显示新的校准压力权重。</p>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setIsRecalibrationOpen(false)} className="rounded-full px-5 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">取消</button><button type="button" onClick={submitRecalibration} className="rounded-full bg-white/85 px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50">保存校准</button></div>
          </section>
        </div>
      ) : null}
      {cloudToast ? (
        <div className="fixed left-1/2 top-5 z-[120] -translate-x-1/2 animate-soft-rise rounded-full border border-white/80 bg-slate-950/90 px-5 py-3 text-sm font-semibold text-white shadow-2xl shadow-slate-400/40 backdrop-blur" role="status">
          {cloudToast}
        </div>
      ) : null}
      {guestImportPreview ? <GuestImportPanel preview={guestImportPreview} onConfirm={confirmGuestImport} /> : null}
      <AchievementToast achievement={toastAchievement} />
      {welcomeBackMessage ? (
        <aside className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-100/45 px-4 py-6 backdrop-blur-md" role="status">
          <div className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/80 bg-white/88 p-7 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-sky-200/40 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-14 h-48 w-48 rounded-full bg-violet-200/35 blur-3xl" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold tracking-[0.22em] text-slate-400">欢迎回来</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{welcomeBackMessage.greeting}，{welcomeBackMessage.name}</h2>
              </div>
              <button type="button" onClick={() => setWelcomeBackMessage(undefined)} className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100" aria-label="关闭欢迎提示">关闭</button>
            </div>
            <div className="relative mt-5 space-y-3 text-sm leading-6 text-slate-600">
              <p className="text-lg font-semibold text-slate-800">欢迎回到 VD。</p>
              <p className="rounded-2xl bg-slate-50/80 px-4 py-3 ring-1 ring-white/80">当前时间：{welcomeBackMessage.currentTime}</p>
              <p className="rounded-2xl bg-white/75 px-4 py-3 font-semibold text-slate-700 ring-1 ring-white/80">{welcomeBackMessage.detail}</p>
            </div>
          </div>
        </aside>
      ) : null}

      <V2AppShell path={publicPath} onNavigate={navigate} onSignOut={() => { void signOut(); navigate('/'); }} onNotifications={() => setCloudToast('Notifications will appear here when they are ready.')}>
        {appContent}
      </V2AppShell>
    </div>
    </WorkspaceOwnerProvider>
  );
}

function App() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const syncPath = () => setPath(window.location.pathname);
    window.addEventListener('popstate', syncPath);
    window.addEventListener('vd:routechange', syncPath);
    return () => {
      window.removeEventListener('popstate', syncPath);
      window.removeEventListener('vd:routechange', syncPath);
    };
  }, []);

  function navigate(pathname: string) {
    window.history.pushState({}, '', pathname);
    window.dispatchEvent(new Event('vd:routechange'));
    setPath(window.location.pathname);
  }

  if (isPublicSurface(path)) return <PublicSite path={path} onNavigate={navigate} />;
  if (!isKnownAuthenticatedEntryPath(path)) return <PublicNotFound onNavigate={navigate} />;
  return <AuthenticatedApp />;
}

export default App;
