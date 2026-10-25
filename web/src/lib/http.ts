/**
 * 薄薄的 fetch 封装：统一解析 { ok, data, error } 信封，并自动带上登录令牌。
 *
 * 这里只管「怎么发请求、怎么读结果」，不关心业务。
 */

const TOKEN_KEY = 'nengshenma:token';

/** 带 HTTP 状态码的接口错误，便于区分「没登录（401）」和「真的出错」 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* 隐私模式下存储不可用，忽略即可 */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 忽略 */
  }
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new Error('连不上后端服务，请确认已运行 pnpm dev（server 端口 8787）');
  }

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await res.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!res.ok || !payload || !payload.ok) {
    throw new ApiError(payload?.error ?? `请求失败（HTTP ${res.status}）`, res.status);
  }
  return payload.data as T;
}

/** 发送 JSON 请求体的快捷方法 */
export function sendJson<T>(path: string, body: unknown, method: 'POST' | 'PUT' | 'DELETE' = 'POST'): Promise<T> {
  return request<T>(path, { method, body: JSON.stringify(body) });
}
