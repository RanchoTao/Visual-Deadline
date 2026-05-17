import appIconUrl from '../../visualdeadline-banner.png';

const APP_NAME = 'Visual Deadline';
const SHORT_APP_NAME = 'VD';
const THEME_COLOR = '#f8fafc';
const BACKGROUND_COLOR = '#f8fafc';

let manifestObjectUrl: string | undefined;

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

function createManifestUrl(): string {
  if (manifestObjectUrl) return manifestObjectUrl;

  const manifest = {
    name: APP_NAME,
    short_name: SHORT_APP_NAME,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: appIconUrl, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: appIconUrl, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };

  manifestObjectUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
  return manifestObjectUrl;
}

export function configurePwaAssets(): void {
  upsertMeta('theme-color', THEME_COLOR);
  upsertMeta('mobile-web-app-capable', 'yes');
  upsertMeta('apple-mobile-web-app-capable', 'yes');
  upsertMeta('apple-mobile-web-app-title', APP_NAME);
  upsertMeta('apple-mobile-web-app-status-bar-style', 'default');
  upsertLink('icon', appIconUrl, { type: 'image/png' });
  upsertLink('shortcut icon', appIconUrl, { type: 'image/png' });
  upsertLink('apple-touch-icon', appIconUrl, { sizes: '180x180' });
  upsertLink('manifest', createManifestUrl());
}
