import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { FaGithub } from 'react-icons/fa6';
import { branding } from '../constants/branding';
import { stashPendingCaptureDraft, type CaptureDraft } from '../domain/public/captureDraft';
import { publicAccountTarget, publicCaptureTarget } from '../domain/public/publicRouteTargets';
import { supabase } from '../lib/supabaseClient';
import { PrivacyPolicyPage } from './PrivacyPolicyPage';
import { PublicHome, type PublicLocale } from './PublicHome';
import { TermsPage } from './TermsPage';

type PublicPage = 'docs' | 'pricing' | 'research' | 'security' | 'report-security' | 'transparency' | 'careers' | 'contact';

const pageForPath: Record<string, PublicPage> = {
  '/docs': 'docs', '/pricing': 'pricing', '/research': 'research', '/security': 'security', '/report-security': 'report-security', '/transparency': 'transparency', '/careers': 'careers', '/contact': 'contact',
};

const publicPaths = new Set(['/', '/privacy', '/privacy.html', '/terms', ...Object.keys(pageForPath)]);

const content: Record<PublicLocale, Record<PublicPage, { eyebrow: string; title: string; body: string[] }>> = {
  'zh-CN': {
    docs: { eyebrow: '产品', title: '文档', body: ['产品文档正在整理中。当前可从网页版开始使用 Visual Deadline。'] },
    pricing: { eyebrow: '产品', title: '定价', body: ['定价信息将在产品准备好时发布。当前页面不提供购买或订阅入口。'] },
    research: { eyebrow: 'Visual Deadline Research', title: '研究方向', body: ['我们关注规划、调度、执行系统、人机协作与自适应任务编排。', '此处将来会承载经过审阅的论文与报告；当前没有发布物可宣称。'] },
    security: { eyebrow: '法务与安全', title: '安全', body: ['我们将安全作为持续的产品工作，而不是未获得的认证声明。', '如发现潜在问题，请使用负责任披露渠道联系我们。'] },
    'report-security': { eyebrow: '法务与安全', title: '报告安全问题', body: ['请发送问题概述、复现步骤、受影响范围与可选的修复建议到联系邮箱。', '请勿在未加密邮件中发送密码、访问令牌或其他秘密。'] },
    transparency: { eyebrow: '法务与安全', title: '透明度', body: ['Visual Deadline 正在早期构建阶段。我们会清楚区分已上线功能、实验性功能与后续计划。', '我们不会把未完成的审计、认证或能力描述成已经实现。'] },
    careers: { eyebrow: '加入我们', title: '一起构建', body: ['Visual Deadline 正在早期构建阶段。', '如果你对执行系统、AI Agent、前端可视化或智能调度感兴趣，欢迎联系我们。'] },
    contact: { eyebrow: '加入我们', title: '联系与合作', body: ['欢迎就产品、研究或合作联系 Visual Deadline。', '请通过邮箱联系，并避免在普通邮件中发送秘密或敏感凭证。'] },
  },
  en: {
    docs: { eyebrow: 'PRODUCT', title: 'Documentation', body: ['Documentation is being prepared. You can start with the Visual Deadline web app today.'] },
    pricing: { eyebrow: 'PRODUCT', title: 'Pricing', body: ['Pricing will be published when the product is ready. This page does not offer a purchase or subscription flow.'] },
    research: { eyebrow: 'VISUAL DEADLINE RESEARCH', title: 'Research direction', body: ['We study planning, scheduling, execution systems, human-agent coordination, and adaptive task orchestration.', 'Reviewed papers and reports may appear here later; none are claimed today.'] },
    security: { eyebrow: 'LEGAL & SECURITY', title: 'Security', body: ['Security is ongoing product work, not an unearned certification claim.', 'If you find a potential issue, please use the responsible disclosure contact path.'] },
    'report-security': { eyebrow: 'LEGAL & SECURITY', title: 'Report a security issue', body: ['Include a summary, reproduction steps, impact, and an optional remediation idea in your report.', 'Do not send passwords, access tokens, or other secrets in unencrypted email.'] },
    transparency: { eyebrow: 'LEGAL & SECURITY', title: 'Transparency', body: ['Visual Deadline is early in its build. We distinguish clearly between shipped features, experiments, and future plans.', 'We do not describe unfinished audits, certifications, or capabilities as completed.'] },
    careers: { eyebrow: 'JOIN US', title: 'Build with us', body: ['Visual Deadline is in an early building stage.', 'If execution systems, AI agents, frontend visualization, or intelligent scheduling interest you, we would be glad to hear from you.'] },
    contact: { eyebrow: 'JOIN US', title: 'Contact & collaboration', body: ['Reach out to Visual Deadline about the product, research, or collaboration.', 'Please avoid putting secrets or sensitive credentials in ordinary email.'] },
  },
};

