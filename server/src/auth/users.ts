import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashPassword, verifyPassword } from './passwords.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** server/src/auth -> 仓库根目录 */
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

export type UserRole = 'demo' | 'user';

export interface StoredUser {
  id: string;
  /** 小写规范化后的账号名，全局唯一 */
  username: string;
  displayName: string;
  salt: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

/** 可以安全返回给前端的用户信息（不含密码摘要与盐） */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

interface UsersFile {
  version: 1;
  users: StoredUser[];
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** 允许测试用环境变量指向临时文件 */
function usersFile(): string {
  return process.env.USERS_FILE ?? path.join(REPO_ROOT, 'data', 'users.json');
}

function readUsers(): StoredUser[] {
  const file = usersFile();
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<UsersFile>;
    return Array.isArray(parsed.users) ? parsed.users : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]): void {
  const file = usersFile();
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ version: 1, users } satisfies UsersFile, null, 2), 'utf8');
  // rename 是原子操作，避免写一半被读到
  renameSync(tmp, file);
}

export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;
export const MIN_PASSWORD_LENGTH = 6;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  if (!USERNAME_PATTERN.test(raw.trim())) {
    return '账号需为 3–20 位字母、数字、下划线或短横线';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `密码至少 ${MIN_PASSWORD_LENGTH} 位`;
  if (password.length > 64) return '密码最多 64 位';
  return null;
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export function listUsers(): StoredUser[] {
  return readUsers();
}

export function findUserByUsername(rawUsername: string): StoredUser | null {
  const username = normalizeUsername(rawUsername);
  return readUsers().find((user) => user.username === username) ?? null;
}

export function findUserById(id: string): StoredUser | null {
  return readUsers().find((user) => user.id === id) ?? null;
}

export interface CreateUserInput {
  username: string;
  password: string;
  displayName?: string;
  role?: UserRole;
}

/** 创建用户；账号已存在时抛 AuthError(409) */
export function createUser(input: CreateUserInput): StoredUser {
  const usernameError = validateUsername(input.username);
  if (usernameError) throw new AuthError(usernameError);
  const passwordError = validatePassword(input.password);
  if (passwordError) throw new AuthError(passwordError);

  const username = normalizeUsername(input.username);
  const users = readUsers();
  if (users.some((user) => user.username === username)) {
    throw new AuthError('这个账号已经被注册了，换一个试试', 409);
  }

  const { salt, hash } = hashPassword(input.password);
  const user: StoredUser = {
    id: randomUUID(),
    username,
    displayName: (input.displayName ?? '').trim() || username,
    salt,
    passwordHash: hash,
    role: input.role ?? 'user',
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  return user;
}

/** 账号密码校验；任一不匹配都返回 null，避免暴露账号是否存在 */
export function verifyLogin(rawUsername: string, password: string): StoredUser | null {
  const user = findUserByUsername(rawUsername);
  if (!user) return null;
  return verifyPassword(password, user.salt, user.passwordHash) ? user : null;
}

export const DEMO_USERNAME = 'demo';
export const DEMO_DISPLAY_NAME = '演示账号';

/**
 * 保证演示账号存在（幂等）。
 * 演示账号用于评委 / 老师在不同电脑上登录查验，密码写在 README 里公开。
 */
export function ensureDemoUser(password: string): { created: boolean; user: StoredUser } {
  const existing = findUserByUsername(DEMO_USERNAME);
  if (existing) return { created: false, user: existing };
  const user = createUser({
    username: DEMO_USERNAME,
    password,
    displayName: DEMO_DISPLAY_NAME,
    role: 'demo',
  });
  return { created: true, user };
}
