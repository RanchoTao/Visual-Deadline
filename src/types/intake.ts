export type IntakeAssetStatus = 'queued' | 'uploading' | 'uploaded' | 'processing' | 'ready' | 'error';

export type IntakeAssetKind = 'image' | 'document' | 'audio';

export interface IntakeAsset {
  id: string;
  intakeId: string;
  kind: IntakeAssetKind;
  fileName: string;
  mimeType: string;
  size: number;
  status: IntakeAssetStatus;
  storagePath?: string;
  previewUrl?: string;
  progress?: number;
  error?: string;
  file?: File;
}

export interface IntakeAssetReference {
  storagePath: string;
  kind: IntakeAssetKind;
  mimeType: string;
  fileName: string;
  size: number;
}

export interface MultimodalIntake {
  intakeId: string;
  text: string;
  assets: IntakeAssetReference[];
}

export interface TaskDraft {
  title: string;
  description?: string;
  projectId?: string;
  dueAt?: string;
  importance: number;
  estimatedMinutes?: number;
  subtasks: string[];
  sourceRefs: string[];
  confidence: number;
  ambiguities: string[];
}
