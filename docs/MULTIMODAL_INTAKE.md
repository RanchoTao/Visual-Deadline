# 多模态任务录入实施说明

## 审查结论

- 当前应用是 Vite + React + TypeScript，而不是 Next.js；API 使用 Vercel 风格的 `api/*.js` 函数。
- 原入口是 `AITaskCommandBar` 的单一 textarea。已有流程先解析为 `TaskInput[]`，再由用户点击“确认新增”调用上层回调，因此不会直接写入任务。
- 正式任务字段以 `src/types/task.ts` 的 `Task` / `TaskInput` 为准；云端 `tasks` 表保存该结构的 JSONB，本迁移不修改它。
- 项目自带轻量 Supabase REST/Auth 客户端，因而在其上补充 Storage object 上传/删除方法，而不引入第二套客户端。

## 文件方案与阶段

1. Composer 与上传：`MultimodalComposer.tsx`、`types/intake.ts`、`services/intakeStorage.ts`，以及 Supabase 客户端的 Storage 方法。
2. 服务端接收与处理边界：`api/intake.js` 验证会话、路径所有权、MIME、大小及真实 Storage metadata；文件二进制不经过 API。
3. Provider/Compiler：`services/aiProvider.ts` 集中定义图片、文档、语音和编译能力。具体异步提取器可以在 Worker 中实现，不散落进 UI。
4. 草稿确认：保留既有确认面板；只有确认操作继续调用原 `onConfirmTasks`，`/api/intake` 只写 intake 表。

## 数据库迁移

迁移新增私有 `intake-assets` bucket、`intake_messages`、`intake_assets`、`task_drafts` 与按 `auth.uid()` 隔离的 RLS。它是增量迁移，不运行根目录会删除既有表的重建脚本，也不改变正式 `tasks` 表。部署时按时间戳顺序运行 `supabase/migrations` 中的 SQL。
