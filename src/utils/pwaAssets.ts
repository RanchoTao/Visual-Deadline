const APP_NAME = 'Visual Deadline';
const THEME_COLOR = '#f8fafc';
const LOGO_PATH = '/assets/images/logo.png';
const MANIFEST_PATH = '/site.webmanifest';

function upsertMeta(name: string, content: string): void {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function upsertLink(rel: string, href: string, attributes: Record<string, string> = {}): void {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
  Object.entries(attributes).forEach(([key, value]) => link.setAttribute(key, value));
}

export function configurePwaAssets(): void {
  upsertMeta('theme-color', THEME_COLOR);
  upsertMeta('mobile-web-app-capable', 'yes');
  upsertMeta('apple-mobile-web-app-capable', 'yes');
  upsertMeta('apple-mobile-web-app-title', APP_NAME);
  upsertMeta('apple-mobile-web-app-status-bar-style', 'default');
  upsertLink('icon', LOGO_PATH, { type: 'image/png' });
  upsertLink('shortcut icon', LOGO_PATH, { type: 'image/png' });
  upsertLink('apple-touch-icon', LOGO_PATH, { sizes: '180x180' });
  upsertLink('manifest', MANIFEST_PATH);
}
