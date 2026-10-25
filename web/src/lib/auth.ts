/**
 * 登录态与个人数据。
 *
 * 账号存在服务端（data/users.json），令牌无状态签名，所以同一个账号可以在
 * 多台电脑 / 多个浏览器里同时登录，各自拿到有效令牌。判定记录存服务端，
 * 换电脑登录后仍能看到。**填写的内容不保存**：判定页表单只存在页面内存里，
 * 草稿接口保留下来仅用于清理历史残留，避免旧数据留在浏览器或服务端。
 */
import { computed, ref } from 'vue';

import { ApiError, clearToken, getToken, request, sendJson, setToken } from './http';
import type { EvaluationSummary, Profile, Verdict } from './api';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: 'demo' | 'user';
  createdAt: string;
}

interface AuthPayload {
  token: string;
  user: AuthUser;
}

const USER_KEY = 'nengshenma:user';

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function cacheUser(user: AuthUser | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* 忽略 */
  }
}

/** 当前登录用户；刷新页面时先用本地缓存占位，再用 /auth/me 校验 */
export const currentUser = ref<AuthUser | null>(getToken() ? readCachedUser() : null);
export const isLoggedIn = computed(() => currentUser.value !== null);
/** 首次登录态校验是否完成（避免顶栏闪烁） */
export const authChecked = ref(false);

function applySession(payload: AuthPayload): AuthUser {
  setToken(payload.token);
  cacheUser(payload.user);
  currentUser.value = payload.user;
  return payload.user;
}

export function clearSession(): void {
  clearToken();
  cacheUser(null);
  currentUser.value = null;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const payload = await request<AuthPayload>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return applySession(payload);
}

export async function register(input: { username: string; password: string; displayName?: string }): Promise<AuthUser> {
  const payload = await request<AuthPayload>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return applySession(payload);
}

export async function logout(): Promise<void> {
  try {
    await sendJson('/api/auth/logout', {});
  } catch {
    /* 网络失败也要让本地退出，避免卡在登录态 */
  }
  clearSession();
}

let restoring: Promise<void> | null = null;

/** 用本地令牌向后端确认登录态；令牌失效（401）就清掉本地会话 */
export function restoreSession(): Promise<void> {
  if (restoring) return restoring;
  const token = getToken();
  if (!token) {
    authChecked.value = true;
    return Promise.resolve();
  }
  restoring = request<{ user: AuthUser }>('/api/auth/me')
    .then((data) => {
      currentUser.value = data.user;
      cacheUser(data.user);
    })
    .catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 401) clearSession();
    })
    .finally(() => {
      authChecked.value = true;
      restoring = null;
    });
  return restoring;
}

// ===== 个人数据：草稿与判定记录（都存服务端） =====

export interface RemoteDraft {
  profile: Profile;
  updatedAt: string;
}

export interface JudgementRecord {
  id: string;
  policyId: string;
  policyTitle: string;
  overall: Verdict;
  summary: EvaluationSummary;
  at: string;
}

export function fetchRemoteDraft(policyId: string): Promise<RemoteDraft | null> {
  return request<RemoteDraft | null>(`/api/me/drafts/${encodeURIComponent(policyId)}`);
}

export function saveRemoteDraft(policyId: string, profile: Profile): Promise<RemoteDraft> {
  return sendJson<RemoteDraft>(`/api/me/drafts/${encodeURIComponent(policyId)}`, { profile }, 'PUT');
}

/** 清掉服务端草稿（离开判定页时调用，个人情况不在服务端留存） */
export function clearRemoteDraft(policyId: string): Promise<{ cleared: boolean }> {
  return request<{ cleared: boolean }>(`/api/me/drafts/${encodeURIComponent(policyId)}`, { method: 'DELETE' });
}

/**
 * 关闭标签页 / 刷新时的清理：普通请求会被浏览器掐断，
 * 这里用 fetch keepalive 尽量把删除请求送出去。
 */
export function clearRemoteDraftOnUnload(policyId: string): void {
  const token = getToken();
  if (!token) return;
  try {
    void fetch(`/api/me/drafts/${encodeURIComponent(policyId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* 页面正在关闭，失败也不影响用户 */
  }
}

export function fetchRecords(): Promise<JudgementRecord[]> {
  return request<JudgementRecord[]>('/api/me/records');
}

export function saveRecord(input: {
  policyId: string;
  policyTitle: string;
  overall: Verdict;
  summary: EvaluationSummary;
}): Promise<JudgementRecord> {
  return sendJson<JudgementRecord>('/api/me/records', input);
}

export function clearRecords(): Promise<{ cleared: boolean }> {
  return request<{ cleared: boolean }>('/api/me/records', { method: 'DELETE' });
}
