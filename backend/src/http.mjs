export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function badInput(message) { return new HttpError(400, 'bad_input', message); }
export function notFound() { return new HttpError(404, 'not_found', '找不到這個遊戲，或遊戲已過期。'); }
export function conflict(message) { return new HttpError(409, 'conflict', message); }
export function json(data, headers) { return Response.json(data, { headers }); }

export async function readJson(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    throw badInput('需要 JSON 資料。');
  }
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let content = '';
  let size = 0;
  if (!reader) throw badInput('需要 JSON 資料。');
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      throw new HttpError(413, 'too_large', '請求內容太大。');
    }
    content += decoder.decode(value, { stream: true });
  }
  try {
    const data = JSON.parse(content + decoder.decode());
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {
    // Send the same response for malformed JSON and an unexpected top-level type.
  }
  throw badInput('無法讀取 JSON 資料。');
}

export function randomString(alphabet, length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

export function sessionToken() {
  return randomString('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', 32);
}

export async function hashToken(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

export function bearer(request) {
  const match = /^Bearer ([A-Za-z0-9_-]{32})$/.exec(request.headers.get('Authorization') ?? '');
  if (!match) throw new HttpError(401, 'unauthorized', '請重新開啟你的遊戲。');
  return match[1];
}

export function checkVersion(body, version) {
  if (!Number.isSafeInteger(body.version)) throw badInput('缺少棋局版本。');
  if (body.version !== version) throw conflict('棋局已更新，請再試一次。');
}
