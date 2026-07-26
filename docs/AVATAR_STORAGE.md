# 头像存储审查与修复

## 修复前的根因

`ProfilePage.handleAvatarChange` 使用 `FileReader.readAsDataURL(file)` 将完整图片转换成 Base64，并通过 `onProfileChange` 写入 `UserProfile.avatarDataUrl`。`App` 使用 `useLocalStorage(storageKeys.profile, ...)` 管理该对象；hook 随后调用 `saveValue`，最终在 `storage/schema.ts` 的 `localStorage.setItem(key, JSON.stringify(value))` 将大图片写入 `visualized-deadline.profile`。

该 key 当时实际包含昵称、用户名、身高、体重、身份、能力、长期目标、当前阶段，以及可能非常大的 `avatarDataUrl`。项目没有使用 Zustand persist。

## 修复后的边界

- 浏览器只用 object URL 临时预览；中心裁剪、压缩成 512×512 WebP 后直接上传 `avatars/{userId}/avatar.webp`。
- profile React 状态和 localStorage 仅保存 `avatarUrl`，不保存 Base64、Blob、File 或 storage path。
- Supabase `profiles.avatar_url` 和 `profiles.avatar_storage_path` 保存云端引用，旧 JSONB 内联头像由迁移清理。
- 读取旧 `visualized-deadline.profile` 时，仅移除以 `data:` 开头的 `avatar` / `avatarDataUrl`；不触碰 tasks 或其他 key。
- localStorage 配额错误会转成局部恢复通知，不再从 React effect 抛入全局 Error Boundary。
