const MAX_FILE_SIZE = 20 * 1024 * 1024;
const BUCKET = 'intake-assets';
const MIME_KINDS = new Map([
  ['image/jpeg', 'image'], ['image/png', 'image'], ['image/gif', 'image'], ['image/webp', 'image'],
  ['application/pdf', 'document'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
  ['text/plain', 'document'], ['text/markdown', 'document'], ['text/csv', 'document'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'document'],
  ['audio/webm', 'audio'], ['audio/ogg', 'audio'], ['audio/mp4', 'audio'], ['audio/mpeg', 'audio'],
]);

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function env(...names) {
  for (const name of names) if (process.env[name]) return process.env[name];
  return '';
}

async function getUser(url, anonKey, token) {
  const result = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
  return result.ok ? result.json() : null;
}

function parseRequest(body, userId) {
  if (!body || typeof body !== 'object') throw new Error('请求体必须是 JSON 对象。');
  const intakeId = typeof body.intakeId === 'string' && /^[0-9a-f-]{36}$/i.test(body.intakeId) ? body.intakeId : null;
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 20_000) : '';
  if (!intakeId || !Array.isArray(body.assets) || body.assets.length > 12) throw new Error('intakeId 或 assets 无效。');
  const assets = body.assets.map((asset) => {
    if (!asset || typeof asset !== 'object') throw new Error('附件结构无效。');
    const expectedKind = MIME_KINDS.get(asset.mimeType);
    if (!expectedKind || expectedKind !== asset.kind) throw new Error(`不支持附件类型：${asset.mimeType || 'unknown'}`);
    if (!Number.isInteger(asset.size) || asset.size <= 0 || asset.size > MAX_FILE_SIZE) throw new Error('附件大小无效。');
    if (typeof asset.fileName !== 'string' || !asset.fileName.trim() || asset.fileName.length > 255) throw new Error('附件名称无效。');
    const prefix = `${userId}/${intakeId}/`;
    if (typeof asset.storagePath !== 'string' || !asset.storagePath.startsWith(prefix) || asset.storagePath.includes('..')) throw new Error('附件不属于当前用户或当前录入。');
    return { storagePath: asset.storagePath, kind: asset.kind, mimeType: asset.mimeType, fileName: asset.fileName, size: asset.size };
  });
  if (!text && !assets.length) throw new Error('请输入文本或添加附件。');
  return { intakeId, text, assets };
}

async function verifyObject(url, anonKey, token, asset) {
  const path = asset.storagePath.split('/').map(encodeURIComponent).join('/');
  const result = await fetch(`${url}/storage/v1/object/info/${BUCKET}/${path}`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
  if (!result.ok) throw new Error(`找不到已上传附件：${asset.fileName}`);
  const metadata = await result.json();
  const actualSize = Number(metadata.metadata?.size ?? metadata.size);
  const actualType = metadata.metadata?.mimetype ?? metadata.mimetype;
  if (actualSize !== asset.size || actualType !== asset.mimeType) throw new Error(`附件元数据不匹配：${asset.fileName}`);
}

async function insert(url, anonKey, token, table, rows) {
  const result = await fetch(`${url}/rest/v1/${table}`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
  if (!result.ok) throw new Error(`保存 ${table} 失败：${await result.text()}`);
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { ok: false, error: '仅支持 POST。' });
  try {
    const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '');
    const anonKey = env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
    const token = (request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!url || !anonKey) return send(response, 500, { ok: false, error: '服务端 Supabase 未配置。' });
    const user = token && await getUser(url, anonKey, token);
    if (!user?.id) return send(response, 401, { ok: false, error: '登录状态无效或已过期。' });
    const input = parseRequest(request.body, user.id);
    await Promise.all(input.assets.map((asset) => verifyObject(url, anonKey, token, asset)));
    await insert(url, anonKey, token, 'intake_messages', [{ id: input.intakeId, user_id: user.id, role: 'user', text_content: input.text, status: 'processing' }]);
    if (input.assets.length) await insert(url, anonKey, token, 'intake_assets', input.assets.map((asset) => ({ id: crypto.randomUUID(), intake_message_id: input.intakeId, user_id: user.id, storage_bucket: BUCKET, storage_path: asset.storagePath, kind: asset.kind, mime_type: asset.mimeType, file_name: asset.fileName, size_bytes: asset.size, status: 'uploaded' })));
    return send(response, 202, { ok: true, intakeId: input.intakeId, status: 'processing' });
  } catch (error) {
    return send(response, 400, { ok: false, error: error instanceof Error ? error.message : '录入请求无效。' });
  }
}