function initialLocale(): PublicLocale {
  try { const saved = window.localStorage.getItem('vd.locale'); if (saved === 'zh-CN' || saved === 'en') return saved; } catch { /* Preference is optional. */ }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

function LocaleToggle({ locale, onChange }: { locale: PublicLocale; onChange: (locale: PublicLocale) => void }) {
  return <span className="inline-flex rounded-full border border-zinc-200 bg-white/70 p-0.5" aria-label="Language"><button type="button" onClick={() => onChange('zh-CN')} aria-pressed={locale === 'zh-CN'} className={`rounded-full px-2 py-1 text-xs font-medium ${locale === 'zh-CN' ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}>中文</button><button type="button" onClick={() => onChange('en')} aria-pressed={locale === 'en'} className={`rounded-full px-2 py-1 text-xs font-medium ${locale === 'en' ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}>EN</button></span>;
}

const footerLinkTypography = 'whitespace-nowrap text-left text-sm font-normal leading-[1.75] tracking-normal text-zinc-500 transition-colors hover:text-zinc-950';
const footerHeadingTypography = 'text-sm font-semibold leading-[1.5] tracking-normal text-zinc-900';
const footerProductRow = 'inline-flex items-baseline gap-1.5 whitespace-nowrap';

function PublicFooter({ locale, onNavigate, onGetApp }: { locale: PublicLocale; onNavigate: (path: string) => void; onGetApp: () => void }) {
  const zh = locale === 'zh-CN';
  const link = (path: string, label: string) => <a href={path} onClick={(event) => { event.preventDefault(); onNavigate(path); }} className={`block ${footerLinkTypography}`}>{label}</a>;
  const mobileLabel = zh ? 'Visual Deadline 移动端' : 'Visual Deadline Mobile';
  const mobileStatus = zh ? '即将推出' : 'Coming Soon';
  return <footer className="relative mx-auto max-w-[1280px] bg-[#fbfaf8] px-5 pb-8 pt-[clamp(3.5rem,6vw,5.5rem)] sm:px-8"><div className="grid gap-x-9 gap-y-8 border-t border-zinc-200/80 pt-9 sm:grid-cols-2 lg:grid-cols-[1.65fr_1.18fr_.8fr_1.25fr_1fr]"><div><div className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-zinc-900"><img src="/logo.png" alt="" className="h-6 w-6 object-contain" />Visual Deadline</div><p className="mt-3 max-w-xs text-sm font-normal leading-[1.75] tracking-normal text-zinc-500">{zh ? '把想法变成下一步。' : 'Turn thought into the next step.'}</p><div className="mt-4 flex items-center gap-2"><a href={branding.githubUrl} target="_blank" rel="noreferrer" aria-label="GitHub" title="GitHub" className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800"><FaGithub className="h-3.5 w-3.5" /></a><a href="mailto:RanchoTao@gmail.com" aria-label="Email" title="Email" className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800"><Mail className="h-3.5 w-3.5" /></a></div></div><div><h2 className={footerHeadingTypography}>{zh ? '产品' : 'PRODUCT'}</h2><div className="mt-3">{link('/', zh ? 'Visual Deadline 网页版' : 'Visual Deadline web')}<div className={footerProductRow}><button type="button" onClick={onGetApp} className={`border-0 bg-transparent p-0 ${footerLinkTypography}`}>{mobileLabel}</button><span className="text-xs font-normal leading-[1.5] tracking-normal text-zinc-400">{mobileStatus}</span></div>{link('/docs', zh ? '文档' : 'Docs')}{link('/pricing', zh ? '定价' : 'Pricing')}</div></div><div><h2 className={footerHeadingTypography}>{zh ? '研究' : 'RESEARCH'}</h2><div className="mt-3">{link('/research', zh ? '研究方向' : 'Research')}</div></div><div><h2 className={footerHeadingTypography}>{zh ? '法务与安全' : 'LEGAL & SECURITY'}</h2><div className="mt-3">{link('/privacy', zh ? '隐私政策' : 'Privacy')}{link('/terms', zh ? '使用条款' : 'Terms')}{link('/security', zh ? '安全' : 'Security')}{link('/report-security', zh ? '报告安全问题' : 'Report security issue')}{link('/transparency', zh ? '透明度' : 'Transparency')}</div></div><div><h2 className={footerHeadingTypography}>{zh ? '加入我们' : 'JOIN US'}</h2><div className="mt-3">{link('/careers', zh ? '加入我们' : 'Careers')}{link('/contact', zh ? '联系与合作' : 'Contact')}</div></div></div><div className="mt-10 border-t border-zinc-200/80 pt-5 text-xs font-normal text-zinc-400">© {new Date().getFullYear()} Visual Deadline</div></footer>;
}

function PublicHeader({ locale, onLocaleChange, onNavigate, isAuthenticated }: { locale: PublicLocale; onLocaleChange: (locale: PublicLocale) => void; onNavigate: (path: string) => void; isAuthenticated: boolean }) {
  const zh = locale === 'zh-CN';
  return <header className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12"><button type="button" onClick={() => onNavigate('/')} className="flex items-center gap-2.5 text-left text-lg font-semibold tracking-tight"><img src="/logo.png" alt="Visual Deadline" className="h-8 w-8 object-contain" />Visual Deadline</button><div className="flex items-center gap-4"><LocaleToggle locale={locale} onChange={onLocaleChange} /><button type="button" onClick={() => onNavigate(publicAccountTarget(isAuthenticated))} className="text-sm font-medium hover:text-[#c43b35]">{isAuthenticated ? (zh ? '进入 VD' : 'Enter VD') : (zh ? '登录' : 'Log in')}</button></div></header>;
}

export function PublicNotFound({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [locale, setLocale] = useState<PublicLocale>(initialLocale);
  const zh = locale === 'zh-CN';
  return <main className="min-h-screen bg-[#fbfaf8] text-zinc-900"><PublicHeader locale={locale} onLocaleChange={setLocale} onNavigate={onNavigate} isAuthenticated={false} /><section className="mx-auto flex min-h-[55vh] max-w-3xl flex-col items-start justify-center px-5 py-20 sm:px-8"><p className="text-xs font-semibold tracking-[.16em] text-zinc-400">404</p><h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] text-zinc-950">{zh ? '页面不存在' : 'Page not found'}</h1><p className="mt-4 text-base leading-8 text-zinc-600">{zh ? '这个地址没有对应的 Visual Deadline 页面。' : 'This address does not match a Visual Deadline page.'}</p><button type="button" onClick={() => onNavigate('/')} className="mt-8 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">{zh ? '返回首页' : 'Back home'}</button></section></main>;
}

export function PublicSite({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const [locale, setLocale] = useState<PublicLocale>(initialLocale);
  const [showMobileNotice, setShowMobileNotice] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  useEffect(() => { try { window.localStorage.setItem('vd.locale', locale); } catch { /* Preference is optional. */ } }, [locale]);
  useEffect(() => {
    let isMounted = true;
    if (!supabase.isConfigured) return () => { isMounted = false; };
    void supabase.auth.getSession().then((session) => { if (isMounted) setIsAuthenticated(Boolean(session)); }).catch(() => { if (isMounted) setIsAuthenticated(false); });
    return () => { isMounted = false; };
  }, []);
  const page = pageForPath[path];
  const submit = (draft: CaptureDraft) => { stashPendingCaptureDraft(draft); onNavigate(publicCaptureTarget(isAuthenticated)); };
  const mobileNotice = showMobileNotice ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/20 p-5 backdrop-blur-sm"><section className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-semibold">{locale === 'zh-CN' ? '移动端即将推出' : 'Mobile is coming soon'}</h2><p className="mt-2 text-sm leading-6 text-zinc-500">{locale === 'zh-CN' ? '目前可以使用 Visual Deadline 网页版。' : 'Visual Deadline is currently available on the web.'}</p><button type="button" onClick={() => setShowMobileNotice(false)} className="mt-5 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white">{locale === 'zh-CN' ? '知道了' : 'Got it'}</button></section></div> : null;
  if (path === '/privacy' || path === '/privacy.html') return <PrivacyPolicyPage onBack={() => onNavigate('/')} />;
  if (path === '/terms') return <TermsPage onBack={() => onNavigate('/')} />;
  if (!page) return <><PublicHome locale={locale} onLocaleChange={setLocale} isAuthenticated={isAuthenticated} onLogin={() => onNavigate(publicAccountTarget(isAuthenticated))} onGetApp={() => setShowMobileNotice(true)} onSubmit={submit} /><PublicFooter locale={locale} onNavigate={onNavigate} onGetApp={() => setShowMobileNotice(true)} />{mobileNotice}</>;
  const text = content[locale][page];
  return <main className="min-h-screen bg-[#fbfaf8] text-zinc-900"><PublicHeader locale={locale} onLocaleChange={setLocale} onNavigate={onNavigate} isAuthenticated={isAuthenticated} /><article className="mx-auto min-h-[50vh] max-w-3xl px-5 py-20 sm:px-8"><p className="text-xs font-semibold tracking-[.16em] text-zinc-400">{text.eyebrow}</p><h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] text-zinc-950">{text.title}</h1><div className="mt-8 space-y-4 text-base leading-8 text-zinc-600">{text.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>{page === 'contact' || page === 'report-security' ? <a href="mailto:RanchoTao@gmail.com" className="mt-8 inline-flex rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">RanchoTao@gmail.com</a> : null}</article><PublicFooter locale={locale} onNavigate={onNavigate} onGetApp={() => setShowMobileNotice(true)} />{mobileNotice}</main>;
}

export function isPublicSurface(path: string): boolean { return publicPaths.has(path); }
