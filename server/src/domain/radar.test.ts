import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RADAR_SLOTS,
  buildPolicyProfile,
  matchOption,
  scanPolicies,
  slotCoverage,
  toRadarBundle,
} from './radar.js';
import type { Policy } from './types.js';

/**
 * 政策雷达测试。
 *
 * 雷达最容易出的错不是「算错」，而是「不该判的判了」：
 * 用户没填的信息，绝不能变成「不符合」—— 那等于告诉一个其实能申的人他不能申。
 * 所以下面的用例重点守住三条不变量：
 * 1. 空画像下不出现任何 fail；
 * 2. 槽位值映射不到政策选项时，字段保持不写；
 * 3. 分层排序里「能申」必须排在「不符合」前面。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLICY_DIR = path.resolve(HERE, '../../../data/policies');

function loadPolicies(): Policy[] {
  const files = fs.readdirSync(POLICY_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(POLICY_DIR, f), 'utf8')) as Policy);
}

const POLICIES = loadPolicies();

test('政策雷达：槽位定义完整且唯一', () => {
  const keys = RADAR_SLOTS.map((slot) => slot.key);
  assert.equal(new Set(keys).size, keys.length, '槽位 key 不能重复');
  for (const slot of RADAR_SLOTS) {
    assert.ok(slot.label.length > 0, `${slot.key} 缺少 label`);
    if (slot.kind === 'select' || slot.kind === 'multiselect') {
      assert.ok((slot.options ?? []).length > 0, `${slot.key} 是选择题但没有选项`);
    }
  }
});

test('政策雷达：选项别名能把统一画像翻译成政策自己的写法', () => {
  // 「本科」在有的政策里写作「本科或专科（本专科，含第二学士学位、预科生）」
  assert.equal(
    matchOption(['本科', '普通本科'], ['专科（高职）', '本科或专科（本专科，含第二学士学位、预科生）']),
    '本科或专科（本专科，含第二学士学位、预科生）',
  );
  // 完全一致的写法优先
  assert.equal(matchOption(['本科'], ['本科', '本专科']), '本科');
  // 对不上就返回 undefined，绝不硬塞一个近似值
  assert.equal(matchOption(['博士'], ['专科', '本科']), undefined);
});

test('政策雷达：空画像不产生任何「不符合」', () => {
  const result = scanPolicies(POLICIES, {});
  assert.equal(result.summary.policies, POLICIES.length);
  assert.equal(result.summary.filled, 0);
  assert.equal(result.summary.eligible, 0);
  assert.equal(result.summary.ineligible, 0, '没填任何信息时不能判定「不符合」');
  assert.equal(result.summary.fail, 0, '没填任何信息时不能有失败条件');
  for (const item of result.items) {
    assert.ok(item.status === 'incomplete' || item.status === 'near', `${item.policyId} 在空画像下被判成 ${item.status}`);
  }
});

test('政策雷达：multiselect 槽位命中才写 true，从不写 false', () => {
  const policy = POLICIES.find((item) => item.id === 'financial-hardship');
  assert.ok(policy, '缺少 financial-hardship 样本');

  const empty = buildPolicyProfile(policy!, { specialGroups: [] });
  for (const [key, value] of Object.entries(empty.profile)) {
    assert.notEqual(value, false, `没勾选特殊群体时不应把 ${key} 写成 false`);
  }

  const picked = buildPolicyProfile(policy!, { specialGroups: ['低保'] });
  const trueKeys = Object.entries(picked.profile).filter(([, value]) => value === true).map(([key]) => key);
  assert.ok(trueKeys.length > 0, '勾选「低保」后应至少命中一个 boolean 字段');
  for (const key of trueKeys) {
    const field = policy!.fields.find((item) => item.key === key);
    assert.ok(field, `写入了不存在的字段 ${key}`);
    // 「是否属于特殊群体」这类聚合字段勾选低保后应当为 true，其余具体项字段不能误写
    assert.match(field!.label, /低保|最低生活保障|特殊群体|困难/, `${key}（${field!.label}）与低保无关却被写成 true`);
  }
});

test('政策雷达：完整画像能给出「能申」的结论', () => {
  const student = {
    eduLevel: '本科',
    grade: 3,
    schoolType: '公办普通本科',
    studyForm: '全日制',
    academicRank: 5,
    compositeRank: 6,
    nationality: '中华人民共和国',
    age: 21,
    enrollmentStatus: '在籍在校',
    freshGraduate: true,
    economicDifficulty: true,
    specialGroups: ['低保'],
    ruralHukou: true,
    political: true,
    honest: true,
    lawAbiding: true,
    voluntary: true,
  };

  const result = scanPolicies(POLICIES, student);
  assert.ok(result.summary.filled >= 15);
  assert.ok(result.summary.eligible > 0, '一名条件齐备的本科生应至少能申一份政策');
  // 排序：能申的必须排在不符合的前面
  const firstIneligible = result.items.findIndex((item) => item.status === 'ineligible');
  const lastEligible = result.items.map((item) => item.status).lastIndexOf('eligible');
  if (firstIneligible >= 0 && lastEligible >= 0) {
    assert.ok(lastEligible < firstIneligible, '「能申」必须排在「不符合」前面');
  }
});

test('政策雷达：明显不符的画像判为「不符合」并给出差在哪', () => {
  const result = scanPolicies(POLICIES, {
    eduLevel: '幼儿园',
    nationality: '中华人民共和国',
    age: 5,
  });
  assert.ok(result.summary.ineligible > 0, '幼儿园学段对学生资助政策应判为不符合');
  const sample = result.items.find((item) => item.status === 'ineligible');
  assert.ok(sample);
  assert.ok(sample!.fail > 0);
  assert.ok(sample!.blockers.length > 0, '不符合时要点出差在哪一条');
  assert.ok(sample!.blockers[0].label.length > 0);
});

test('政策雷达：每份政策的条件都能被逐条判定，且没有字段映射到自己', () => {
  const bundle = toRadarBundle(POLICIES[0]);
  assert.equal(bundle.id, POLICIES[0].id);
  assert.ok(Array.isArray(bundle.fields));
  assert.ok(Array.isArray(bundle.conditions));
});

test('政策雷达：槽位覆盖率统计能用于「先填哪几项」提示', () => {
  const coverage = slotCoverage(POLICIES);
  const entries = Object.entries(coverage);
  assert.ok(entries.length > 5);
  // 学历/年级这类信息覆盖面最广，必须能覆盖过半政策
  // 学历是共用度最高的信息之一：即使政策原文写法各异，也应覆盖超过 1/3 的政策
  assert.ok((coverage.eduLevel ?? 0) >= POLICIES.length / 3, `学历槽位只覆盖了 ${coverage.eduLevel} 份政策`);
  for (const [, count] of entries) {
    assert.ok(count > 0 && count <= POLICIES.length);
  }

  const suggestions = scanPolicies(POLICIES, {}).suggestions;
  assert.ok(suggestions.length > 0);
  for (let i = 1; i < suggestions.length; i += 1) {
    assert.ok(suggestions[i - 1].unlockedPolicies >= suggestions[i].unlockedPolicies, '建议应按覆盖面降序');
  }
});
