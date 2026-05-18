export const branding = {
  organizationName: 'Flysoon Tech 飞升科技',
  productName: 'Visual Deadline',
  tagline: '可视：人生操作系统',
  version: '2.0.0',
  author: 'Rancho Tao',
  githubRepo: 'RanchoTao/Visualized-Deadline',
  githubUrl: 'https://github.com/RanchoTao/Visualized-Deadline',
  githubButtonLabel: 'GitHub',
} as const;

export const footerBranding = {
  brandName: branding.organizationName,
  productVersion: `${branding.productName} v${branding.version}`,
  authorCredit: `By ${branding.author}`,
  githubLabel: branding.githubButtonLabel,
} as const;
