import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Policy } from './types.js';

/**
 * 选项文案数据契约测试。
 *
 * 选项是用户唯一能点的地方：政策术语翻译成口语后，条件里的 value 必须跟着一起改，
 * 否则用户选了新选项、判定却拿旧值比较，会全部落到「待补充」。
 * 这里守住两条：
 *   - 每个条件引用的选项取值，都真实存在于对应字段的 options 里
 *   - 同一字段的选项不重复（重复会让下拉里出现两个一样的选项）
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLICY_DIR = path.resolve(HERE, '../../../data/policies');

function loadPolicies(): Policy[] {
  const files = fs.readdirSync(POLICY_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(POLICY_DIR, f), 'utf8')) as Policy);
}

const policies = loadPolicies();

test('选项契约：条件引用的选项取值都存在于字段 options 中', () => {
  const broken: string[] = [];
  for (const policy of policies) {
    const fieldByKey = new Map((policy.fields ?? []).map((field) => [field.key, field]));
    for (const group of policy.conditions ?? []) {
      for (const condition of group.conditions ?? []) {
        const field = fieldByKey.get(condition.field);
        if (!field || field.type !== 'select' || !Array.isArray(field.options)) continue;
        const values = Array.isArray(condition.value) ? condition.value : [condition.value];
        for (const value of values) {
          if (typeof value !== 'string') continue;
          if (!field.options.includes(value)) {
            broken.push(`${policy.id} / ${condition.field}：条件值「${value}」不在选项里（${field.options.join('、')}）`);
          }
        }
      }
    }
  }
  assert.deepEqual(broken, [], `有 ${broken.length} 处条件值对不上选项：\n${broken.slice(0, 8).join('\n')}`);
});

test('选项契约：同一字段里不出现重复选项', () => {
  const duplicated: string[] = [];
  for (const policy of policies) {
    for (const field of policy.fields ?? []) {
      if (field.type !== 'select' || !Array.isArray(field.options)) continue;
      const seen = new Set<string>();
      for (const option of field.options) {
        if (seen.has(option)) duplicated.push(`${policy.id} / ${field.key}：重复选项「${option}」`);
        seen.add(option);
      }
    }
  }
  assert.deepEqual(duplicated, [], `有 ${duplicated.length} 处重复选项：\n${duplicated.slice(0, 8).join('\n')}`);
});

test('选项契约：专业术语已补口语说明（抽查高频选项）', () => {
  const allOptions = new Set<string>();
  for (const policy of policies) {
    for (const field of policy.fields ?? []) {
      if (field.type === 'select' && Array.isArray(field.options)) field.options.forEach((o) => allOptions.add(o));
    }
  }
  // 这些是改过的难懂术语，必须带上口语说明；若哪天又被改回裸术语，这里会失败。
  const expectations: Array<[string, RegExp]> = [
    ['本科或专科（本专科，含第二学士学位、预科生）', /本科|专科/],
    ['高职院校，即大专（高等职业学校）', /大专/],
    ['大专层次的专科学校（高等专科学校）', /大专/],
    ['在读、有正式学籍（在籍在校）', /学籍/],
    ['已被学校认定为家庭经济困难（已认定）', /认定/],
  ];
  for (const [option, pattern] of expectations) {
    assert.ok(allOptions.has(option), `缺少口语化选项「${option}」`);
    assert.match(option, pattern);
  }
});
