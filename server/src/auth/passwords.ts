import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** scrypt 输出长度（字节） */
const KEY_LENGTH = 64;

export interface PasswordDigest {
  /** 随机盐（hex） */
  salt: string;
  /** scrypt 摘要（hex） */
  hash: string;
}

/** 生成随机盐并计算密码摘要 */
export function hashPassword(password: string): PasswordDigest {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(password, salt, KEY_LENGTH).toString('hex') };
}

/** 用固定时长比较校验密码，避免明文比对与提前返回 */
export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHash, 'hex');
  } catch {
    return false;
  }
  if (expected.length !== candidate.length) return false;
  return timingSafeEqual(candidate, expected);
}
