import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/** 签名密钥文件，首次启动自动生成，已在 .gitignore 中排除，不会入库 */
const SECRET_FILE = path.join(REPO_ROOT, 'data', '.auth-secret');

let cachedSecret: string | null = null;

function loadSecret(): string {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (cachedSecret) return cachedSecret;
  if (existsSync(SECRET_FILE)) {
    const existing = readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing) {
      cachedSecret = existing;
      return existing;
    }
  }
  const secret = randomBytes(32).toString('hex');
  mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  writeFileSync(SECRET_FILE, secret, { encoding: 'utf8', mode: 0o600 });
  cachedSecret = secret;
  return secret;
}

export interface TokenPayload {
  userId: string;
  /** 过期时间（秒级 unix 时间戳） */
  exp: number;
}

/** 登录凭证有效期：7 天 */
export const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function sign(body: string): string {
  return createHmac('sha256', loadSecret()).update(body).digest('base64url');
}

/** 签发无状态令牌：payload.signature，服务端无需存储会话 */
export function signToken(userId: string, ttlSeconds = TOKEN_TTL_SECONDS, now = Date.now()): string {
  const payload: TokenPayload = {
    userId,
    exp: Math.floor(now / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/** 校验令牌签名与有效期，失败返回 null */
export function verifyToken(token: string, now = Date.now()): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const expected = sign(body);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<TokenPayload>;
    if (typeof payload.userId !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 <= now) return null;
    return { userId: payload.userId, exp: payload.exp };
  } catch {
    return null;
  }
}
