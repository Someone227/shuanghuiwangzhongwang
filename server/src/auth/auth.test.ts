import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import { hashPassword, verifyPassword } from './passwords.js';
import { signToken, verifyToken } from './token.js';
import {
  AuthError,
  DEMO_USERNAME,
  createUser,
  ensureDemoUser,
  findUserByUsername,
  normalizeUsername,
  toPublicUser,
  validatePassword,
  validateUsername,
  verifyLogin,
} from './users.js';

let dir = '';

before(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'nengshenma-auth-'));
  process.env.USERS_FILE = path.join(dir, 'users.json');
  process.env.AUTH_SECRET = 'test-secret-for-unit-tests';
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.USERS_FILE;
  delete process.env.AUTH_SECRET;
});

beforeEach(() => {
  rmSync(path.join(dir, 'users.json'), { force: true });
});

describe('密码哈希', () => {
  it('同一密码两次加盐结果不同，且都能校验通过', () => {
    const first = hashPassword('demo-password');
    const second = hashPassword('demo-password');
    assert.notEqual(first.salt, second.salt);
    assert.notEqual(first.hash, second.hash);
    assert.equal(verifyPassword('demo-password', first.salt, first.hash), true);
    assert.equal(verifyPassword('demo-password', second.salt, second.hash), true);
  });

  it('错误密码校验不通过', () => {
    const digest = hashPassword('correct-password');
    assert.equal(verifyPassword('wrong-password', digest.salt, digest.hash), false);
  });
});

describe('账号与密码规则', () => {
  it('账号必须为 3–20 位字母数字下划线短横线', () => {
    assert.equal(validateUsername('demo'), null);
    assert.equal(validateUsername('teacher_2026'), null);
    assert.equal(validateUsername('ab'), '账号需为 3–20 位字母、数字、下划线或短横线');
    assert.equal(validateUsername('中文账号'), '账号需为 3–20 位字母、数字、下划线或短横线');
    assert.equal(validateUsername('a'.repeat(21)), '账号需为 3–20 位字母、数字、下划线或短横线');
  });

  it('密码至少 6 位、最多 64 位', () => {
    assert.equal(validatePassword('123456'), null);
    assert.equal(validatePassword('12345'), '密码至少 6 位');
    assert.equal(validatePassword('a'.repeat(65)), '密码最多 64 位');
  });

  it('账号统一转小写，登录不区分大小写', () => {
    assert.equal(normalizeUsername('  Teacher_01 '), 'teacher_01');
  });
});

describe('注册与登录', () => {
  it('注册后能按账号找到，且不落明文密码', () => {
    const user = createUser({ username: 'Teacher_01', password: 'secret123', displayName: '张老师' });
    assert.equal(user.username, 'teacher_01');
    assert.notEqual(user.passwordHash, 'secret123');
    assert.ok(user.passwordHash.length > 32);
    assert.equal(findUserByUsername('teacher_01')?.id, user.id);
    assert.equal(verifyLogin('teacher_01', 'secret123')?.id, user.id);
    assert.equal(verifyLogin('teacher_01', 'wrong-password'), null);
    assert.equal(verifyLogin('nobody', 'secret123'), null);
  });

  it('返回给前端的用户信息不含密码摘要与盐', () => {
    const user = createUser({ username: 'parent01', password: 'secret123' });
    const publicUser = toPublicUser(user) as unknown as Record<string, unknown>;
    assert.equal(publicUser.username, 'parent01');
    assert.equal('passwordHash' in publicUser, false);
    assert.equal('salt' in publicUser, false);
  });

  it('重复注册同一账号会抛 409 错误', () => {
    createUser({ username: 'teach01', password: 'secret123' });
    assert.throws(
      () => createUser({ username: 'TEACH01', password: 'another123' }),
      (err: unknown) => err instanceof AuthError && err.status === 409,
    );
  });
});

describe('演示账号', () => {
  it('首次调用自动创建，再次调用复用同一个账号', () => {
    const first = ensureDemoUser('NengShenMa2026');
    assert.equal(first.created, true);
    assert.equal(first.user.username, DEMO_USERNAME);
    assert.equal(first.user.role, 'demo');
    assert.equal(verifyLogin(DEMO_USERNAME, 'NengShenMa2026')?.id, first.user.id);

    const second = ensureDemoUser('NengShenMa2026');
    assert.equal(second.created, false);
    assert.equal(second.user.id, first.user.id);
  });
});

describe('登录令牌', () => {
  it('签发的令牌能校验出对应用户', () => {
    const token = signToken('user-123');
    const payload = verifyToken(token);
    assert.equal(payload?.userId, 'user-123');
    assert.ok((payload?.exp ?? 0) > Math.floor(Date.now() / 1000));
  });

  it('被篡改或格式错误的令牌校验失败', () => {
    const token = signToken('user-123');
    const [body, signature] = token.split('.');
    assert.equal(verifyToken(`${body}x.${signature}`), null);
    assert.equal(verifyToken(`${body}.`), null);
    assert.equal(verifyToken('not-a-token'), null);
    assert.equal(verifyToken(''), null);
  });

  it('过期令牌校验失败', () => {
    const token = signToken('user-123', 60, Date.now() - 10 * 60 * 1000);
    assert.equal(verifyToken(token), null);
  });
});
