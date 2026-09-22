import type { ActivityType, GoalInput, Importance, TaskInput } from '../../types/task.js';

export type CaptureState = 'idle' | 'capturing' | 'uploading' | 'interpreting' | 'review' | 'materializing' | 'completed' | 'error';
export type CaptureAssetStatus = 'ready' | 'metadata_only' | 'unsupported' | 'failed' | 'needs_reattach';
export type CaptureOwnerKey = 'guest' | `user:${string}`;

export interface CaptureAsset {
  id: string;
  kind: 'image' | 'document' | 'audio' | 'url';
  name: string;
  mimeType?: string;
  size?: number;
  durationSeconds?: number;
  storagePath?: string;
  status: CaptureAssetStatus;
  file?: File;
}

export interface CaptureInput {
  id: string;
  ownerKey: CaptureOwnerKey;
  text: string;
  links: string[];
  assets: CaptureAsset[];
}

export interface CaptureGoalDraft { id: string; title: string; targetDate?: string; category: ActivityType; priority: Importance; included: boolean; confidence?: number; }
export interface CaptureTaskDraft { id: string; title: string; description?: string; importance: Importance; deadline?: string; estimatedDuration?: number; category: ActivityType; goalDraftId?: string; dependencyDraftIds: string[]; included: boolean; confidence?: number; }
export interface CaptureCommitmentDraft { id: string; title: string; date?: string; included: boolean; confidence?: number; }
export interface CaptureContextDraft { id: string; text: string; confidence?: number; }
export interface CaptureAmbiguity { id: string; text: string; }
export interface CaptureInterpretation {
  goals: CaptureGoalDraft[];
  tasks: CaptureTaskDraft[];
  commitments: CaptureCommitmentDraft[];
  context: CaptureContextDraft[];
  ambiguities: CaptureAmbiguity[];
  notes: string[];
}

export interface CaptureMaterializationPlan {
  goals: Array<{ draftId: string; input: GoalInput }>;
  tasks: Array<{ draftId: string; input: TaskInput; dependencyDraftIds: string[] }>;
  skippedCommitments: CaptureCommitmentDraft[];
  duplicateWarnings: string[];
}
