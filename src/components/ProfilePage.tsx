import type { ChangeEvent } from 'react';
import type { UserProfile } from '../types/task';
import { DataSafetyPanel } from './DataSafetyPanel';
import { DeveloperToolsPanel } from './DeveloperToolsPanel';

interface ProfilePageProps {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
}

const profileFields: { key: keyof UserProfile; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: 'nickname', label: '昵称', placeholder: '你希望 LifeOS 如何称呼你' },
  { key: 'height', label: '身高', placeholder: '例如：175 cm' },
  { key: 'weight', label: '体重', placeholder: '例如：68 kg' },
  { key: 'identity', label: '身份', placeholder: '例如：学生 / 研究者 / 创作者' },
  { key: 'skills', label: '能力', placeholder: '写下你正在积累的能力', multiline: true },
  { key: 'longTermGoals', label: '长期目标', placeholder: '写下长期目标，不需要完美', multiline: true },
  { key: 'currentStage', label: '当前阶段', placeholder: '描述当前人生阶段与主要节奏', multiline: true },
];

const systemItems = [
  { title: '本地模式', description: '当前数据保存在本机浏览器；未来云同步会作为可选能力。' },
  { title: '隐私说明', description: '隐私政策与数据边界预留入口，当前版本不上传个人数据。' },
  { title: '未来同步', description: '为账号、认证和多设备同步保留结构，但不启用后端。' },
];

export function ProfilePage({ profile, onProfileChange }: ProfilePageProps) {
  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') onProfileChange({ ...profile, avatarDataUrl: reader.result });
    });
    reader.readAsDataURL(file);
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-[2rem] bg-slate-100 text-4xl font-semibold text-slate-400 shadow-inner ring-1 ring-white/80">
          {profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="个人头像" className="h-full w-full object-cover" /> : (profile.nickname || '我').slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">我 · 系统设置</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">我</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">个人资料、系统状态与数据安全都放在这里。当前信息只保存在当前浏览器的 VD 存储层中。</p>
          <label className="mt-4 inline-flex cursor-pointer rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">
            选择头像
            <input type="file" accept="image/*" onChange={handleAvatarChange} className="sr-only" />
          </label>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {profileFields.map((field) => (
          <label key={field.key} className={field.multiline ? 'md:col-span-2' : undefined}>
            <span className="text-sm font-medium text-slate-600">{field.label}</span>
            {field.multiline ? (
              <textarea
                value={profile[field.key] ?? ''}
                onChange={(event) => onProfileChange({ ...profile, [field.key]: event.target.value })}
                className="mt-2 min-h-28 w-full rounded-3xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70"
                placeholder={field.placeholder}
              />
            ) : (
              <input
                value={profile[field.key] ?? ''}
                onChange={(event) => onProfileChange({ ...profile, [field.key]: event.target.value })}
                className="mt-2 w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm outline-none transition focus:border-sky-200 focus:ring-4 focus:ring-sky-100/70"
                placeholder={field.placeholder}
              />
            )}
          </label>
        ))}
      </div>
      </div>

      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
        <p className="text-sm font-semibold text-slate-500">系统与隐私</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">产品化准备</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {systemItems.map((item) => (
            <article key={item.title} className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80">
              <h3 className="text-sm font-semibold text-slate-800">{item.title}</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">{item.description}</p>
            </article>
          ))}
        </div>
        <p className="mt-4 rounded-2xl bg-white/75 px-4 py-3 text-xs leading-5 text-slate-500 ring-1 ring-white/80">应用版本 v0.9 基础版 · 网页优先 · 渐进式应用布局预留</p>
      </section>

      <DataSafetyPanel />
      <DeveloperToolsPanel />
    </section>
  );
}
