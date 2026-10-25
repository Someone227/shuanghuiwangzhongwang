import type { NextFunction, Request, Response } from 'express';

import { verifyToken } from './token.js';
import { findUserById, toPublicUser } from './users.js';
import type { PublicUser } from './users.js';

/** 从 Authorization: Bearer <token> 中取令牌 */
export function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/** 需要登录的接口：解析令牌 -> 挂到 res.locals.user */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = readBearerToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ ok: false, error: '登录已过期，请重新登录' });
    return;
  }
  const user = findUserById(payload.userId);
  if (!user) {
    res.status(401).json({ ok: false, error: '账号不存在，请重新登录' });
    return;
  }
  res.locals.user = toPublicUser(user) satisfies PublicUser;
  next();
}

/** 读取 requireAuth 挂上的用户 */
export function currentUser(res: Response): PublicUser {
  return res.locals.user as PublicUser;
}
