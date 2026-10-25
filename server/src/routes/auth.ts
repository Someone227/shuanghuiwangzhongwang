import { Router } from 'express';

import { requireAuth, currentUser } from '../auth/middleware.js';
import { signToken } from '../auth/token.js';
import {
  AuthError,
  createUser,
  findUserByUsername,
  normalizeUsername,
  toPublicUser,
  validatePassword,
  validateUsername,
  verifyLogin,
} from '../auth/users.js';

export const authRouter = Router();

interface CredentialsBody {
  username?: unknown;
  password?: unknown;
  displayName?: unknown;
}

function readCredentials(body: unknown): { username: string; password: string; displayName: string } {
  const raw = (body ?? {}) as CredentialsBody;
  return {
    username: typeof raw.username === 'string' ? raw.username : '',
    password: typeof raw.password === 'string' ? raw.password : '',
    displayName: typeof raw.displayName === 'string' ? raw.displayName.trim().slice(0, 24) : '',
  };
}

/** 注册：成功后直接登录（返回令牌） */
authRouter.post('/auth/register', (req, res) => {
  const { username, password, displayName } = readCredentials(req.body);
  if (findUserByUsername(username)) {
    res.status(409).json({ ok: false, error: '这个账号已经被注册了，换一个试试' });
    return;
  }
  const usernameError = validateUsername(username);
  if (usernameError) {
    res.status(400).json({ ok: false, error: usernameError });
    return;
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    res.status(400).json({ ok: false, error: passwordError });
    return;
  }
  try {
    const user = createUser({ username: normalizeUsername(username), password, displayName: displayName || username });
    res.status(201).json({ ok: true, data: { token: signToken(user.id), user: toPublicUser(user) } });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.status).json({ ok: false, error: err.message });
      return;
    }
    throw err;
  }
});

/** 登录：返回令牌 + 用户信息，任意电脑都可重复登录同一账号 */
authRouter.post('/auth/login', (req, res) => {
  const { username, password } = readCredentials(req.body);
  const user = verifyLogin(username, password);
  if (!user) {
    res.status(401).json({ ok: false, error: '账号或密码不正确' });
    return;
  }
  res.json({ ok: true, data: { token: signToken(user.id), user: toPublicUser(user) } });
});

/** 当前登录用户（前端启动时用它确认令牌是否还有效） */
authRouter.get('/auth/me', requireAuth, (_req, res) => {
  res.json({ ok: true, data: { user: currentUser(res) } });
});

/** 退出登录：令牌是无状态的，前端丢弃即可 */
authRouter.post('/auth/logout', (_req, res) => {
  res.json({ ok: true, data: { loggedOut: true } });
});
