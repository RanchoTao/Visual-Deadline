import { supabase } from '../lib/supabaseClient';

export const AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const AVATAR_TARGET_BYTES = 500 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取图片，请选择其他文件。'));
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('浏览器无法压缩此图片。')), 'image/webp', quality));
}

export async function prepareAvatar(file: File): Promise<Blob> {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('头像仅支持 JPEG、PNG 或 WebP。');
  if (file.size > AVATAR_MAX_INPUT_BYTES) throw new Error('头像原文件不能超过 5 MB。');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const sx = (image.naturalWidth - side) / 2;
    const sy = (image.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法处理图片。');
    context.drawImage(image, sx, sy, side, side, 0, 0, 512, 512);
    let quality = 0.86;
    let output = await canvasBlob(canvas, quality);
    while (output.size > AVATAR_TARGET_BYTES && quality > 0.42) {
      quality -= 0.08;
      output = await canvasBlob(canvas, quality);
    }
    return output;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  const session = await supabase.auth.getSession();
  if (!session) throw new Error('请先登录后上传头像。');
  const blob = await prepareAvatar(file);
  const path = `${session.user.id}/avatar.webp`;
  await supabase.uploadStorageObject('avatars', path, blob, session, true);
  return { avatarUrl: `${supabase.getPublicStorageUrl('avatars', path)}?v=${Date.now()}` };
}
